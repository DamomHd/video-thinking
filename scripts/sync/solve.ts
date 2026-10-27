/**
 * 多目标对拍规划求解器 (Sync Beat Alignment Solver)
 * 对标 architecture.html §16.6：
 *   1. 输入视觉拍点 HITS（P0/P1/P2，容差 1/2/4 帧）与弹性区 ZONES
 *   2. 每个拍点在左右弹性预算内取位移最小的候选；drop 可配 drop / 强跃升 / 段落边界，
 *      downbeat 配小节头，beat 配任意拍
 *   3. 位移经 ElasticSolver 按 e·L 比例分摊，超上限夹紧、余量再分、取整后总和守恒
 *   4. 降级与放弃分开记原因：「网格不可行（两侧刚性）」还是「弹性预算不够」
 *   5. knots 区内匀速、节点落在各区边界
 */

import fs from 'node:fs';
import path from 'node:path';
import { VisualHit, MusicCue, SyncFile } from '../../src/shared/types.js';
import { BeatGrid } from './analyze.js';
import { ElasticSolver, ZoneInput, splitZonesAt } from './zones.js';

/** 弹性区输入（kind 决定弹性档位与上限，见 zones.ts 的 ZONE_SPECS） */
export type Zone = ZoneInput;

/** 优先级容差（帧 @30fps），照抄原表 */
export const TOLERANCE_FRAMES: Record<'P0' | 'P1' | 'P2', number> = { P0: 1, P1: 2, P2: 4 };

export interface SyncAnchor {
  hitId: string;
  want: string;
  /** 乐谱时间（画面编舞时刻，秒） */
  filmSec: number;
  /** 命中的音乐时刻（秒） */
  musicSec: number;
  deltaSec: number;
  deltaFrames30: number;
  /** 分摊之后的残差（秒），容差内才保留 */
  residualSec: number;
  priority: 'P0' | 'P1' | 'P2';
  matchedKind: 'drop' | 'downbeat' | 'beat';
  downgraded?: boolean;
}

export interface DroppedHit {
  hitId: string;
  reason: string;
  priority: string;
}

export interface SyncReport {
  scoreSync: number;
  totalHits: number;
  matchedCount: number;
  downgradedCount: number;
  droppedCount: number;
  anchors: SyncAnchor[];
  droppedHits: DroppedHit[];
  knots: { outer: number; inner: number }[];
  /** 网格可信度：synthetic 表示还没选曲，报告仅供可行性预估 */
  gridSource: 'measured' | 'synthetic';
  zoneReport?: ReturnType<ElasticSolver['report']>;
}

interface Candidate {
  sec: number;
  kind: 'drop' | 'downbeat' | 'beat';
  /** 0 = 首选，1 = 降级一级，2 = 降级两级 */
  tier: number;
}

/** 按 want 列出分层候选：先首选、再降级 */
function candidatesFor(hit: VisualHit, grid: BeatGrid, hitSec: number): Candidate[] {
  const out: Candidate[] = [];
  const want = hit.want as string;

  if (want === 'drop') {
    out.push({ sec: grid.dropSec, kind: 'drop', tier: 0 });
    for (const j of grid.jumps ?? []) out.push({ sec: j, kind: 'drop', tier: 1 });
    for (const s of grid.sections ?? []) out.push({ sec: s.startSec, kind: 'downbeat', tier: 1 });
    for (const db of grid.downbeats) out.push({ sec: db, kind: 'downbeat', tier: 1 });
    for (const b of grid.beats) out.push({ sec: b, kind: 'beat', tier: 2 });
  } else if (want === 'downbeat') {
    for (const db of grid.downbeats) out.push({ sec: db, kind: 'downbeat', tier: 0 });
    for (const b of grid.beats) out.push({ sec: b, kind: 'beat', tier: 1 });
  } else if (want === 'end' || want === 'finish') {
    if (grid.endingSec !== undefined) out.push({ sec: grid.endingSec, kind: 'downbeat', tier: 0 });
    out.push({ sec: hitSec, kind: 'beat', tier: 0 });
    for (const b of grid.beats) out.push({ sec: b, kind: 'beat', tier: 1 });
  } else {
    for (const b of grid.beats) out.push({ sec: b, kind: 'beat', tier: 0 });
  }
  return out;
}

/**
 * 执行多目标对拍求解。
 * zones 为空时按「全片刚性」处理（最保守），只有容差内的锚点能成立。
 */
