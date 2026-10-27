/**
 * 调性估计与 Camelot 调性系统 (Krumhansl-Schmuckler 算法)
 * 严格对齐 LoomCare §16.1, §16.2 与附录 D
 * 注意：本模块只在 Node 侧运行（脚本 / 工作台服务端），不进浏览器 bundle。
 */

import { decodeMono } from '../audio/decode.js';

// 12 个半音音名定义：C=0, C#=1, D=2, ..., B=11
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// Krumhansl-Kessler 心理声学大调与小调色度偏好轮廓 (Key Profiles)
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

// 24 调到 Camelot 码的标准映射
// 大调对应 B，小调对应 A
const ROOT_TO_CAMELOT_MAJOR: Record<number, string> = {
  0: '8B',  // C
  1: '3B',  // Db/C#
  2: '10B', // D
  3: '5B',  // Eb/D#
  4: '12B', // E
  5: '7B',  // F
  6: '2B',  // F#/Gb
  7: '9B',  // G
  8: '4B',  // Ab/G#
  9: '11B', // A
  10: '6B', // Bb/A#
  11: '1B', // B
};

const ROOT_TO_CAMELOT_MINOR: Record<number, string> = {
  0: '5A',  // C minor
  1: '12A', // C# minor
  2: '7A',  // D minor
  3: '2A',  // Eb/D# minor
  4: '9A',  // E minor
  5: '4A',  // F minor
  6: '11A', // F# minor
  7: '6A',  // G minor
  8: '1A',  // G# minor
  9: '8A',  // A minor
  10: '3A', // Bb minor
  11: '10A',// B minor
};

/**
 * 计算两个 12 维向量的皮尔逊相关系数 (Pearson Correlation Coefficient)
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    Math.max(1e-9, (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
  );

  return numerator / denominator;
}

export interface KeyEstimateResult {
  rootPitch: number;      // 0 ~ 11 (C ~ B)
  rootName: string;       // e.g. "C", "A"
  mode: 'major' | 'minor';
  keyName: string;        // e.g. "C Major", "A Minor"
  camelot: string;        // e.g. "8B", "8A"
  correlation: number;    // 相关系数 (-1 ~ 1)
  allRanked: { key: string; camelot: string; correlation: number }[];
}

/**
 * 基于 12 维色度向量估计音频调性
 * @param chroma 12 维色度能量向量 [C, C#, D, ..., B]
 */
export function estimateKeyFromChroma(chroma: number[]): KeyEstimateResult {
  if (chroma.length !== 12) {
    throw new Error('[sync/key] 色度向量必须为 12 维');
  }

  const results: {
    rootPitch: number;
    mode: 'major' | 'minor';
    correlation: number;
    keyName: string;
    camelot: string;
  }[] = [];

  for (let root = 0; root < 12; root++) {
    // 旋转轮廓以对齐根音
    const shiftedMajor = new Array(12);
    const shiftedMinor = new Array(12);
    for (let i = 0; i < 12; i++) {
      shiftedMajor[(i + root) % 12] = MAJOR_PROFILE[i];
      shiftedMinor[(i + root) % 12] = MINOR_PROFILE[i];
    }

    const rMaj = pearsonCorrelation(chroma, shiftedMajor);
    results.push({
      rootPitch: root,
      mode: 'major',
      correlation: rMaj,
      keyName: `${NOTE_NAMES[root]} Major`,
      camelot: ROOT_TO_CAMELOT_MAJOR[root],
    });

    const rMin = pearsonCorrelation(chroma, shiftedMinor);
    results.push({
      rootPitch: root,
      mode: 'minor',
      correlation: rMin,
      keyName: `${NOTE_NAMES[root]} Minor`,
      camelot: ROOT_TO_CAMELOT_MINOR[root],
    });
  }

  results.sort((a, b) => b.correlation - a.correlation);
  const best = results[0];

  return {
    rootPitch: best.rootPitch,
    rootName: NOTE_NAMES[best.rootPitch],
    mode: best.mode,
    keyName: best.keyName,
    camelot: best.camelot,
    correlation: Number(best.correlation.toFixed(3)),
    allRanked: results.map(r => ({
      key: r.keyName,
      camelot: r.camelot,
      correlation: Number(r.correlation.toFixed(3)),
    })),
  };
}

/**
 * 辅助测试函数：从半音索引列表合成 12 维色度向量
 * 例如大三和弦 [root, root+4, root+7]，小三和弦 [root, root+3, root+7]
 */
export function synthesizeChordChroma(
  root: number,
  mode: 'major' | 'minor'
): number[] {
  const chroma = new Array(12).fill(0.02);

  const scale =
    mode === 'major'
      ? [0, 2, 4, 5, 7, 9, 11] // 自然大调
      : [0, 2, 3, 5, 7, 8, 10]; // 自然小调

  for (const iv of scale) {
    const pitch = (root + iv) % 12;
    if (iv === 0) chroma[pitch] = 1.0;
    else if (iv === 7) chroma[pitch] = 0.75;
    else if (iv === 4 || iv === 3) chroma[pitch] = 0.65;
    else chroma[pitch] = 0.35;
  }

  return chroma;
}

/* ------------------------------------------------------------------ */
/* 从真实音频提取色度并估调性                                          */
/* ------------------------------------------------------------------ */

/**
 * 从真实 PCM 提取 12 维色度向量。
 * 做法：对 C2–B6 共 5 个八度的 60 个半音频率各做一次 Goertzel 能量估计，
 * 再按音级折叠累加。分帧取样（每 0.25s 一帧，最多取 240 帧）以兼顾精度和速度。
 */
export function chromaFromFile(absFile: string): number[] | null {
  const dec = decodeMono(absFile);
  if (!dec || dec.mono.length < dec.rate / 2) return null;

  const { mono, rate } = dec;
  const chroma = new Array(12).fill(0);

  // C2 = MIDI 36
  const freqs: { pc: number; f: number }[] = [];
  for (let midi = 36; midi < 96; midi++) {
    freqs.push({ pc: midi % 12, f: 440 * Math.pow(2, (midi - 69) / 12) });
  }

  const frameLen = Math.round(rate * 0.25);
  const totalFrames = Math.floor(mono.length / frameLen);
  const step = Math.max(1, Math.floor(totalFrames / 240));

  for (let fi = 0; fi < totalFrames; fi += step) {
    const seg = mono.subarray(fi * frameLen, (fi + 1) * frameLen);
    for (const { pc, f } of freqs) {
      chroma[pc] += goertzelPower(seg, rate, f);
    }
  }

  const sum = chroma.reduce((a, c) => a + c, 0);
  if (sum <= 0) return null;
  return chroma.map((v) => v / sum);
}

/** Goertzel 算法：单频点能量，比整段 FFT 便宜得多 */
function goertzelPower(x: Float32Array, rate: number, freq: number): number {
  const n = x.length;
  if (n === 0) return 0;
  const k = (2 * Math.PI * freq) / rate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Math.max(0, power) / n;
}

/** 直接从音频文件估调性；解不出来返回 null，绝不给默认调 */
export function estimateKeyOfFile(absFile: string): KeyEstimateResult | null {
  const chroma = chromaFromFile(absFile);
  if (!chroma) return null;
  return estimateKeyFromChroma(chroma);
}
