/**
 * 配乐节拍与段落分析器 (Music Analyzer)
 * 对标 architecture.html §16.5。全部指标来自真实 PCM：
 *   解码 → 三频带（全带 / <120Hz / >2500Hz）→ 10ms 窗 RMS(dB)
 *   → 起音 flux(全带) + 0.6·flux(高带)
 *   → 拍周期：名义 bpm 只当初值，4 拍滞后 ±3% 粗定，32/16 拍滞后 ±0.4% 精修（归一化自相关 + 抛物线插值）
 *   → 小节头：4 个相位候选累加（起音 + 1.2·低频起音 + 低频能量），到顶拍 +30%，静音后首拍 +15%
 *   → 段落：按小节能量算 novelty，边界 ≥0.45·最大值且间隔 ≥4 小节；drop 取「到顶」的小节
 * 文件缺失或解码失败时返回 source:'synthetic' 的等距网格，并且如实标注，绝不冒充测量值。
 */

import fs from 'node:fs';
import path from 'node:path';
import { decodeMono, windowRmsDb, positiveFlux } from '../audio/decode.js';
import { biquad } from '../composer/dsp.js';

const HOP_SEC = 0.01;

/** 越界电平按静音算的哨兵值 */
export const SILENCE_DB = -120;

/**
 * 电平（dB）序列的取样：越界必须补**静音**，不能补 0。
 *
 * 0 dB 是满刻度 —— 是最响，不是最轻。
 * 之前这里和 flux 共用一个「越界补 0」的取样函数，于是末尾几个越界采样
 * 成了全曲能量最高点，drop 被判到最后一个小节上，
 * 段落划分、第二高潮、改编配方的偏好区跟着全错。
 */
export function sampleDbAt(arr: number[], t: number, hopSec = HOP_SEC): number {
  const i = Math.round(t / hopSec);
  return i >= 0 && i < arr.length ? arr[i] : SILENCE_DB;
}

export interface MusicSection {
  kind: 'intro' | 'verse' | 'build' | 'drop' | 'bridge' | 'outro';
  startSec: number;
  endSec: number;
  bars: number;
  energy: number;
}

export interface BeatGrid {
  bpm: number;
  beatSec: number;
  barSec: number;
  dropSec: number;
  beats: number[];
  downbeats: number[];
  totalSec: number;
  /** measured = 真实解码分析；synthetic = 无音频时的等距网格 */
  source: 'measured' | 'synthetic';
  /** 自相关归一化系数，<0.08 表示节拍不可信（已回退名义 bpm） */
  periodR?: number;
  beatOffsetSec?: number;
  sections?: MusicSection[];
  /** 强跃升点（候选第二高潮） */
  jumps?: number[];
  endingSec?: number;
  file?: string;
}

/* ------------------------------------------------------------------ */
/* 合成网格（显式降级路径）                                            */
/* ------------------------------------------------------------------ */

/**
 * 无音频文件时的等距节拍网格。仅用于「还没选曲」阶段做可行性预估，
 * source 恒为 'synthetic'，调用方必须据此判断报告可信度。
 */
export function analyzeMusicGrid(
  totalSeconds: number,
  options: { nominalBpm?: number; dropRatio?: number; offsetSec?: number } = {}
): BeatGrid {
  const bpm = options.nominalBpm || 108;
  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;
  const offset = options.offsetSec || 0;

  const beats: number[] = [];
  const downbeats: number[] = [];
  let cur = offset;
  let i = 0;
  while (cur <= totalSeconds) {
    beats.push(Number(cur.toFixed(3)));
    if (i % 4 === 0) downbeats.push(Number(cur.toFixed(3)));
    cur += beatSec;
    i++;
  }

  const rawDrop = totalSeconds * (options.dropRatio ?? 0.72);
  let dropSec = downbeats[0] ?? 0;
  let best = Infinity;
  for (const db of downbeats) {
    const d = Math.abs(db - rawDrop);
    if (d < best) {
      best = d;
      dropSec = db;
    }
  }

  return { bpm, beatSec, barSec, dropSec, beats, downbeats, totalSec: totalSeconds, source: 'synthetic' };
}

/* ------------------------------------------------------------------ */
/* 真实分析                                                            */
/* ------------------------------------------------------------------ */

