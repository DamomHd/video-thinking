/**
 * 几何板书的纯函数（尺规作图 / 几何证明）
 *
 * 板书的观感来自「按作图顺序一笔一笔长出来」：先画线段、再用圆规转出弧、交点亮起、标注出现。
 * 这里只出几何（路径字符串、交点坐标），描画进度交给组件（components/geo）。
 * 屏幕坐标：y 朝下；角度：弧度，0 指向 +x，顺时针为正（和 SVG 一致）。
 */

export type Pt = [number, number];

export const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
export const angleOf = (from: Pt, to: Pt): number => Math.atan2(to[1] - from[1], to[0] - from[0]);
export const polar = (c: Pt, r: number, a: number): Pt => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];

/** 圆弧路径：从角 a0 转到 a1（a1 > a0 顺时针），可超过一整圈的部分会被截到 2π */
export function arcPath(c: Pt, r: number, a0: number, a1: number): string {
  const sweep = Math.max(-2 * Math.PI + 1e-4, Math.min(2 * Math.PI - 1e-4, a1 - a0));
  const p0 = polar(c, r, a0);
  const p1 = polar(c, r, a0 + sweep);
  const large = Math.abs(sweep) > Math.PI ? 1 : 0;
  const dir = sweep >= 0 ? 1 : 0;
  return `M ${p0[0].toFixed(3)} ${p0[1].toFixed(3)} A ${r.toFixed(3)} ${r.toFixed(3)} 0 ${large} ${dir} ${p1[0].toFixed(3)} ${p1[1].toFixed(3)}`;
}

/** 线段向两端各延长 ext（作图里的「辅助延长线」） */
export function extendSegment(a: Pt, b: Pt, ext: number): [Pt, Pt] {
  const d = dist(a, b) || 1;
  const ux = (b[0] - a[0]) / d;
  const uy = (b[1] - a[1]) / d;
  return [
    [a[0] - ux * ext, a[1] - uy * ext],
    [b[0] + ux * ext, b[1] + uy * ext],
  ];
}

/** 两圆交点（0 / 1 / 2 个）。尺规作图的核心：中垂线、等边三角形、角平分线都靠它 */
export function circleCircle(c1: Pt, r1: number, c2: Pt, r2: number): Pt[] {
  const d = dist(c1, c2);
  if (d < 1e-9 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;
  const px = c1[0] + (a * (c2[0] - c1[0])) / d;
  const py = c1[1] + (a * (c2[1] - c1[1])) / d;
  if (h < 1e-9) return [[px, py]];
  const ox = (h * (c2[1] - c1[1])) / d;
  const oy = (h * (c2[0] - c1[0])) / d;
  return [
    [px + ox, py - oy],
    [px - ox, py + oy],
  ];
}

/** 两直线（各由两点确定）交点；平行返回 null */
export function lineLine(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a1[0] - a2[0]) * (b1[1] - b2[1]) - (a1[1] - a2[1]) * (b1[0] - b2[0]);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((a1[0] - b1[0]) * (b1[1] - b2[1]) - (a1[1] - b1[1]) * (b1[0] - b2[0])) / d;
  return [a1[0] + t * (a2[0] - a1[0]), a1[1] + t * (a2[1] - a1[1])];
}

/** 直线与圆的交点 */
export function lineCircle(p1: Pt, p2: Pt, c: Pt, r: number): Pt[] {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const fx = p1[0] - c[0];
  const fy = p1[1] - c[1];
  const A = dx * dx + dy * dy;
  const B = 2 * (fx * dx + fy * dy);
  const C = fx * fx + fy * fy - r * r;
  const disc = B * B - 4 * A * C;
  if (A < 1e-12 || disc < 0) return [];
  const s = Math.sqrt(disc);
  const ts = disc < 1e-12 ? [-B / (2 * A)] : [(-B - s) / (2 * A), (-B + s) / (2 * A)];
  return ts.map((t) => [p1[0] + t * dx, p1[1] + t * dy] as Pt);
}

/** 角标记：顶点 v、两边方向点 a / b，半径 r 的小弧（取较小的那个角） */
export function angleMarkPath(v: Pt, a: Pt, b: Pt, r: number): string {
  let a0 = angleOf(v, a);
  let a1 = angleOf(v, b);
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;
  a1 = a0 + sweep;
  return arcPath(v, r, a0, a1);
}

/** 直角标记（小方块） */
export function rightAnglePath(v: Pt, a: Pt, b: Pt, s: number): string {
  const ua = [(a[0] - v[0]) / (dist(v, a) || 1), (a[1] - v[1]) / (dist(v, a) || 1)];
  const ub = [(b[0] - v[0]) / (dist(v, b) || 1), (b[1] - v[1]) / (dist(v, b) || 1)];
  const p1: Pt = [v[0] + ua[0] * s, v[1] + ua[1] * s];
  const p2: Pt = [p1[0] + ub[0] * s, p1[1] + ub[1] * s];
  const p3: Pt = [v[0] + ub[0] * s, v[1] + ub[1] * s];
  return `M ${p1[0]} ${p1[1]} L ${p2[0]} ${p2[1]} L ${p3[0]} ${p3[1]}`;
}
