/**
 * 双时钟时间映射 (Time Warp · 乐谱时间 ↔ 放映时间)
 * 对标 architecture.html §12「双时钟」与 §14.3 的 timewarp.ts：
 *   乐谱时间 score = 画面编舞时刻（各幕常量、拍点、音效都在这个轴上）
 *   放映时间 film  = 成片时间轴（配乐、成片都在这个轴上）
 *   sync.json 的 knots 是两者之间唯一的映射；恒等时 IS_IDENTITY 为真。
 * 渲染端、脚本、工作台共用这一个模块，保证「所听即所得」。
 */

import { knotMap, rampMap, Knot, TimeMapFn, outerOf } from './warp';
import { SyncFile } from './types';

export interface TimeWarp {
  /** 乐谱秒 → 放映秒 */
  toFilm: TimeMapFn;
  /** 放映秒 → 乐谱秒 */
  toScore: TimeMapFn;
  /** 是否恒等映射（LoomCare 口径：配乐迁就画面时为真） */
  IS_IDENTITY: boolean;
  knots: Knot[];
}

export const IDENTITY_WARP: TimeWarp = {
  toFilm: (t) => t,
  toScore: (t) => t,
  IS_IDENTITY: true,
  knots: [],
};

/**
 * 从 sync.json 的 knots 构造映射。
 * knots 每项是 [乐谱秒, 放映秒]；少于 2 个节点或全在对角线上时返回恒等映射。
 */
export function buildTimeWarp(
  sync: Pick<SyncFile, 'knots'> | undefined,
  options: { mode?: 'knot' | 'ramp' } = {}
): TimeWarp {
  const raw = sync?.knots ?? [];
  if (raw.length < 2) return IDENTITY_WARP;

  const isIdentity = raw.every(([score, film]) => Math.abs(score - film) < 1e-4);
  if (isIdentity) return IDENTITY_WARP;

  // warp.ts 的 knotMap 接受 {outer → inner}；这里构造两个方向
  const scoreToFilm: Knot[] = raw.map(([score, film]) => ({ outer: score, inner: film }));
  const filmToScore: Knot[] = raw.map(([score, film]) => ({ outer: film, inner: score }));

  const build = options.mode === 'ramp' ? rampMap : knotMap;

  return {
    toFilm: build(scoreToFilm),
    toScore: build(filmToScore),
    IS_IDENTITY: false,
    knots: scoreToFilm,
  };
}

/** 反解：给定放映秒，求对应的乐谱秒（当映射不便直接求逆时使用二分法） */
export function scoreOf(warp: TimeWarp, filmSec: number, searchRange: [number, number]): number {
  if (warp.IS_IDENTITY) return filmSec;
  return outerOf(warp.toFilm, filmSec, searchRange);
}

/** 瞬时速率 d(film)/d(score)，工作台按这个值设 playbackRate */
export function rateAt(warp: TimeWarp, scoreSec: number, dt = 0.005): number {
  if (warp.IS_IDENTITY) return 1;
  return (warp.toFilm(scoreSec + dt) - warp.toFilm(scoreSec)) / dt;
}
