/**
 * 工业级时间重映射与单调插值引擎 (Time Warp Engine)
 * 严格遵循 LoomCare §6.2 / §17.4 规范：
 * 1. knotMap：基于 Fritsch-Carlson 算法的单调三次 Hermite 样条插值，杜绝时间倒流与超调
 * 2. rampMap：分段线性时间变速映射
 * 3. outerOf：高精度二分法反解外部时间，自动对齐复用镜头音效强拍
 */

export interface Knot {
  outer: number; // 外部时间（如预告片节拍秒）
  inner: number; // 内部时间（如正片幕内秒）
}

export type TimeMapFn = (outerTime: number) => number;

/**
 * 构造单调三次 Hermite 样条插值函数 (Monotone Cubic Hermite Spline)
 * 严格保证：若 inner 序列单调递增，则插值曲线恒满足导数 >= 0，绝无超调或时间回退
 */
export function knotMap(knots: Knot[]): TimeMapFn {
  if (knots.length === 0) return (t) => t;
  if (knots.length === 1) return () => knots[0].inner;

  // 1. 确保 knots 按 outer 升序排序
  const sorted = [...knots].sort((a, b) => a.outer - b.outer);
  const n = sorted.length;

  const h: number[] = new Array(n - 1);
  const delta: number[] = new Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    h[i] = sorted[i + 1].outer - sorted[i].outer;
    delta[i] = h[i] === 0 ? 0 : (sorted[i + 1].inner - sorted[i].inner) / h[i];
  }

  // 2. 初始化切线斜率 d
  const d: number[] = new Array(n);
  d[0] = delta[0];
  for (let i = 1; i < n - 1; i++) {
    if (delta[i - 1] * delta[i] <= 0) {
      d[i] = 0;
    } else {
      d[i] = (delta[i - 1] + delta[i]) / 2;
    }
  }
  d[n - 1] = delta[n - 2];

  // 3. Fritsch-Carlson 单调性调整
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      d[i] = 0;
      d[i + 1] = 0;
    } else {
      const alpha = d[i] / delta[i];
      const beta = d[i + 1] / delta[i];
      const hyp = Math.sqrt(alpha * alpha + beta * beta);
      if (hyp > 3) {
        const tau = 3 / hyp;
        d[i] = tau * alpha * delta[i];
        d[i + 1] = tau * beta * delta[i];
      }
    }
  }

  // 返回时间插值求值闭包
  return (outer: number): number => {
    if (outer <= sorted[0].outer) {
      // 头部外推 (线性)
      return sorted[0].inner + d[0] * (outer - sorted[0].outer);
    }
    if (outer >= sorted[n - 1].outer) {
      // 尾部外推 (线性)
      return sorted[n - 1].inner + d[n - 1] * (outer - sorted[n - 1].outer);
    }

    // 二分或线性查找区间
    let i = 0;
    while (i < n - 1 && outer > sorted[i + 1].outer) {
      i++;
    }

    const dx = sorted[i + 1].outer - sorted[i].outer;
    if (dx <= 0) return sorted[i].inner;

    const t = (outer - sorted[i].outer) / dx;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite 基函数
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return (
      h00 * sorted[i].inner +
      h10 * dx * d[i] +
      h01 * sorted[i + 1].inner +
      h11 * dx * d[i + 1]
    );
  };
}

/**
 * 分段线性时间变速映射 (Ramp Map)
 */
export function rampMap(knots: Knot[]): TimeMapFn {
  if (knots.length === 0) return (t) => t;
  if (knots.length === 1) return () => knots[0].inner;

  const sorted = [...knots].sort((a, b) => a.outer - b.outer);
  const n = sorted.length;

  return (outer: number): number => {
    if (outer <= sorted[0].outer) {
      const slope = (sorted[1].inner - sorted[0].inner) / Math.max(1e-5, sorted[1].outer - sorted[0].outer);
      return sorted[0].inner + slope * (outer - sorted[0].outer);
    }
    if (outer >= sorted[n - 1].outer) {
      const slope = (sorted[n - 1].inner - sorted[n - 2].inner) / Math.max(1e-5, sorted[n - 1].outer - sorted[n - 2].outer);
      return sorted[n - 1].inner + slope * (outer - sorted[n - 1].outer);
    }

    for (let i = 0; i < n - 1; i++) {
      if (outer >= sorted[i].outer && outer <= sorted[i + 1].outer) {
        const dt = sorted[i + 1].outer - sorted[i].outer;
        const p = dt > 0 ? (outer - sorted[i].outer) / dt : 0;
        return sorted[i].inner + (sorted[i + 1].inner - sorted[i].inner) * p;
      }
    }

    return sorted[n - 1].inner;
  };
}

/**
 * 二分法反解外部时间 (Inverse Outer Time Solver)
 * 给定内部幕的目标时间 innerTarget，求出在给定外部区间 [outerMin, outerMax] 内对应的外部时间 outer
 * 精度可达 1e-5 秒
 */
export function outerOf(
  timeMap: TimeMapFn,
  innerTarget: number,
  outerRange: [number, number],
  iterations = 32
): number {
  let low = outerRange[0];
  let high = outerRange[1];

  for (let k = 0; k < iterations; k++) {
    const mid = (low + high) / 2;
    const val = timeMap(mid);
    if (val < innerTarget) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return (low + high) / 2;
}
