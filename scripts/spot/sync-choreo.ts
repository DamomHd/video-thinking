/**
 * 编舞增量同步 (sfx:sync-choreo)
 * 对标 architecture.html §15.7 的四步：
 *   ① 比对上一版 spots.prev.json，算出新增 / 删除 / 挪动
 *   ② 缺素材的新槽自动 search + pick-all
 *   ③ 重跑计划，offsets / gains / fades / ducks 按 key 迁移
 *   ④ 配乐段按 ref 重新解析，区间或主高潮变了的段重新求解
 */

import fs from 'node:fs';
import path from 'node:path';
import { getFilm } from '../../src/films.js';
import { TruthManager } from './truth.js';
import { buildSfxPlan, migrateParamsToPlan } from './plan.js';
import { searchSlots } from './search.js';
import { pickAll } from './pick.js';
import { SpotAnnotation, FilmAdapter } from '../../src/shared/types.js';
import { analyzeCue } from '../sync/analyze.js';
import { solveCues } from '../sync/solve.js';

export interface ChoreoDiff {
  added: SpotAnnotation[];
  removed: SpotAnnotation[];
  moved: { prev: SpotAnnotation; current: SpotAnnotation; deltaSec: number }[];
  unchanged: SpotAnnotation[];
}

/** 比对两版 spots 差异（key 口径与计划一致：槽 + 事件名） */
export function diffSpots(prevSpots: SpotAnnotation[], curSpots: SpotAnnotation[]): ChoreoDiff {
  const prevMap = new Map(prevSpots.map((s) => [`${s.slot}·${s.id}`, s]));
  const curMap = new Map(curSpots.map((s) => [`${s.slot}·${s.id}`, s]));

  const added: SpotAnnotation[] = [];
  const removed: SpotAnnotation[] = [];
  const moved: ChoreoDiff['moved'] = [];
  const unchanged: SpotAnnotation[] = [];

  for (const cur of curSpots) {
    const prev = prevMap.get(`${cur.slot}·${cur.id}`);
    if (!prev) added.push(cur);
    else if (Math.abs(cur.fromSec - prev.fromSec) > 0.005) {
      moved.push({ prev, current: cur, deltaSec: cur.fromSec - prev.fromSec });
    } else unchanged.push(cur);
  }
  for (const prev of prevSpots) {
    if (!curMap.has(`${prev.slot}·${prev.id}`)) removed.push(prev);
  }

  return { added, removed, moved, unchanged };
}

/** 新增事件涉及的、素材还没采购的槽 */
export function missingSlots(adapter: FilmAdapter, added: SpotAnnotation[]): string[] {
  const pub = path.join(process.cwd(), 'public');
  const out = new Set<string>();
  for (const s of added) {
    const spec = adapter.palette[s.slot];
    const single = path.join(pub, `sfx-lib/epidemic/${s.slot}.wav`);
    const first = path.join(pub, `sfx-lib/epidemic/${s.slot}-1.wav`);
    if (!fs.existsSync(single) && !fs.existsSync(first)) out.add(spec?.slot ?? s.slot);
  }
  return [...out];
}