export function solveBeatAlignment(
  hits: VisualHit[],
  grid: BeatGrid,
  zones: Zone[] = [],
  fps = 30,
  span?: [number, number]
): SyncReport {
  const hitSecs = hits.map((h) => h.filmSec ?? h.sec ?? 0);
  const spanFrom = span ? span[0] : 0;
  const spanTo = span
    ? span[1]
    : Math.max(grid.totalSec, ...hitSecs, 0.001);

  // 每个锚点都切成区边界：否则落在弹性区内部的锚点只能吃到该区的一部分形变
  const baseZones: Zone[] =
    zones.length > 0
      ? zones
      : [{ name: 'all-rigid', kind: 'video', fromSec: spanFrom, toSec: spanTo }];
  const splitted = splitZonesAt(baseZones, hitSecs);
  const elastic = new ElasticSolver(splitted, spanTo, spanFrom);

  const anchors: SyncAnchor[] = [];
  const droppedHits: DroppedHit[] = [];
  let downgradedCount = 0;
  let totalDeltaFrames = 0;

  // 必须按乐谱时间升序处理：弹性预算只向上一个锚点之后的区段借
  const ordered = [...hits].sort(
    (a, b) => (a.filmSec ?? a.sec ?? 0) - (b.filmSec ?? b.sec ?? 0)
  );

  for (const hit of ordered) {
    const priority = hit.priority || 'P1';
    const hitSec = hit.filmSec ?? hit.sec ?? 0;
    const tolSec = TOLERANCE_FRAMES[priority] / fps;

    const cands = candidatesFor(hit, grid, hitSec);
    if (cands.length === 0) {
      droppedHits.push({ hitId: hit.id, reason: '无可用音乐网格候选', priority });
      continue;
    }

    // 当前位置在放映时间轴上的落点
    const alreadyShift = elastic.cumulativeAt(hitSec);
    const upBudget = elastic.budgetFor(hitSec, 1);
    const downBudget = elastic.budgetFor(hitSec, -1);

    // 逐级挑：先首选层，再降级层；同层取位移最小
    let chosen: Candidate | null = null;
    let chosenNeed = 0;
    for (const tier of [0, 1, 2]) {
      let best: Candidate | null = null;
      let bestNeed = Infinity;
      for (const c of cands) {
        if (c.tier !== tier) continue;
        // 需要的累计位移：让画面时刻 hitSec 在放映轴上落到 c.sec
        const need = c.sec - hitSec;
        const extra = need - alreadyShift;
        const reachable =
          Math.abs(extra) <= tolSec ||
          (extra > 0 ? extra <= upBudget + tolSec : -extra <= downBudget + tolSec);
        if (!reachable) continue;
        if (Math.abs(extra) < Math.abs(bestNeed)) {
          bestNeed = extra;
          best = c;
        }
      }
      if (best) {
        chosen = best;
        chosenNeed = best.sec - hitSec;
        break;
      }
    }

    if (!chosen) {
      // 够不着：区分「两侧刚性」和「预算不够」
      const rigid = upBudget <= 1e-9 && downBudget <= 1e-9;
      droppedHits.push({
        hitId: hit.id,
        reason: rigid
          ? '网格不可行（两侧刚性，一帧不能动）'
          : `弹性预算不够（可借 +${upBudget.toFixed(3)}s / −${downBudget.toFixed(3)}s）`,
        priority,
      });
      continue;
    }

    const alloc = elastic.allocate(hitSec, chosenNeed, fps);
    const residual = chosenNeed - elastic.cumulativeAt(hitSec);

    if (Math.abs(residual) > tolSec) {
      droppedHits.push({
        hitId: hit.id,
        reason:
          alloc.reason === 'rigid-grid'
            ? `网格不可行（两侧刚性），残差 ${(residual * 1000).toFixed(0)}ms 超容差 ${(tolSec * 1000).toFixed(0)}ms`
            : `弹性预算不够，分摊后残差 ${(residual * 1000).toFixed(0)}ms 超容差 ${(tolSec * 1000).toFixed(0)}ms`,
        priority,
      });
      continue;
    }

    const isDowngraded = chosen.tier > 0 || chosen.kind !== (hit.want as string);
    if (isDowngraded) downgradedCount++;

    const deltaFrames = Math.round(Math.abs(chosenNeed) * fps);
    totalDeltaFrames += deltaFrames;

    anchors.push({
      hitId: hit.id,
      want: hit.want,
      filmSec: hitSec,
      musicSec: Math.round(chosen.sec * 10000) / 10000,
      deltaSec: Math.round(chosenNeed * 10000) / 10000,
      deltaFrames30: deltaFrames,
      residualSec: Math.round(residual * 100000) / 100000,
      priority,
      matchedKind: chosen.kind,
      downgraded: isDowngraded || undefined,
    });
  }

  const scoreSync = computeScoreSync(anchors, droppedHits, downgradedCount, totalDeltaFrames);

  return {
    scoreSync,
    totalHits: hits.length,
    matchedCount: anchors.length,
    downgradedCount,
    droppedCount: droppedHits.length,
    anchors,
    droppedHits,
    knots: elastic.knots(),
    gridSource: grid.source,
    zoneReport: elastic.report(),
  };
}

