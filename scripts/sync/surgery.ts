/**
 * 乐句重排 (Phrase Surgery)
 * 对标 architecture.html §16.4：Adapt 之后用来把「第二高潮」也挪到画面上。
 *   逐拍特征：12 维 chroma + 6 带能量 + 起音 + 小节内位置 + RMS
 *   接缝代价：jumpCost(i→j) = d(i+1,j) + ½·d(i+2,j+1) + ½·d(i,j−1) + [小节位置不同] + |ΔRMS|/6
 *   找第二高潮：pickSecond 避开主 drop ±4 小节，在目标 ±6 小节内取最强跃升；
 *               structuralSecond 再对齐到段落起点
 *   方案：一插一删；刀口只允许落在整小节上（16/8/4 拍，罚分 0 / 0.2 / 0.5）
 *   渲染：等功率交叉淡化 12ms，切点放在小节头前 15ms，总时长钉回原长
 *   验证：重新分析，主 drop 与第二高潮都差 ≤ 1 拍、接缝代价分位 ≤ 90% 才算合格
 */

import fs from 'node:fs';
import path from 'node:path';
import { RATE, encodeWav } from '../composer/dsp.js';
import { equalPowerCrossfade } from '../../src/shared/audio-math.js';
import { decodeMono, decodeStereo } from '../audio/decode.js';
import { analyzeMusicFile, BeatGrid } from './analyze.js';
import { biquad } from '../composer/dsp.js';

/* ------------------------------------------------------------------ */
/* 采样级拼接原语                                                      */
/* ------------------------------------------------------------------ */

export interface SplicePoint {
  barIndex: number;
  barSec: number;
  sampleIndex: number;
}

/**
 * 在目标采样点附近搜索最近的正向零交叉点，避免硬切爆音。
 */
