/**
 * 形变原语 (FLIP Morph)
 *
 * 参考片 32–34s：21 张接口卡里不迁的那些消失，留下的 6 张**滑**到一排重新排好。
 * 画面上的东西是挪过去的，不是旧的消失、新的再出现 —— 物体连续，观众就不会「换页」。
 *
 * 做法就是 FLIP：同一个 id 在布局 A 和布局 B 里各有一个矩形，
 * 中间帧按进度插值；只在 A 里的退场，只在 B 里的入场。
 * 纯函数：给布局和进度，出每个元素这一帧的矩形和透明度。
 */

import { clamp01, lerp, easeInOutCubic } from './anim';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function lerpRect(a: Rect, b: Rect, p: number): Rect {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}

export type MorphRole = 'stay' | 'exit' | 'enter';

export interface MorphItem {
  id: string;
  role: MorphRole;
  rect: Rect;
  opacity: number;
  /** 本元素自己的进度（已加缓动），供调用方驱动颜色等附加属性 */
  p: number;
}

export interface MorphOptions {
  /**
   * 错峰：0 = 一起动；0.3 = 前后元素的起点最多差 30% 的总进度。
   * 有错峰才像「一张张滑过去」，没有就像整块平移。
   */
  stagger?: number;
  ease?: (p: number) => number;
  /** 退场元素缩到多少（中心不动），默认 0.92 */
  exitScale?: number;
}

function scaleAboutCenter(r: Rect, s: number): Rect {
  return { x: r.x + (r.w * (1 - s)) / 2, y: r.y + (r.h * (1 - s)) / 2, w: r.w * s, h: r.h * s };
}

/**
 * 布局 a → 布局 b 在进度 p 时的样子。
 *
 * 编排顺序是「先走后挪再进」：退场元素用进度前 40%，留下的元素用中间，入场元素用后 40%。
 * 这样腾位置和占位置不会撞在一起。
 */
export function morph(
  a: Record<string, Rect>,
  b: Record<string, Rect>,
  p: number,
  options: MorphOptions = {}
): MorphItem[] {
  const ease = options.ease ?? easeInOutCubic;
  const st = clamp01(options.stagger ?? 0);
  const exitScale = options.exitScale ?? 0.92;
  const ids = [...Object.keys(a), ...Object.keys(b).filter((id) => !(id in a))];
  const stays = ids.filter((id) => id in a && id in b);
  const window = (k: number, n: number, lo: number, hi: number): number => {
    const span = hi - lo;
    const each = span * (1 - st * (n > 1 ? 1 : 0));
    const start = lo + (n > 1 ? (span - each) * (k / (n - 1)) : 0);
    return clamp01((p - start) / Math.max(1e-6, each));
  };

  return ids.map((id): MorphItem => {
    if (id in a && id in b) {
      const q = ease(window(stays.indexOf(id), stays.length, 0.2, 1));
      return { id, role: 'stay', rect: lerpRect(a[id], b[id], q), opacity: 1, p: q };
    }
    if (id in a) {
      const q = ease(clamp01(p / 0.4));
      return { id, role: 'exit', rect: scaleAboutCenter(a[id], lerp(1, exitScale, q)), opacity: 1 - q, p: q };
    }
    const q = ease(clamp01((p - 0.6) / 0.4));
    return { id, role: 'enter', rect: scaleAboutCenter(b[id], lerp(exitScale, 1, q)), opacity: q, p: q };
  });
}

/** 网格布局小工具：n 个格子按 cols 列排在 origin 起的区域里，返回 id → Rect */
export function gridLayout(
  ids: string[],
  options: { x: number; y: number; cols: number; w: number; h: number; gap?: number }
): Record<string, Rect> {
  const gap = options.gap ?? 16;
  const out: Record<string, Rect> = {};
  ids.forEach((id, i) => {
    const c = i % options.cols;
    const r = Math.floor(i / options.cols);
    out[id] = { x: options.x + c * (options.w + gap), y: options.y + r * (options.h + gap), w: options.w, h: options.h };
  });
  return out;
}
