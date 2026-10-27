/**
 * 水彩 / 水墨的几何与场（纯函数，按种子确定）
 *
 * 水彩：多层多边形形变（generative art 里常用的水彩画法）
 *   1. 基础形状递归插中点、沿法线随机推拉 → 一个边缘不规则的「色块」
 *   2. 在它的基础上再各自形变几十次，得到几十层略有差别的轮廓
 *   3. 每层用很低的不透明度叠上去 —— 层层重叠的地方颜色深、只有少数层覆盖的边缘浅而虚，就是水彩的晕
 *   晕开的动画：每层按进度从中心放大，外层（形变大的）长得慢一点，边缘就像颜料在纸上慢慢渗开
 *
 * 水墨：噪声场阈值
 *   墨从落点向外扩散，扩散半径随时间增长，边界由分形噪声扰动 —— 前沿不规则、带毛边；
 *   浓淡 = 距离前沿的远近，前沿处略加深（墨在纸纤维边缘积聚的那一圈）。
 */

import { createRng } from './anim';
import { noise2D } from '@remotion/noise';

export type P2 = [number, number];

/** 高斯随机（Box–Muller），用确定性的 rng */
function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 递归形变：每条边插一个中点，沿法线方向按「边长 × variance × 高斯」推拉。
 * 每个顶点带一个自己的 variance（第三个分量），子点继承并略作扰动 —— 有的边平滑、有的边毛糙，更像真颜料。
 */
export function deformPolygon(poly: [number, number, number][], depth: number, rng: () => number): [number, number, number][] {
  let pts = poly;
  for (let d = 0; d < depth; d++) {
    const next: [number, number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const v = (a[2] + b[2]) / 2;
      const nx = -(b[1] - a[1]) / (len || 1);
      const ny = (b[0] - a[0]) / (len || 1);
      const off = gauss(rng) * len * v;
      const along = (rng() - 0.5) * 0.2;
      next.push(a);
      next.push([
        a[0] + (b[0] - a[0]) * (0.5 + along) + nx * off,
        a[1] + (b[1] - a[1]) * (0.5 + along) + ny * off,
        Math.max(0.02, v * (0.85 + rng() * 0.3)),
      ]);
    }
    pts = next;
  }
  return pts;
}

export interface WashLayer {
  pts: P2[];
  /** 本层的生长速度系数（外圈 < 1：边缘慢慢渗出） */
  growth: number;
}

export interface WashPlan {
  center: P2;
  layers: WashLayer[];
}

/**
 * 生成一块水彩色块的全部层（只算一次，按 seed 恒定）。
 * shape：轮廓点（屏幕坐标）；variance 0.05–0.3：越大边缘越毛；layers 30–60。
 */
export function planWash(shape: P2[], options: { seed?: number; layers?: number; variance?: number } = {}): WashPlan {
  const rng = createRng(options.seed ?? 1);
  const variance = options.variance ?? 0.12;
  const n = options.layers ?? 40;
  const base = deformPolygon(shape.map((p) => [p[0], p[1], variance * (0.6 + rng() * 0.8)]), 2, rng);
  const cx = shape.reduce((a, p) => a + p[0], 0) / shape.length;
  const cy = shape.reduce((a, p) => a + p[1], 0) / shape.length;
  const layers: WashLayer[] = [];
  for (let i = 0; i < n; i++) {
    const pts = deformPolygon(base, 3, rng).map((p) => [p[0], p[1]] as P2);
    // 离中心越远的层长得越慢：用本层平均半径相对基础半径的比值
    const r = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length;
    layers.push({ pts, growth: r });
  }
  const meanR = layers.reduce((a, l) => a + l.growth, 0) / layers.length || 1;
  for (const l of layers) l.growth = Math.max(0.6, Math.min(1.2, 2 - l.growth / meanR));
  return { center: [cx, cy], layers };
}

/** 规则多边形 / 圆的轮廓点，给 planWash 当初始形状 */
export function blobShape(c: P2, r: number, sides = 10, rx?: number, ry?: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    out.push([c[0] + Math.cos(a) * (rx ?? r), c[1] + Math.sin(a) * (ry ?? r)]);
  }
  return out;
}

/**
 * 水墨扩散场：位置 (x, y) 在时间进度 p 时的墨量 0..1。
 * 半径 R(p) 从 0 长到 radius；边界被分形噪声扰动 rough（占半径的比例）。
 * 前沿 feather 宽度内渐变；前沿以内再叠一圈积墨（rim）。
 */
export function inkAt(
  x: number,
  y: number,
  c: P2,
  radius: number,
  p: number,
  options: { seed?: string; rough?: number; feather?: number; rim?: number; scale?: number } = {}
): number {
  if (p <= 0) return 0;
  const seed = options.seed ?? 'ink';
  const rough = options.rough ?? 0.22;
  const feather = options.feather ?? 0.1;
  const rim = options.rim ?? 0.3;
  const sc = options.scale ?? 1 / (radius * 0.35);
  const dx = x - c[0];
  const dy = y - c[1];
  const d = Math.hypot(dx, dy) / radius;
  // 三个八度的分形噪声：大块轮廓 + 中等毛边 + 细碎纤维
  // 四个八度：大块轮廓 + 毛边 + 细丝 + 纸纤维（高频权重给足，边缘才是「渗」出来的细丝而不是块状的焦边）
  const n =
    noise2D(seed, x * sc, y * sc) * 0.45 +
    noise2D(seed + 'b', x * sc * 2.7, y * sc * 2.7) * 0.25 +
    noise2D(seed + 'c', x * sc * 7.3, y * sc * 7.3) * 0.18 +
    noise2D(seed + 'd', x * sc * 19, y * sc * 19) * 0.12;
  const front = Math.min(1, p) * (1 + rough * n);
  const edge = (front - d) / feather;
  if (edge <= 0) return 0;
  const body = Math.min(1, edge);
  // 积墨：前沿内侧一圈更深
  const ring = Math.exp(-Math.pow((edge - 1.2) / 0.8, 2)) * rim;
  return Math.min(1, body * (0.78 + 0.22 * (1 - d)) + ring);
}