/** scoreSync = 100·P0 + 12·P1 + 3·P2 − 15·放弃的P0/P1 − 4·降级 − 0.05·Σ|Δ| */
export function computeScoreSync(
  anchors: SyncAnchor[],
  dropped: DroppedHit[],
  downgradedCount: number,
  totalDeltaFrames: number
): number {
  let p0 = 0;
  let p1 = 0;
  let p2 = 0;
  for (const a of anchors) {
    if (a.priority === 'P0') p0++;
    else if (a.priority === 'P1') p1++;
    else p2++;
  }
  let droppedCrucial = 0;
  for (const d of dropped) {
    if (d.priority === 'P0' || d.priority === 'P1') droppedCrucial++;
  }
  return Number(
    (
      100 * p0 +
      12 * p1 +
      3 * p2 -
      15 * droppedCrucial -
      4 * downgradedCount -
      0.05 * totalDeltaFrames
    ).toFixed(2)
  );
}

export interface MultiCueSyncReport extends SyncReport {
  byCue: Record<string, SyncReport>;
}

/**
 * 多段配乐对拍求解 (solveCues)
 * 1. 单段时与 solveBeatAlignment 逐字段相同
 * 2. 段起点是固定节点，拍点按段归属，锚点不越段
 * 3. 每段合成出点锚 cue:<id>:out（容差 2 帧）
 * 4. 没配曲的段跳过，按恒等直通
 */
export function solveCues(
  cues: MusicCue[],
  hits: VisualHit[],
  getGridForCue: (cue: MusicCue) => BeatGrid,
  zones: Zone[] = [],
  fps = 30
): MultiCueSyncReport {
  if (cues.length <= 1) {
    const singleCue = cues[0];
    const grid = singleCue
      ? getGridForCue(singleCue)
      : {
          beats: [],
          downbeats: [],
          dropSec: 0,
          totalSec: 30,
          bpm: 108,
          beatSec: 0.5,
          barSec: 2.0,
          source: 'synthetic' as const,
        };
    const rep = solveBeatAlignment(hits, grid, zones, fps);
    return { ...rep, byCue: singleCue ? { [singleCue.id]: rep } : {} };
  }

  const allAnchors: SyncAnchor[] = [];
  const allDropped: DroppedHit[] = [];
  const allKnots: { outer: number; inner: number }[] = [];
  const byCue: Record<string, SyncReport> = {};

  let totalDowngraded = 0;
  let totalDeltaFrames = 0;
  let gridSource: 'measured' | 'synthetic' = 'measured';

  for (const cue of cues) {
    // 没配曲的段：恒等直通，段起止都是固定节点
    if (!cue.track) {
      allKnots.push({ outer: cue.in.sec, inner: cue.in.sec });
      allKnots.push({ outer: cue.out.sec, inner: cue.out.sec });
      continue;
    }

    const grid = getGridForCue(cue);
    if (grid.source === 'synthetic') gridSource = 'synthetic';

    const cueHits = hits.filter((h) => {
      const sec = h.filmSec ?? h.sec ?? 0;
      return sec >= cue.in.sec && sec < cue.out.sec;
    });

    const finishHit: VisualHit = {
      id: `cue:${cue.id}:out`,
      want: 'finish' as VisualHit['want'],
      filmSec: cue.out.sec,
      sec: cue.out.sec,
      priority: 'P1',
    };

    // 段内弹性区：只取落在本段区间内的部分；段边界因此天然是固定节点
    const cueZones = clipZones(zones, cue.in.sec, cue.out.sec);
    const cueRep = solveBeatAlignment([...cueHits, finishHit], grid, cueZones, fps, [
      cue.in.sec,
      cue.out.sec,
    ]);
    byCue[cue.id] = cueRep;

    allAnchors.push(...cueRep.anchors);
    allDropped.push(...cueRep.droppedHits);
    allKnots.push(...cueRep.knots);
    totalDowngraded += cueRep.downgradedCount;
    for (const a of cueRep.anchors) totalDeltaFrames += a.deltaFrames30;
  }

  allKnots.sort((a, b) => a.outer - b.outer);
  const dedupKnots: { outer: number; inner: number }[] = [];
  for (const k of allKnots) {
    if (
      dedupKnots.length === 0 ||
      Math.abs(dedupKnots[dedupKnots.length - 1].outer - k.outer) > 0.001
    ) {
      dedupKnots.push(k);
    }
  }

  return {
    scoreSync: computeScoreSync(allAnchors, allDropped, totalDowngraded, totalDeltaFrames),
    totalHits: hits.length,
    matchedCount: allAnchors.length,
    downgradedCount: totalDowngraded,
    droppedCount: allDropped.length,
    anchors: allAnchors,
    droppedHits: allDropped,
    knots: dedupKnots,
    gridSource,
    byCue,
  };
}

