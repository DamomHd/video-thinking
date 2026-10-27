/**
 * 短片几何单源 (rig)
 * 对标 architecture.html §6.5 短片的 rig.ts：经线的几何、图样、织造进度全是纯函数。
 * 这里是 Us 的版本：两条星轨互相缠绕，缠到一起的程度就是"织造进度"。
 */

import { clamp01, createRng, easeInOutCubic } from '../../../shared/anim';

/** 经线数（对标原版 448 根） */
export const WARP_COUNT = 448;
/** 每条经线的采样段数 */
export const WARP_SEGMENTS = 96;
export const FIELD_WIDTH = 7.2;
export const FIELD_HEIGHT = 7.2;

/** 经线的静态属性：相位、半径、速度，全部由种子决定，逐帧不变 */
export interface WarpThread {
  index: number;
  phase: number;
  radius: number;
  speed: number;
  /** 0 = 属于左星，1 = 属于右星 */
  side: 0 | 1;
  /** 是否是金线（追溯用） */
  gold: boolean;
}

let cached: WarpThread[] | null = null;

export function warpThreads(): WarpThread[] {
  if (cached) return cached;
  const rand = createRng(20262024);
  const out: WarpThread[] = [];
  for (let i = 0; i < WARP_COUNT; i++) {
    out.push({
      index: i,
      phase: rand() * Math.PI * 2,
      radius: 0.55 + rand() * 0.45,
      speed: 0.6 + rand() * 0.8,
      side: (i % 2) as 0 | 1,
      // 每 32 根里挑 1 根做金线
      gold: i % 32 === 7,
    });
  }
  cached = out;
  return out;
}

/**
 * 一根经线在织造进度 w、参数 u(0..1) 处的三维坐标。
 * 纯函数：同样的 (thread, u, w) 永远得到同一个点 —— 并发渲染每个标签页都长出同一副线。
 */
export function warpPoint(
  th: WarpThread,
  u: number,
  w: number
): [number, number, number] {
  const sideSign = th.side === 0 ? -1 : 1;
  // 未织造时两束线分居左右；织造进度推高后向中间缠绕
  const merge = easeInOutCubic(clamp01((w - 0.08) / 0.72));
  const spread = (1 - merge) * 3.4;

  const x = (u - 0.5) * FIELD_WIDTH;
  // 绕轴旋转：进度越高缠得越紧
  const twist = th.phase + u * Math.PI * 2 * th.speed + merge * Math.PI * 1.4;
  const r = th.radius * (0.35 + merge * 0.85);
  const y = Math.sin(twist) * r + sideSign * spread * 0.42;
  const z = Math.cos(twist) * r + sideSign * spread * 0.18;

  // 织造锋面：进度之后的部分还没织出来，压回中轴
  const front = clamp01((w * 1.12 - u) * 7);
  return [x, y * front, z * front];
}

/** 这一帧已经织出来的经线段数（锋面位置） */
export function weaveFront(w: number): number {
  return clamp01(w * 1.12);
}

/** 金线追溯：第 i 根金线在进度 w 下的高亮强度 */
export function goldTrace(th: WarpThread, w: number): number {
  if (!th.gold) return 0;
  const onset = 0.55 + (th.index / WARP_COUNT) * 0.3;
  return clamp01((w - onset) / 0.18);
}
