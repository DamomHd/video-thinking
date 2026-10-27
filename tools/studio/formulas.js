/**
 * 工作台与渲染端共用的混音公式（ES 模块）
 *
 * 为什么单独抽成一个文件：
 * 原版 §21 的 P5 点名了这笔债 ——「公式复制了但没有对照测试，两端悄悄分叉时『所听即所得』失效」，
 * 建议是「补对照测试，或者把公式抽成共享模块」。这里两件都做了：
 *   · 公式只写在这一处，app.js 从这里 import，不再有第二份副本；
 *   · src/shared/studio-parity.test.ts 把这里的每个函数和 src/shared/audio-math.ts 逐点对照。
 *
 * 之所以不能直接 import 渲染端那份 TypeScript：浏览器侧没有构建步骤（工作台是
 * 一个裸 http server + 静态文件），所以这边必须是能直接跑的 .js。
 * 对照测试就是防止这两份分叉的那道闸。
 */

export const dbToLin = (db) => Math.pow(10, db / 20);
export const linToDb = (lin) => 20 * Math.log10(Math.max(lin, 1e-6));
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** 三级增益：片段 dB × 层推子 × 总线（层被 mute 时直接为 0） */
export function gainOf(key, layer, gains, mix) {
  if ((mix.muted || []).includes(layer)) return 0;
  const itemDb = gains[key] ?? 0;
  const layerDb = mix.layers[layer] ?? 0;
  const masterDb = mix.master ?? 0;
  return dbToLin(itemDb + layerDb + masterDb);
}

/** 片段线性淡入淡出 */
export function fadeAt(localSec, durSec, fadeInSec, fadeOutSec) {
  if (localSec < 0 || localSec > durSec) return 0;
  const a = fadeInSec > 0 ? localSec / fadeInSec : 1;
  const b = fadeOutSec > 0 ? (durSec - localSec) / fadeOutSec : 1;
  return clamp01(Math.min(a, b));
}

/** 等功率交叉淡化（cos² + sin² = 1） */
export function equalPowerCrossfade(progress01) {
  const angle = clamp01(progress01) * (Math.PI / 2);
  return { outGain: Math.cos(angle), inGain: Math.sin(angle) };
}

/** 让位包络：pre 线性压到 db → hold → release 线性回 1；同层多条取最深 */
export function duckAt(filmSec, targetLayer, triggers) {
  let min = 1;
  for (const { triggerStartSec: t1, spec } of triggers) {
    if (!spec.layers.includes(targetLayer)) continue;
    const t0 = t1 - spec.preSec;
    const t2 = t1 + spec.holdSec;
    const t3 = t2 + spec.releaseSec;
    if (filmSec <= t0 || filmSec >= t3) continue;
    const floor = dbToLin(spec.db);
    let g;
    if (filmSec < t1) g = 1 + (floor - 1) * ((filmSec - t0) / Math.max(spec.preSec, 1e-4));
    else if (filmSec <= t2) g = floor;
    else g = floor + (1 - floor) * ((filmSec - t2) / Math.max(spec.releaseSec, 1e-4));
    if (g < min) min = g;
  }
  return min;
}

/** 口播让配乐：每句开口前 0.15s 压到 duckDb（缺省 −10 dB）、整句保持、说完 0.35s 回来 —— 与 src/shared/voice.ts 同式 */
export function voiceDuckTriggers(voice, toFilm) {
  if (!voice) return [];
  return voice.lines
    .filter((l) => l.file && l.durSec)
    .map((l) => ({
      triggerStartSec: toFilm(l.sec),
      spec: { db: voice.duckDb ?? -10, preSec: 0.15, holdSec: l.durSec, releaseSec: 0.35, layers: ['MUSIC'] },
    }));
}

/** 单调三次 Hermite（Fritsch-Carlson），与 src/shared/warp.ts 同算法 */
export function knotMap(knots) {
  if (knots.length === 0) return (t) => t;
  if (knots.length === 1) return () => knots[0][1];
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const h = [];
  const d = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    h[i] = k[i + 1][0] - k[i][0];
    d[i] = h[i] === 0 ? 0 : (k[i + 1][1] - k[i][1]) / h[i];
  }
  m[0] = d[0];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  m[n - 1] = d[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const hyp = Math.hypot(a, b);
    if (hyp > 3) {
      const tau = 3 / hyp;
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (x) => {
    if (x <= k[0][0]) return k[0][1] + m[0] * (x - k[0][0]);
    if (x >= k[n - 1][0]) return k[n - 1][1] + m[n - 1] * (x - k[n - 1][0]);
    let i = 0;
    while (i < n - 1 && x > k[i + 1][0]) i++;
    const dx = k[i + 1][0] - k[i][0];
    if (dx <= 0) return k[i][1];
    const t = (x - k[i][0]) / dx;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * k[i][1] +
      (t3 - 2 * t2 + t) * dx * m[i] +
      (-2 * t3 + 3 * t2) * k[i + 1][1] +
      (t3 - t2) * dx * m[i + 1]
    );
  };
}

export function identityWarp() {
  return { toFilm: (t) => t, toScore: (t) => t, identity: true };
}

/** 从 sync.json 的 knots（[[乐谱秒, 放映秒]]）构造双向映射 */
export function buildWarp(sync) {
  const raw = (sync && sync.knots) || [];
  if (raw.length < 2 || raw.every(([a, b]) => Math.abs(a - b) < 1e-4)) return identityWarp();
  return {
    toFilm: knotMap(raw.map(([s, f]) => [s, f])),
    toScore: knotMap(raw.map(([s, f]) => [f, s])),
    identity: false,
  };
}
