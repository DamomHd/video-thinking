/**
 * 工业级纯函数动效库 (Industrial Animation Pure Functions)
 * 严格遵循 LoomCare 第二代架构规范：
 * 1. 逐帧纯数学计算，严禁依赖 DOM 读取
 * 2. 物理弹簧模型解析解，消除数值积分累积误差
 * 3. 对数相机插值与多段平滑过渡
 */

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// 1. 标准四档时长体系（LoomCare 标准设计节拍）
export const DUR = {
  xs: 0.25, // 微交互、点击涟漪、光标悬浮
  sm: 0.45, // 卡片弹入、标签翻出
  md: 0.80, // 模块切换、抽屉收放
  lg: 1.40, // 章节转场、宏大推拉
} as const;

// 2. 标准缓动曲线 (Easing Curves)
export const easeOutExpo = (t: number): number => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutCubic = (t: number): number => {
  const p = clamp01(t);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};

// 镜头专用极平滑缓出曲线 (3.5 次幂，消除机位急停生硬感)
export const camOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3.5);
export const camEaseOut = camOut;
export const camInOut = (t: number): number => {
  const p = clamp01(t);
  return p < 0.5 ? Math.pow(2 * p, 3.5) / 2 : 1 - Math.pow(2 * (1 - p), 3.5) / 2;
};

// 3. 严格解析解物理弹簧阻尼模型 (Underdamped Harmonic Oscillator)
export interface SpringConfig {
  stiffness?: number; // 刚度 k (默认 170)
  damping?: number;   // 阻尼 c (默认 18)
  mass?: number;      // 质量 m (默认 1.0)
}

export function spring(t: number, config: SpringConfig = {}): number {
  if (t <= 0) return 0;
  const k = config.stiffness ?? 170;
  const c = config.damping ?? 18;
  const m = config.mass ?? 1.0;

  // 固有角频率与阻尼比
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  if (zeta < 1) {
    // 欠阻尼震颤收敛 (Underdamped, 常见弹性手感)
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * w0 * t);
    const oscillation = Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t);
    return 1 - envelope * oscillation;
  } else {
    // 过阻尼或临界阻尼 (平滑回弹不超调)
    const envelope = Math.exp(-w0 * t);
    return 1 - envelope * (1 + w0 * t);
  }
}

// 4. 对数尺度相机距离插值 (Logarithmic Cam Z Lerp)
export function lerpLog(a: number, b: number, t: number): number {
  const p = clamp01(t);
  return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * p);
}

// 5. 时间区间与显隐包络算子 (Time Window & Envelope Operators)
// 区间归一化求值
export function tw(t: number, fromSec: number, toSec: number): number {
  if (t <= fromSec) return 0;
  if (t >= toSec) return 1;
  return (t - fromSec) / (toSec - fromSec);
}

// 梯形显隐包络：在 fadeIn 内浮现，保持到 toSec - fadeOut，在 fadeOut 内隐去
export function env(
  t: number,
  fromSec: number,
  toSec: number,
  fadeInSec = 0.3,
  fadeOutSec = 0.3
): number {
  if (t < fromSec || t > toSec) return 0;
  const inVal = fadeInSec > 0 ? clamp01((t - fromSec) / fadeInSec) : 1;
  const outVal = fadeOutSec > 0 ? clamp01((toSec - t) / fadeOutSec) : 1;
  return Math.min(inVal, outVal);
}

// 列表项阶梯式交错入场 (Staggered Row In)
export function rowIn(
  t: number,
  index: number,
  staggerSec = 0.08,
  durSec = DUR.sm
): { opacity: number; y: number } {
  const start = index * staggerSec;
  const p = easeOutCubic(tw(t, start, start + durSec));
  return {
    opacity: p,
    y: (1 - p) * 28, // 向上浮动 28px
  };
}

// 弹性卡片进场 (Card Spring In)
export function cardIn(t: number, delaySec = 0): { scale: number; opacity: number; translateY: number } {
  const localT = Math.max(0, t - delaySec);
  const p = spring(localT, { stiffness: 180, damping: 16 });
  const opacity = clamp01(localT / 0.2);
  const translateY = Math.max(0, (1 - p) * 32);
  return {
    scale: 0.92 + p * 0.08,
    opacity,
    translateY,
  };
}

// 数字动态滚跃计数器 (Count Up)
export function countUp(t: number, startVal: number, endVal: number, durSec: number = DUR.md): number {
  const p = easeOutExpo(tw(t, 0, durSec));
  return Math.round(startVal + (endVal - startVal) * p);
}

// 6. 确定性随机数发生器 (Mulberry32)
export function createRng(seed: number) {
  let s = Math.floor(seed) >>> 0;
  return function next(): number {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 7. 多关键帧分段插值 (Multi-Keyframe Spline/Linear Lerp)
export interface Keyframe<T> {
  t: number;   // 时间秒数
  val: T;      // 目标值
  ease?: (p: number) => number;
}

export function keys(t: number, kfs: Keyframe<number>[]): number {
  if (kfs.length === 0) return 0;
  if (t <= kfs[0].t) return kfs[0].val;
  if (t >= kfs[kfs.length - 1].t) return kfs[kfs.length - 1].val;

  for (let i = 0; i < kfs.length - 1; i++) {
    const k0 = kfs[i];
    const k1 = kfs[i + 1];
    if (t >= k0.t && t <= k1.t) {
      const p = (t - k0.t) / (k1.t - k0.t);
      const easeFn = k0.ease ?? easeOutCubic;
      return lerp(k0.val, k1.val, easeFn(p));
    }
  }
  return kfs[kfs.length - 1].val;
}