/** 归一化自相关 */
function normAutocorr(x: number[], lag: number): number {
  const n = x.length - lag;
  if (n <= 8) return 0;
  let num = 0;
  let ea = 0;
  let eb = 0;
  for (let i = 0; i < n; i++) {
    num += x[i] * x[i + lag];
    ea += x[i] * x[i];
    eb += x[i + lag] * x[i + lag];
  }
  const den = Math.sqrt(ea * eb);
  return den > 1e-12 ? num / den : 0;
}

/** 在 [lo, hi] 帧滞后范围内找自相关峰，并用抛物线插值细化到亚帧 */
function peakLag(x: number[], lo: number, hi: number): { lag: number; r: number } {
  lo = Math.max(2, Math.floor(lo));
  hi = Math.min(x.length - 4, Math.ceil(hi));
  if (hi <= lo) return { lag: lo, r: 0 };

  let bestLag = lo;
  let bestR = -Infinity;
  for (let L = lo; L <= hi; L++) {
    const r = normAutocorr(x, L);
    if (r > bestR) {
      bestR = r;
      bestLag = L;
    }
  }

  // 抛物线插值
  const rm = normAutocorr(x, Math.max(2, bestLag - 1));
  const r0 = bestR;
  const rp = normAutocorr(x, bestLag + 1);
  const denom = rm - 2 * r0 + rp;
  const delta = Math.abs(denom) > 1e-12 ? (0.5 * (rm - rp)) / denom : 0;

  return { lag: bestLag + Math.max(-0.5, Math.min(0.5, delta)), r: bestR };
}

