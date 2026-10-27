/**
 * 流动原语：沿路径跑的光点、潮水式铺开、滚动计数
 *
 * 参考片的画面里一直有东西在「流」：轨道上的黄色光点一直在跑；
 * 3,557 个点从左往右像潮水一样铺开，前沿是虚的，右边计数器同步滚（172 → 1,762 → 3,557）。
 * 这些是让静止段「活着」的东西 —— 主体停住让人读字，但流动不停。
 *
 * 全部是 t 的纯函数，同一帧渲两次结果一致。
 */

import { clamp01, easeInOutCubic } from './anim';

const frac = (v: number): number => v - Math.floor(v);

export interface Pulse {
  /** 沿路径的位置 0..1 */
  u: number;
  /** 两端淡入淡出后的亮度 0..1 —— 光点从路径起点「长」出来、在终点「熄」掉，不会凭空出现 */
  alpha: number;
}

/**
 * count 个光点等距循环跑，每个跑完全程用 periodSec。
 * startSec 之前没有光点；之后第一轮从起点依次发出（不会一开场就铺满整条路）。
 */
export function pulses(
  t: number,
  options: { count?: number; periodSec?: number; startSec?: number; edge?: number } = {}
): Pulse[] {
  const count = Math.max(1, options.count ?? 3);
  const period = Math.max(0.1, options.periodSec ?? 4);
  const start = options.startSec ?? 0;
  const edge = options.edge ?? 0.08;
  const run = (t - start) / period;
  const out: Pulse[] = [];
  for (let k = 0; k < count; k++) {
    const lap = run - k / count;
    if (lap < 0) continue;
    const u = frac(lap);
    const alpha = Math.min(clamp01(u / edge), clamp01((1 - u) / edge));
    out.push({ u, alpha });
  }
  return out;
}

/**
 * 潮水式铺开：n 个元素按顺序被一道前沿扫过，前沿宽 soft（占总数的比例）。
 * 返回第 i 个元素的进度 0..1 —— 前沿里的元素是半亮的，所以边缘是虚的。
 */
export function tide(
  i: number,
  n: number,
  t: number,
  from: number,
  durSec: number,
  options: { soft?: number; ease?: (p: number) => number } = {}
): number {
  const soft = Math.max(1e-3, options.soft ?? 0.12);
  const ease = options.ease ?? easeInOutCubic;
  const front = ease(clamp01((t - from) / Math.max(1e-6, durSec))) * (1 + soft);
  const pos = n > 1 ? i / (n - 1) : 0;
  return clamp01((front - pos) / soft);
}

/** 潮水扫到第几个了 —— 给计数器用，保证数字和画面上铺开的点一致 */
export function tideCount(n: number, t: number, from: number, durSec: number, options: { soft?: number; ease?: (p: number) => number } = {}): number {
  const soft = Math.max(1e-3, options.soft ?? 0.12);
  const ease = options.ease ?? easeInOutCubic;
  const front = ease(clamp01((t - from) / Math.max(1e-6, durSec))) * (1 + soft);
  // 进度过半算「点亮」：pos ≤ front − soft/2
  const lit = Math.floor((front - soft / 2) * (n - 1)) + 1;
  return Math.max(0, Math.min(n, lit));
}

/* 数字滚动用 anim.ts 已有的 countUp(t − 起点, 起始值, 目标值, 时长)，这里不再重复一份 */

/** 千分位：652445 → "652,445" */
export function thousands(v: number, decimals = 0): string {
  const [i, d] = v.toFixed(decimals).split('.');
  const body = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return d ? `${body}.${d}` : body;
}
