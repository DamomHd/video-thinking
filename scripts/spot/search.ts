/**
 * 音效检索 (sfx search)
 * 对标 architecture.html §15.3：检索 → 打分 → 写候选池。
 * 与原版的一个有意差别：候选池和素材库按「影片」隔离到 out/<片>/candidates.json，
 * 不再跨片共用同名槽（原版 §21 P2 把这一点列为已知风险）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { FilmAdapter, PaletteSpec } from '../../src/shared/types.js';
import { Candidate } from '../epidemic/scoring.js';
import { SfxProvider, SfxSource, resolveSfxProvider } from '../epidemic/provider.js';
import { startTimer } from './timing.js';

export type CandidatePool = Record<string, Candidate[]>;

export function poolPath(filmId: string): string {
  return path.join(process.cwd(), 'out', filmId, 'candidates.json');
}

export function readPool(filmId: string): CandidatePool {
  const p = poolPath(filmId);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

export function writePool(filmId: string, pool: CandidatePool): void {
  const p = poolPath(filmId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(pool, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

export interface SearchResult {
  provider: string;
  bySlot: Record<string, { total: number; top?: Candidate }>;
}

/**
 * 检索若干槽（不传则全部）。
 * 追加语义：已有候选原样排在前面，本次只把没见过的条目接在后面 ——
 * 所以报告里的名次 ≠ pick 用的下标，pick 一律用槽内的首位。
 */
export function searchSlots(
  adapter: FilmAdapter,
  slots: string[] = [],
  options: {
    provider?: SfxProvider;
    /** 每轮从没见过的条目里取几条接在后面（附录 B 的 SFX_KEEP，缺省 8） */
    keep?: number;
    /** 只对前几条拉预览做声学画像（附录 B 的 SFX_PREVIEW，缺省 6） */
    preview?: number;
    forceLocal?: boolean;
    source?: SfxSource;
  } = {}
): SearchResult {
  const timer = startTimer('sfx search');
  const provider = options.provider ?? resolveSfxProvider({ forceLocal: options.forceLocal, source: options.source });
  timer.step('provider');
  const pool = readPool(adapter.filmId);
  const targets = slots.length > 0 ? slots : Object.keys(adapter.palette);
  const bySlot: SearchResult['bySlot'] = {};

  const keep = options.keep ?? Number(process.env.SFX_KEEP ?? process.env.VW_SFX_KEEP ?? 8);
  const preview = options.preview ?? Number(process.env.SFX_PREVIEW ?? process.env.VW_SFX_PREVIEW ?? 6);

  for (const slot of targets) {
    const spec: PaletteSpec | undefined = adapter.palette[slot];
    if (!spec) {
      console.warn(`[sfx search] 采购单里没有槽 '${slot}'，跳过`);
      continue;
    }

    const fresh = provider.searchSfx(spec, { keep, preview });
    timer.step(`检索 ${slot}`);
    const existing = pool[slot] ?? [];
    const seen = new Set(existing.map((c) => c.id));
    /**
     * 追加语义（§15.3）：已有候选**原样**排在前面，本次只把没见过的接在后面。
     *
     * 不能对整池重排 —— 首位就是当前选中，重排会把人手动置顶的那条
     * （vw sfx add / 工作台「用这个」）冲掉；而且文档里那条坑
     * 「新候选追加在末尾，所以报告里的名次 ≠ pick 用的下标」
     * 本来就建立在不重排的前提上。
     * 新来的这批内部按分排一下，再整体接到尾巴上。
     */
    const appended = fresh
      .filter((c) => !seen.has(c.id))
      .sort((a, b) => (b.score ?? -99) - (a.score ?? -99));
    pool[slot] = [...existing, ...appended];

    bySlot[slot] = { total: pool[slot].length, top: pool[slot][0] };
    console.log(
      `[sfx search] 槽 ${slot}: 新增 ${appended.length} / 共 ${pool[slot].length} 条` +
        (pool[slot][0] ? `，首位「${pool[slot][0].title}」(${pool[slot][0].score})` : '')
    );
  }

  writePool(adapter.filmId, pool);
  timer.step('写候选池');
  timer.done(`sfx search ${adapter.filmId}`);
  return { provider: provider.name, bySlot };
}

/** 把某个候选顶到首位（工作台的「用这个」/ 命令行的 add） */
export function promoteCandidate(filmId: string, slot: string, candidateId: string): boolean {
  const pool = readPool(filmId);
  const list = pool[slot];
  if (!list) return false;
  const idx = list.findIndex((c) => c.id === candidateId);
  if (idx < 0) return false;
  const [picked] = list.splice(idx, 1);
  list.unshift(picked);
  writePool(filmId, pool);
  return true;
}

/**
 * 相似检索 (§15.3 的 similar)
 * 以槽内当前首位（或指定候选）为种子找相似音效，按追加语义接到池尾。
 */
export function searchSimilarForSlot(
  adapter: FilmAdapter,
  slot: string,
  options: { provider?: SfxProvider; seedId?: string; first?: number; forceLocal?: boolean } = {}
): { ok: boolean; added: number; total: number; error?: string } {
  const provider = options.provider ?? resolveSfxProvider({ forceLocal: options.forceLocal });
  const spec = adapter.palette[slot];
  if (!spec) return { ok: false, added: 0, total: 0, error: `采购单里没有槽 '${slot}'` };
  if (!provider.searchSimilar) {
    return { ok: false, added: 0, total: 0, error: `${provider.label} 不支持相似检索` };
  }

  const pool = readPool(adapter.filmId);
  const list = pool[slot] ?? [];
  const seedId = options.seedId ?? list[0]?.id;
  if (!seedId) {
    return { ok: false, added: 0, total: 0, error: `槽 '${slot}' 还没有候选，先跑 vw sfx search` };
  }

  const fresh = provider.searchSimilar(spec, seedId, options.first ?? 12);
  const seen = new Set(list.map((c) => c.id));
  const appended = fresh
    .filter((c) => !seen.has(c.id))
    .sort((a, b) => (b.score ?? -99) - (a.score ?? -99));
  pool[slot] = [...list, ...appended];
  writePool(adapter.filmId, pool);

  return { ok: true, added: appended.length, total: pool[slot].length };
}

/**
 * 补齐候选 (§15.3 的 backfill)
 * 只对候选数不足 min 的槽再搜一轮，已有的原样保留。
 */
export function backfillSlots(
  adapter: FilmAdapter,
  options: { provider?: SfxProvider; min?: number; keep?: number; preview?: number; forceLocal?: boolean } = {}
): { scanned: number; refilled: { slot: string; before: number; after: number }[] } {
  const min = options.min ?? 4;
  const pool = readPool(adapter.filmId);
  const thin = Object.keys(adapter.palette).filter((s) => (pool[s]?.length ?? 0) < min);

  const refilled: { slot: string; before: number; after: number }[] = [];
  if (thin.length === 0) return { scanned: Object.keys(adapter.palette).length, refilled };

  const before = new Map(thin.map((s) => [s, pool[s]?.length ?? 0]));
  searchSlots(adapter, thin, options);

  const after = readPool(adapter.filmId);
  for (const s of thin) {
    refilled.push({ slot: s, before: before.get(s) ?? 0, after: after[s]?.length ?? 0 });
  }
  return { scanned: Object.keys(adapter.palette).length, refilled };
}