/** 真实分析一个音频文件 */
export function analyzeMusicFile(
  publicRelOrAbsFile: string,
  options: { nominalBpm?: number; totalSecHint?: number } = {}
): BeatGrid {
  const nominalBpm = options.nominalBpm || 108;
  const abs = path.isAbsolute(publicRelOrAbsFile)
    ? publicRelOrAbsFile
    : path.join(process.cwd(), 'public', publicRelOrAbsFile);

  if (!fs.existsSync(abs)) {
    return analyzeMusicGrid(options.totalSecHint ?? 30, { nominalBpm });
  }

  const dec = decodeMono(abs);
  if (!dec || dec.mono.length < dec.rate) {
    return analyzeMusicGrid(options.totalSecHint ?? 30, { nominalBpm });
  }

  const { mono, rate, durationSec } = dec;

  // 1. 三频带
  const low = biquad(mono, 'lp', 120);
  const high = biquad(mono, 'hp', 2500);

  // 2. 10ms 窗 RMS(dB)
  const dbFull = windowRmsDb(mono, rate, HOP_SEC);
  const dbLow = windowRmsDb(low, rate, HOP_SEC);
  const dbHigh = windowRmsDb(high, rate, HOP_SEC);

  // 3. 起音包络
  const fFull = positiveFlux(dbFull);
  const fHigh = positiveFlux(dbHigh);
  const fLow = positiveFlux(dbLow);
  const onset = fFull.map((v, i) => v + 0.6 * (fHigh[i] ?? 0));

  // 4. 拍周期：名义值只当初值
  const nominalBeatSec = 60 / nominalBpm;
  const framesPerBeat = nominalBeatSec / HOP_SEC;

  // 粗定：4 拍滞后 ±3%
  const coarse = peakLag(onset, framesPerBeat * 4 * 0.97, framesPerBeat * 4 * 1.03);
  let beatFrames = coarse.lag / 4;
  let periodR = coarse.r;

  // 精修：优先 32 拍，不够长用 16 拍，±0.4%
  const longMult = onset.length > beatFrames * 32 * 1.2 ? 32 : 16;
  if (onset.length > beatFrames * longMult * 1.1) {
    const fine = peakLag(
      onset,
      beatFrames * longMult * 0.996,
      beatFrames * longMult * 1.004
    );
    if (fine.r >= coarse.r * 0.8) {
      beatFrames = fine.lag / longMult;
      periodR = fine.r;
    }
  }

  let beatSec = beatFrames * HOP_SEC;
  const deviation = Math.abs(beatSec - nominalBeatSec) / nominalBeatSec;
  // 相关性太弱或偏离名义值超过 3%：回退名义值（搜索窗必须小于半拍，否则八分音符会别名）
  if (periodR < 0.08 || deviation > 0.03) {
    beatSec = nominalBeatSec;
    beatFrames = framesPerBeat;
  }

  // 5. 首拍相位：在 [0, beatSec) 内取起音累加最大的偏移
  let beatOffsetSec = 0;
  let bestPhaseScore = -Infinity;
  const phaseSteps = Math.max(4, Math.round(beatFrames));
  for (let s = 0; s < phaseSteps; s++) {
    const off = (s / phaseSteps) * beatSec;
    let score = 0;
    for (let t = off; t < durationSec; t += beatSec) {
      const idx = Math.round(t / HOP_SEC);
      if (idx >= 0 && idx < onset.length) score += onset[idx];
    }
    if (score > bestPhaseScore) {
      bestPhaseScore = score;
      beatOffsetSec = off;
    }
  }

  // 6. 拍序列
  const beats: number[] = [];
  for (let t = beatOffsetSec; t < durationSec; t += beatSec) {
    beats.push(Math.round(t * 1000) / 1000);
  }

  // 7. 小节头：4 个相位候选
  const linToEnergy = (db: number) => Math.pow(10, db / 20);
  /** 起音 / flux 这类「量」的取样：越界补 0 是对的（没有起音） */
  const sampleAt = (arr: number[], t: number) => {
    const i = Math.round(t / HOP_SEC);
    return i >= 0 && i < arr.length ? arr[i] : 0;
  };
  const sampleDb = (arr: number[], t: number) => sampleDbAt(arr, t, HOP_SEC);
  // 「到顶拍」：低频能量相对前一拍跃升最大的拍
  const beatLowEnergy = beats.map((t) => linToEnergy(sampleDb(dbLow, t)));
  let topBeatIdx = 0;
  let topJump = -Infinity;
  const jumps: { idx: number; amount: number }[] = [];
  for (let i = 1; i < beats.length; i++) {
    const jump = beatLowEnergy[i] - beatLowEnergy[i - 1];
    jumps.push({ idx: i, amount: jump });
    if (jump > topJump) {
      topJump = jump;
      topBeatIdx = i;
    }
  }
  // 静音后首拍
  const silentThenFirst = new Set<number>();
  for (let i = 1; i < beats.length; i++) {
    if (sampleAt(dbFull, beats[i - 1]) < -45 && sampleAt(dbFull, beats[i]) > -35) {
      silentThenFirst.add(i);
    }
  }

  let bestPhase = 0;
  let bestPhaseVal = -Infinity;
  for (let phase = 0; phase < 4; phase++) {
    let acc = 0;
    for (let i = phase; i < beats.length; i += 4) {
      const t = beats[i];
      let v = sampleAt(onset, t) + 1.2 * sampleAt(fLow, t) + 8 * beatLowEnergy[i];
      if (i === topBeatIdx) v *= 1.3;
      if (silentThenFirst.has(i)) v *= 1.15;
      acc += v;
    }
    if (acc > bestPhaseVal) {
      bestPhaseVal = acc;
      bestPhase = phase;
    }
  }

  const downbeats: number[] = [];
  for (let i = bestPhase; i < beats.length; i += 4) downbeats.push(beats[i]);

  const barSec = beatSec * 4;

  // 8. 段落与 drop：按小节能量算 novelty
  const fullBarHops = Math.max(1, Math.round(barSec / HOP_SEC));
  const barEnergy = downbeats.map((t) => {
    let acc = 0;
    let n = 0;
    for (let s = t; s < t + barSec && s < durationSec; s += HOP_SEC) {
      acc += linToEnergy(sampleDb(dbFull, s));
      n++;
    }
    /**
     * 末尾那个残缺小节只盖到几个采样，均值完全不可信 —— 一个瞬态就能让它登顶。
     * 覆盖不到四分之一小节的直接判 0，不参与 drop / novelty 的竞争。
     */
    if (n < fullBarHops * 0.25) return 0;
    return n > 0 ? acc / n : 0;
  });

  const novelty = barEnergy.map((e, i) => (i === 0 ? 0 : Math.abs(e - barEnergy[i - 1])));
  const maxNov = Math.max(...novelty, 1e-9);
  const boundaries: number[] = [0];
  for (let i = 1; i < novelty.length; i++) {
    if (novelty[i] >= 0.45 * maxNov && i - boundaries[boundaries.length - 1] >= 4) {
      boundaries.push(i);
    }
  }

  // drop：能量「到顶」的那个小节
  let dropBarIdx = 0;
  let maxE = -Infinity;
  for (let i = 0; i < barEnergy.length; i++) {
    if (barEnergy[i] > maxE) {
      maxE = barEnergy[i];
      dropBarIdx = i;
    }
  }
  // 对齐到该小节所在的段落边界（drop 习惯落在段首）
  for (let b = boundaries.length - 1; b >= 0; b--) {
    if (boundaries[b] <= dropBarIdx && dropBarIdx - boundaries[b] <= 2) {
      dropBarIdx = boundaries[b];
      break;
    }
  }
  const dropSec = downbeats[dropBarIdx] ?? downbeats[0] ?? 0;

  const sections: MusicSection[] = boundaries.map((b, i) => {
    const endBar = i + 1 < boundaries.length ? boundaries[i + 1] : barEnergy.length;
    const startSec = downbeats[b] ?? 0;
    const endSec = downbeats[endBar] ?? durationSec;
    const slice = barEnergy.slice(b, endBar);
    const energy = slice.length ? slice.reduce((a, c) => a + c, 0) / slice.length : 0;
    const rel = maxE > 0 ? energy / maxE : 0;
    let kind: MusicSection['kind'] = 'verse';
    if (b === dropBarIdx) kind = 'drop';
    else if (i === 0) kind = 'intro';
    else if (endBar >= barEnergy.length) kind = 'outro';
    else if (rel > 0.75) kind = 'build';
    else if (rel < 0.35) kind = 'bridge';
    return {
      kind,
      startSec: Math.round(startSec * 1000) / 1000,
      endSec: Math.round(endSec * 1000) / 1000,
      bars: endBar - b,
      energy: Math.round(rel * 1000) / 1000,
    };
  });

  // 强跃升点（第二高潮候选）：按低频跃升取前 6 个，避开主 drop ±4 小节
  const jumpSecs = jumps
    .filter((j) => Math.abs(beats[j.idx] - dropSec) > barSec * 4)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6)
    .map((j) => Math.round(beats[j.idx] * 1000) / 1000)
    .sort((a, b) => a - b);

  // 尾奏起点：最后一个能量低于 0.4·峰值的段落起点
  let endingSec = durationSec;
  for (let i = sections.length - 1; i >= 0; i--) {
    if (sections[i].energy < 0.4) endingSec = sections[i].startSec;
    else break;
  }

  return {
    bpm: Math.round((60 / beatSec) * 100) / 100,
    beatSec: Math.round(beatSec * 100000) / 100000,
    barSec: Math.round(barSec * 100000) / 100000,
    dropSec: Math.round(dropSec * 1000) / 1000,
    beats,
    downbeats,
    totalSec: Math.round(durationSec * 1000) / 1000,
    source: 'measured',
    periodR: Math.round(periodR * 10000) / 10000,
    beatOffsetSec: Math.round(beatOffsetSec * 10000) / 10000,
    sections,
    jumps: jumpSecs,
    endingSec: Math.round(endingSec * 1000) / 1000,
    file: publicRelOrAbsFile,
  };
}

/**
 * 分析一部片的某个配乐段：有曲子就真量，没曲子就返回合成网格。
 * 真实分析结果会落盘到 out/<片>/music/<段>/analysis.json。
 */
export function analyzeCue(
  filmId: string,
  cueId: string,
  trackFile: string | undefined,
  nominalBpm: number,
  totalSecHint: number
): BeatGrid {
  const grid = trackFile
    ? analyzeMusicFile(trackFile, { nominalBpm, totalSecHint })
    : analyzeMusicGrid(totalSecHint, { nominalBpm });

  if (grid.source === 'measured') {
    const dir = path.join(process.cwd(), 'out', filmId, 'music', cueId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'analysis.json'),
      JSON.stringify(grid, null, 2),
      'utf-8'
    );
  }
  return grid;
}