export async function syncChoreography(
  filmId: string,
  options: { skipPurchase?: boolean; forceLocal?: boolean } = {}
) {
  const film = getFilm(filmId);
  const adapter = await film.getAdapter();
  const truthMgr = new TruthManager(filmId);
  const truth = truthMgr.readAll();

  const outDir = path.join(process.cwd(), 'out', filmId);
  fs.mkdirSync(outDir, { recursive: true });
  const prevSpotsPath = path.join(outDir, 'spots.prev.json');

  let prevSpots: SpotAnnotation[] = [];
  if (fs.existsSync(prevSpotsPath)) {
    try {
      prevSpots = JSON.parse(fs.readFileSync(prevSpotsPath, 'utf-8'));
    } catch {
      prevSpots = [];
    }
  }

  const curSpots = adapter.spots();
  const diff = diffSpots(prevSpots, curSpots);

  console.log(`\n========================================`);
  console.log(`[vw spot sync-choreo] 编舞增量同步: 影片=${filmId}`);
  console.log(`  ① 比对: 新增 ${diff.added.length} / 删除 ${diff.removed.length} / 挪动 ${diff.moved.length} / 原样 ${diff.unchanged.length}`);

  // ② 缺素材的新槽自动采购
  const needPurchase = missingSlots(adapter, diff.added);
  if (needPurchase.length > 0 && !options.skipPurchase) {
    console.log(`  ② 采购: ${needPurchase.join(', ')}`);
    searchSlots(adapter, needPurchase, { forceLocal: options.forceLocal });
    pickAll(adapter, needPurchase, { forceLocal: options.forceLocal });
  } else {
    console.log(`  ② 采购: 无需补素材`);
  }

  // ③ 重跑计划 + 按 key 迁移手动参数
  const { plan, skippedCovered, skippedUnpurchased, byLayer } = buildSfxPlan(adapter, {
    prevPlan: truth.plan,
  });
  const { dropped } = migrateParamsToPlan(plan, truth);

  truth.plan = plan;
  truthMgr.write('plan', truth.plan);
  truthMgr.write('offsets', truth.offsets);
  truthMgr.write('gains', truth.gains);
  truthMgr.write('fades', truth.fades);
  truthMgr.write('ducks', truth.ducks);

  console.log(
    `  ③ 计划: ${plan.length} 条 (${Object.entries(byLayer).map(([l, n]) => `${l} ${n}`).join(' / ')})` +
      `；跳过已覆盖 ${skippedCovered.length} 条、未采购 ${skippedUnpurchased.length} 条` +
      `；清理孤儿调参 ${dropped.length} 项`
  );

  // ④ 配乐段 ref 重新解析 + 重新求解
  let resolvedRefs = 0;
  for (const cue of truth.music.cues) {
    for (const ref of [cue.in, cue.out, cue.climax, cue.climax2]) {
      if (!ref) continue;
      const resolved = resolveRef(adapter, ref.ref);
      if (resolved !== null && Math.abs(resolved - ref.sec) > 1e-4) {
        ref.sec = resolved;
        resolvedRefs++;
      }
    }
  }
  truthMgr.write('music', truth.music);

  const report = solveCues(
    truth.music.cues,
    adapter.hits(),
    (cue) => analyzeCue(filmId, cue.id, cue.track?.file, cue.track?.bpm ?? 120, cue.out.sec - cue.in.sec),
    adapter.zones(),
    30
  );
  truth.sync = {
    knots: report.knots.map((k) => [k.inner, k.outer] as [number, number]),
    anchors: report.anchors.map((a) => ({
      hit: a.hitId,
      cueId: 'c1',
      targetSec: a.filmSec,
      musicSec: a.musicSec,
      musicKind: a.matchedKind,
      errMs: Math.round(a.residualSec * 1000),
      priority: a.priority,
      status: a.downgraded ? ('downgraded' as const) : ('locked' as const),
    })),
    report: {
      scoreSync: report.scoreSync,
      lockedCount: report.anchors.filter((a) => !a.downgraded).length,
      downgradedCount: report.downgradedCount,
      droppedCount: report.droppedCount,
    },
  };
  truthMgr.write('sync', truth.sync);
  console.log(
    `  ④ 对拍: ref 重解析 ${resolvedRefs} 处；scoreSync ${report.scoreSync}` +
      `（锚定 ${report.matchedCount} / 降级 ${report.downgradedCount} / 放弃 ${report.droppedCount}，网格 ${report.gridSource}）`
  );

  fs.writeFileSync(prevSpotsPath, JSON.stringify(curSpots, null, 2), 'utf-8');
  console.log(`  ✓ 基准快照 → ${prevSpotsPath}`);
  console.log(`========================================\n`);

  return { diff, planCount: plan.length, syncReport: truth.sync.report };
}

/** 解析 "SC.xxx" / "K.xxx" 形式的 ref 到秒；解析不出来返回 null */
export function resolveRef(adapter: FilmAdapter, ref: string): number | null {
  const [kind, name] = ref.split('.');
  if (kind === 'SC') {
    if (name === 'end') return adapter.timeline.totalSeconds;
    if (name === 'start') return 0;
    return adapter.SC[name] ?? null;
  }
  if (kind === 'K') return adapter.K[name] ?? null;
  return null;
}