/** 把全片弹性区裁剪到某个配乐段的区间内（保持全片绝对坐标；段边界成为固定节点） */
export function clipZones(zones: Zone[], fromSec: number, toSec: number): Zone[] {
  const out: Zone[] = [];
  for (const z of zones) {
    const a = Math.max(z.fromSec, fromSec);
    const b = Math.min(z.toSec, toSec);
    if (b - a > 1e-6) {
      const parentLen = z.toSec - z.fromSec;
      out.push({
        ...z,
        fromSec: a,
        toSec: b,
        capShare: parentLen > 0 ? (z.capShare ?? 1) * ((b - a) / parentLen) : (z.capShare ?? 1),
      });
    }
  }
  return out;
}

/** 写入一份恒等映射的 sync.json (sync:clear) */
export function clearSync(filmId: string, totalSec = 30): void {
  const syncJsonPath = path.join(process.cwd(), 'src', 'films', filmId, 'audio', 'sync.json');
  const identity = {
    knots: [
      [0, 0],
      [totalSec, totalSec],
    ],
    anchors: [],
    report: {
      scoreSync: 0,
      lockedCount: 0,
      downgradedCount: 0,
      droppedCount: 0,
    },
  };
  fs.writeFileSync(syncJsonPath, JSON.stringify(identity, null, 2), 'utf-8');
}

/**
 * 把求解报告转成 sync.json 的结构。
 *
 * 这段转换原来内联在 CLI 里，落定改编时又要用一次 —— 抄第二份迟早会分叉，
 * 所以提到这里共用。顺带修掉原来把 cueId 写死成 'c1' 的问题：
 * 多段配乐时每个锚点该归属哪一段，按 byCue 的归属算，算不出来才按区间兜底。
 */
export function toSyncFile(
  report: MultiCueSyncReport,
  hits: VisualHit[],
  cues: MusicCue[]
): SyncFile {
  // 锚点 → 所属段：byCue 里哪一段的 anchors 含有这个 hitId
  const cueOf = new Map<string, string>();
  for (const [cueId, sub] of Object.entries(report.byCue ?? {})) {
    for (const a of sub.anchors) cueOf.set(a.hitId, cueId);
  }
  const fallbackCue = (filmSec: number): string =>
    cues.find((c) => filmSec >= c.in.sec && filmSec <= c.out.sec)?.id ?? cues[0]?.id ?? 'c1';

  return {
    knots: report.knots.map((k) => [k.inner, k.outer] as [number, number]),
    anchors: report.anchors.map((a) => ({
      hit: a.hitId,
      cueId: cueOf.get(a.hitId) ?? fallbackCue(a.filmSec),
      targetSec: a.filmSec,
      musicSec: a.musicSec,
      musicKind: a.matchedKind,
      errMs: Math.round(a.residualSec * 1000),
      priority: a.priority,
      status: a.downgraded ? ('downgraded' as const) : ('locked' as const),
      note: hits.find((h) => h.id === a.hitId)?.note,
    })),
    report: {
      scoreSync: report.scoreSync,
      lockedCount: report.anchors.filter((a) => !a.downgraded).length,
      downgradedCount: report.downgradedCount,
      droppedCount: report.droppedCount,
    },
  };
}