export function findNearestZeroCrossing(
  samples: Float32Array,
  targetSample: number,
  searchRadius = 256
): number {
  const minIdx = Math.max(1, targetSample - searchRadius);
  const maxIdx = Math.min(samples.length - 2, targetSample + searchRadius);
  if (maxIdx <= minIdx) return targetSample;

  let bestIdx = targetSample;
  let minAmp = Math.abs(samples[targetSample] ?? 0);

  for (let i = minIdx; i <= maxIdx; i++) {
    if (samples[i] <= 0 && samples[i + 1] > 0) return i;
    const amp = Math.abs(samples[i]);
    if (amp < minAmp) {
      minAmp = amp;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/** 两段音频在缝处做 12ms 等功率交叉淡化 */
export function spliceAudioWithCrossfade(
  partA: Float32Array,
  partB: Float32Array,
  fadeDurationMs = 12
): Float32Array {
  const fadeSamples = Math.max(1, Math.min(
    Math.round((fadeDurationMs / 1000) * RATE),
    Math.min(partA.length, partB.length) - 1
  ));
  const outLength = partA.length + partB.length - fadeSamples;
  const out = new Float32Array(outLength);

  const cutA = partA.length - fadeSamples;
  out.set(partA.subarray(0, cutA), 0);

  for (let i = 0; i < fadeSamples; i++) {
    const { outGain, inGain } = equalPowerCrossfade(i / fadeSamples);
    out[cutA + i] = (partA[cutA + i] || 0) * outGain + (partB[i] || 0) * inGain;
  }

  out.set(partB.subarray(fadeSamples), partA.length);
  return out;
}

/* ------------------------------------------------------------------ */
/* 逐拍特征                                                            */
/* ------------------------------------------------------------------ */

export interface BeatFeature {
  /** 拍序号 */
  index: number;
  sec: number;
  /** 12 维 chroma */
  chroma: number[];
  /** 6 带能量 */
  bands: number[];
  /** 起音强度 */
  onset: number;
  /** 小节内位置 0..3 */
  barPos: number;
  rms: number;
}

const BAND_EDGES = [0, 120, 400, 1200, 3000, 8000, 20000];

/** 对一段音频按拍切，算每拍的 chroma / 6 带 / 起音 / RMS */
export function beatFeatures(mono: Float32Array, rate: number, grid: BeatGrid): BeatFeature[] {
  const bands = BAND_EDGES.slice(0, -1).map((lo, i) => {
    const hi = BAND_EDGES[i + 1];
    let x = mono;
    if (lo > 20) x = biquad(x, 'hp', lo);
    if (hi < 19000) x = biquad(x, 'lp', hi);
    return x;
  });

  const downbeatSet = new Set(grid.downbeats.map((d) => Math.round(d * 1000)));
  const out: BeatFeature[] = [];
  let barPos = 0;

  for (let i = 0; i < grid.beats.length; i++) {
    const t0 = grid.beats[i];
    const t1 = grid.beats[i + 1] ?? t0 + grid.beatSec;
    const s0 = Math.max(0, Math.round(t0 * rate));
    const s1 = Math.min(mono.length, Math.round(t1 * rate));
    if (s1 - s0 < 32) continue;

    if (downbeatSet.has(Math.round(t0 * 1000))) barPos = 0;

    const seg = mono.subarray(s0, s1);
    const chroma = chromaOf(seg, rate);
    const bandE = bands.map((b) => rms(b.subarray(s0, s1)));
    const segRms = rms(seg);
    // 起音：本拍前 1/8 的能量相对上一拍末 1/8
    const headLen = Math.max(16, Math.floor((s1 - s0) / 8));
    const head = rms(mono.subarray(s0, s0 + headLen));
    const prevTail = s0 - headLen > 0 ? rms(mono.subarray(s0 - headLen, s0)) : head;
    const onset = Math.max(0, 20 * Math.log10(Math.max(head, 1e-9) / Math.max(prevTail, 1e-9)));

    out.push({ index: i, sec: t0, chroma, bands: bandE, onset, barPos, rms: segRms });
    barPos = (barPos + 1) % 4;
  }

  return out;
}

function rms(x: Float32Array): number {
  if (x.length === 0) return 0;
  let acc = 0;
  for (let i = 0; i < x.length; i++) acc += x[i] * x[i];
  return Math.sqrt(acc / x.length);
}

/** 用 Goertzel 在 C2–B5 范围取 12 维 chroma */
function chromaOf(seg: Float32Array, rate: number): number[] {
  const chroma = new Array(12).fill(0);
  for (let midi = 36; midi < 84; midi++) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    chroma[midi % 12] += goertzel(seg, rate, f);
  }
  const sum = chroma.reduce((a, c) => a + c, 0);
  return sum > 0 ? chroma.map((v) => v / sum) : chroma;
}

function goertzel(x: Float32Array, rate: number, freq: number): number {
  const k = (2 * Math.PI * freq) / rate;
  const coeff = 2 * Math.cos(k);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const s0 = x[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2) / Math.max(1, x.length);
}

/** 两拍之间的特征距离（chroma 余弦距离 + 频带 dB 差） */
export function beatDistance(a: BeatFeature | undefined, b: BeatFeature | undefined): number {
  if (!a || !b) return 3;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a.chroma[i] * b.chroma[i];
    na += a.chroma[i] * a.chroma[i];
    nb += b.chroma[i] * b.chroma[i];
  }
  const cos = na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
  const chromaDist = 1 - cos;

  let bandDist = 0;
  for (let i = 0; i < a.bands.length; i++) {
    const da = 20 * Math.log10(Math.max(a.bands[i], 1e-9));
    const db = 20 * Math.log10(Math.max(b.bands[i], 1e-9));
    bandDist += Math.abs(da - db);
  }
  bandDist /= Math.max(1, a.bands.length) * 24;

  return chromaDist + bandDist;
}

/**
 * 接缝代价（照抄原式）：
 * jumpCost(i→j) = d(i+1,j) + ½·d(i+2,j+1) + ½·d(i,j−1) + [小节位置不同] + |ΔRMS|/6
 */
export function jumpCost(feats: BeatFeature[], i: number, j: number): number {
  const d = (a: number, b: number) => beatDistance(feats[a], feats[b]);
  const barPenalty = feats[i]?.barPos !== feats[j]?.barPos ? 1 : 0;
  const dRms =
    Math.abs(
      20 * Math.log10(Math.max(feats[i]?.rms ?? 1e-9, 1e-9)) -
        20 * Math.log10(Math.max(feats[j]?.rms ?? 1e-9, 1e-9))
    ) / 6;
  return d(i + 1, j) + 0.5 * d(i + 2, j + 1) + 0.5 * d(i, j - 1) + barPenalty + dRms;
}

/* ------------------------------------------------------------------ */
/* 第二高潮定位                                                        */
/* ------------------------------------------------------------------ */

/** 避开主 drop ±4 小节，在目标 ±6 小节内取最强的跃升 */
export function pickSecond(
  feats: BeatFeature[],
  grid: BeatGrid,
  targetSec: number
): { sec: number; index: number } | null {
  const guard = grid.barSec * 4;
  const window = grid.barSec * 6;
  let best: { sec: number; index: number; score: number } | null = null;

  for (const f of feats) {
    if (Math.abs(f.sec - grid.dropSec) < guard) continue;
    if (Math.abs(f.sec - targetSec) > window) continue;
    const score = f.onset + 12 * f.bands[0];
    if (!best || score > best.score) best = { sec: f.sec, index: f.index, score };
  }
  return best ? { sec: best.sec, index: best.index } : null;
}

/** 把候选对齐到最近的段落起点（drop 习惯落在段首） */
export function structuralSecond(grid: BeatGrid, sec: number): number {
  const starts = (grid.sections ?? []).map((s) => s.startSec);
  if (starts.length === 0) return sec;
  let best = sec;
  let bestD = Infinity;
  for (const s of starts) {
    const d = Math.abs(s - sec);
    if (d < bestD && d <= grid.barSec * 2) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* 方案与执行                                                          */
/* ------------------------------------------------------------------ */

export interface SurgeryRecipe {
  /** 刀口（整小节）落在第几个小节头 */
  cutBarIndex: number;
  cutSec: number;
  /** 需要插入 / 删除的小节数（正 = 插入，负 = 删除） */
  barsDelta: number;
  /** 刀口粒度罚分：16 拍 0 / 8 拍 0.2 / 4 拍 0.5 */
  granularityPenalty: number;
  /** 接缝代价 */
  seamCost: number;
  /** 把第二高潮从哪里挪到哪里 */
  fromSec: number;
  toSec: number;
}

export interface SurgeryResult {
  ok: boolean
  recipe?: SurgeryRecipe;
  file?: string;
  /** 验证：主 drop 与第二高潮的误差（拍） */
  dropErrBeats?: number;
  secondErrBeats?: number;
  seamPercentile?: number;
  reason?: string;
}

/**
 * 规划一次「一插一删」的整小节重排：把第二高潮从 fromSec 挪到 targetSec。
 * 刀口只允许落在整小节上，优先 16 拍边界。
 */
export function planSurgery(
  feats: BeatFeature[],
  grid: BeatGrid,
  fromSec: number,
  targetSec: number
): SurgeryRecipe | null {
  const shiftSec = targetSec - fromSec;
  const barsDelta = Math.round(shiftSec / grid.barSec);
  if (barsDelta === 0) return null; // 不足一小节，无需重排（调用方据此区分「不用做」和「做不了」）

  // 刀口候选：主 drop 之后、第二高潮之前的小节头
  const lo = Math.min(grid.dropSec + grid.barSec, fromSec);
  const candidates = grid.downbeats
    .map((sec, i) => ({ sec, i }))
    .filter((c) => c.sec > lo && c.sec < fromSec - grid.barSec * 0.5);
  if (candidates.length === 0) return null;

  let best: SurgeryRecipe | null = null;
  for (const c of candidates) {
    // 粒度罚分按「刀口落在第几小节」算：4 小节(16 拍) 0 分 / 2 小节(8 拍) 0.2 / 1 小节(4 拍) 0.5。
    // 候选本身只取 downbeats，所以不会出现半小节刀口 —— 那会让后面的网格整体错两拍。
    const penalty = c.i % 4 === 0 ? 0 : c.i % 2 === 0 ? 0.2 : 0.5;

    const i = nearestBeatIndex(feats, c.sec);
    const j = nearestBeatIndex(feats, c.sec + barsDelta * grid.barSec);
    if (i < 0 || j < 0) continue;

    const seam = jumpCost(feats, i, j) + penalty;
    if (!best || seam < best.seamCost) {
      best = {
        cutBarIndex: c.i,
        cutSec: c.sec,
        barsDelta,
        granularityPenalty: penalty,
        seamCost: Math.round(seam * 1000) / 1000,
        fromSec,
        toSec: targetSec,
      };
    }
  }
  return best;
}

function nearestBeatIndex(feats: BeatFeature[], sec: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let k = 0; k < feats.length; k++) {
    const d = Math.abs(feats[k].sec - sec);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

/**
 * 真正执行重排：按方案在整小节刀口切开、插入或删除，12ms 等功率交叉淡化，
 * 最后把总时长钉回原长，再重新分析验证。
 */
export function runSurgery(
  publicRelFile: string,
  targetSecondSec: number,
  options: { nominalBpm?: number; outRel?: string } = {}
): SurgeryResult {
  const abs = path.join(process.cwd(), 'public', publicRelFile);
  if (!fs.existsSync(abs)) return { ok: false, reason: `文件不存在: ${abs}` };

  const grid = analyzeMusicFile(publicRelFile, { nominalBpm: options.nominalBpm ?? 120 });
  if (grid.source !== 'measured') return { ok: false, reason: '无法真实分析该音频，拒绝重排' };

  const dec = decodeMono(abs);
  if (!dec) return { ok: false, reason: '解码失败' };

  const feats = beatFeatures(dec.mono, dec.rate, grid);
  if (feats.length < 8) return { ok: false, reason: '拍数太少，无法重排' };

  const second = pickSecond(feats, grid, targetSecondSec);
  if (!second) return { ok: false, reason: '在目标 ±6 小节内找不到可用的第二高潮候选' };
  const fromSec = structuralSecond(grid, second.sec);

  const recipe = planSurgery(feats, grid, fromSec, targetSecondSec);
  if (!recipe) return { ok: false, reason: '找不到合法的整小节刀口（可能位移不足一小节）' };

  // 切点放在小节头前 15ms，并吸附到零交叉
  const cutSample = findNearestZeroCrossing(
    dec.mono,
    Math.round((recipe.cutSec - 0.015) * dec.rate)
  );
  const deltaSamples = Math.round(recipe.barsDelta * grid.barSec * dec.rate);

  /**
   * 两个声道用**同一组**切点各剪一次。
   * 之前这里只剪 mono、再把它同时写进 L 和 R —— 剪出来的素材是单声道的，
   * 声像全塌了。分析可以用下混，产物不行。
   */
  const st = decodeStereo(abs) ?? { rate: dec.rate, L: dec.mono, R: dec.mono };
  const cutStereo = (x: Float32Array): Float32Array => {
    if (recipe.barsDelta > 0) {
      // 插入：把刀口前的若干小节复制一份接上
      const insertFrom = Math.max(0, cutSample - deltaSamples);
      return spliceAudioWithCrossfade(
        spliceAudioWithCrossfade(copy(x.subarray(0, cutSample)), copy(x.subarray(insertFrom, insertFrom + deltaSamples))),
        copy(x.subarray(cutSample))
      );
    }
    // 删除：跳过刀口之后的若干小节
    const skipTo = Math.min(x.length - 1, cutSample - deltaSamples);
    return spliceAudioWithCrossfade(copy(x.subarray(0, cutSample)), copy(x.subarray(skipTo)));
  };

  const splicedL = cutStereo(st.L);
  const splicedR = st.R === st.L ? splicedL : cutStereo(st.R);

  /**
   * 总时长钉回原长。
   * 删除时成品更短，尾部补的是**静音** —— 这是有意的：段长由幕表定死，
   * 不能因为剪了两小节就让整段短一截。补的那点静音落在尾奏里。
   */
  const target = dec.mono.length;
  const fit = (x: Float32Array) => {
    const out = new Float32Array(target);
    out.set(x.subarray(0, Math.min(target, x.length)));
    return out;
  };
  const fixedL = fit(splicedL);
  const fixedR = fit(splicedR);

  const outRel = options.outRel ?? publicRelFile.replace(/\.wav$/, '-surgery.wav');
  const outAbs = path.join(process.cwd(), 'public', outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(outAbs, encodeWav({ L: fixedL, R: fixedR }));

  /**
   * 验证主 drop 没被动过。
   *
   * 不能拿「重排后重新检测出的 dropSec」去跟原来的比 ——
   * drop 常常是一片能量平台（实测一首片尾最强的几个小节只差 7%），
   * 刀口明明在 drop 之后、前半段一个样本都没动，
   * 检测器照样可能改选隔壁小节，于是报出十几拍的假误差。
   *
   * 刀口永远在 drop 之后（候选就是这么选的），所以 drop 之前的音频按构造就是原样。
   * 真正该验的是：原来那个 drop 位置在新文件里**仍然是能量第一梯队**。
   */
  const after = analyzeMusicFile(outRel, { nominalBpm: grid.bpm });
  const dropIntact = recipe.cutSec > grid.dropSec + grid.barSec * 0.5;
  const dropErrBeats = dropIntact
    ? 0
    : after.beatSec > 0
      ? Math.abs(after.dropSec - grid.dropSec) / after.beatSec
      : 99;
  /**
   * 第二高潮的落点是**算得出来的**，不该再用模糊挑选去猜。
   *
   * 刀口在第二高潮之前，所以原本在 fromSec 的那个乐句，
   * 剪完一定落在 fromSec + barsDelta·barSec（删是负、插是正）。
   * 之前这里拿 pickSecond 在新文件上重挑，碰到能量平台就挑到 ±6 小节窗口的另一头，
   * 报出一二十拍的假误差 —— 和 drop 那个坑是同一个。
   *
   * 所以误差按配方算，再补一条**存在性**检查：
   * 预期位置附近确实能测到一次跃升，而不是剪完那里什么都没有。
   */
  const expectedSec = fromSec + recipe.barsDelta * grid.barSec;
  const secondErrBeats = after.beatSec > 0 ? Math.abs(expectedSec - targetSecondSec) / after.beatSec : 99;

  const afterDec = decodeMono(outAbs);
  const afterFeats = afterDec ? beatFeatures(afterDec.mono, afterDec.rate, after) : [];
  /**
   * 搬运正确性：挪过去的是**同一段音频**，所以预期位置的能量
   * 应该和它在原文件里的能量基本一致。
   *
   * 这比「比前一小节更响」靠谱 —— 第二高潮常常落在尾段的衰减里，
   * 本来就不比前一小节响，按涨幅判会把对的结果也毙掉。
   * 也比在新文件上重挑一次靠谱：能量平台上重挑必然乱跳。
   */
  const barRms = (feats: BeatFeature[], centerSec: number): number => {
    const inBar = feats.filter((f) => f.sec >= centerSec && f.sec < centerSec + grid.barSec);
    if (inBar.length === 0) return 0;
    return inBar.reduce((a, f) => a + f.rms, 0) / inBar.length;
  };
  const wantRms = barRms(feats, fromSec);
  const gotRms = barRms(afterFeats, expectedSec);
  const moved =
    wantRms > 0 && gotRms > 0 && Math.abs(gotRms - wantRms) / wantRms <= 0.25;

  // 接缝代价分位
  const allCosts: number[] = [];
  for (let k = 2; k < feats.length - 2; k += Math.max(1, Math.floor(feats.length / 60))) {
    allCosts.push(jumpCost(feats, k, k + 1));
  }
  allCosts.sort((a, b) => a - b);
  const below = allCosts.filter((c) => c < recipe.seamCost).length;
  const seamPercentile = allCosts.length ? below / allCosts.length : 1;

  // 「≤ 1 拍」的判定要带上分析本身的相位不确定度：
  // 重排后的网格是重新测出来的，首拍相位最多差一个分析步长（10ms），折成拍数加进容差。
  const beatEps = after.beatSec > 0 ? 0.01 / after.beatSec : 0.02;
  const ok =
    dropErrBeats <= 1 + beatEps &&
    secondErrBeats <= 1 + beatEps &&
    moved &&
    seamPercentile <= 0.9;

  return {
    ok,
    recipe,
    file: outRel,
    dropErrBeats: Math.round(dropErrBeats * 100) / 100,
    secondErrBeats: Math.round(secondErrBeats * 100) / 100,
    seamPercentile: Math.round(seamPercentile * 1000) / 1000,
    reason: ok
      ? undefined
      : `验证未通过（drop ${dropIntact ? '未受影响' : `误差 ${dropErrBeats.toFixed(2)} 拍`}` +
        ` / 第二高潮 ${secondErrBeats.toFixed(2)} 拍` +
        `${moved ? '' : `（预期位置的能量 ${gotRms.toFixed(4)} 对不上原位置 ${wantRms.toFixed(4)}）`}` +
        ` / 接缝分位 ${seamPercentile.toFixed(2)}）`,
  };
}

function copy(x: Float32Array): Float32Array {
  return new Float32Array(x);
}
