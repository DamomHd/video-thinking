/**
 * 纯画面信号分析 (对标 architecture.html §15.1 的第三种来源)
 *
 * 用 ffmpeg 从母片里抽四样东西：运动面积、帧差、亮度、切镜。
 * **这些信号不进计划** —— 只给两件事用：
 *   1. spot:video —— 看看画面上还有哪些动静没配声
 *   2. compare —— 和语义标注对账：召回（画面在动但没配声）与噪音（配了声但画面没动静）
 * 原因是画面信号对「该不该出声」的判断力很弱，当主力会配出一堆无意义的声音。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SpotAnnotation, AudioLayer, SfxLayer } from '../../src/shared/types.js';

export interface VideoFrameSignal {
  sec: number;
  /** 平均亮度 0..255 */
  luma: number;
  /** 与上一帧的平均绝对差 0..255 */
  frameDiff: number;
  /** 变化超过阈值的格子占比 0..1（运动面积） */
  motionArea: number;
}

export interface VideoAnalysis {
  file: string;
  fps: number;
  frames: number;
  signals: VideoFrameSignal[];
  /** 切镜（硬切）时刻 */
  cuts: number[];
  /** 运动区段 */
  motions: { fromSec: number; toSec: number; peakArea: number }[];
  /** 这一次用的阈值（自标定结果） */
  thresholds: Thresholds;
}

/** 分析网格：32×18 灰度，足够判运动面积又很便宜 */
const GW = 32;
const GH = 18;

/**
 * 阈值自标定。
 * 写死阈值只对「切得碎、动得大」的素材有效；缓慢辉光的片子逐帧差本来就小，
 * 用固定的 18/255 会把落版光环爆开都判成「没动静」。
 * 所以先量这条片子自己的帧差分布，再按分位数定阈值：
 *   运动阈值 = 中位数 + k·(四分位距)，硬切阈值 = 99 分位的若干倍。
 * 这和 stills-ab 先测底噪再判显著性是同一个思路。
 */
export interface Thresholds {
  cellDelta: number;
  cutDiff: number;
  motionArea: number;
  /** 标定依据 */
  basis: { median: number; p75: number; p99: number };
}

function calibrate(diffs: number[]): Thresholds {
  const sorted = [...diffs].filter((d) => d > 0).sort((a, b) => a - b);
  const q = (p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0);
  const median = q(0.5);
  const p75 = q(0.75);
  const p99 = q(0.99);
  const iqr = Math.max(0.2, p75 - median);

  return {
    // 单格「变了」的门限：比中位数高出一个四分位距，且不低于 2（量化噪声）
    cellDelta: Math.max(2, median + iqr * 1.5),
    // 硬切：比 99 分位还高一截，且不低于 12
    cutDiff: Math.max(12, p99 * 1.8),
    // 运动面积占比：固定 4%，再低就是单格噪声
    motionArea: 0.04,
    basis: { median: r1(median), p75: r1(p75), p99: r1(p99) },
  };
}

export function analyzeVideo(
  videoFile: string,
  options: { fps?: number; thresholds?: Partial<Thresholds> } = {}
): VideoAnalysis | null {
  if (!fs.existsSync(videoFile)) return null;
  const fps = options.fps ?? 10;

  let raw: Buffer;
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', videoFile, '-vf', `fps=${fps},scale=${GW}:${GH},format=gray`,
        '-f', 'rawvideo', '-'],
      { maxBuffer: 512 * 1024 * 1024 }
    );
  } catch {
    return null;
  }

  const cell = GW * GH;
  const frames = Math.floor(raw.length / cell);

  // ── 先走一遍只为标定：量这条片子自己的逐格差分布
  const sampleDiffs: number[] = [];
  for (let f = 1; f < frames; f++) {
    const base = f * cell;
    const prev = (f - 1) * cell;
    for (let i = 0; i < cell; i += 7) {
      sampleDiffs.push(Math.abs(raw[base + i] - raw[prev + i]));
    }
  }
  const th: Thresholds = { ...calibrate(sampleDiffs), ...options.thresholds };

  const signals: VideoFrameSignal[] = [];
  const cuts: number[] = [];

  for (let f = 0; f < frames; f++) {
    const base = f * cell;
    let sum = 0;
    for (let i = 0; i < cell; i++) sum += raw[base + i];
    const luma = sum / cell;

    let diffSum = 0;
    let changed = 0;
    if (f > 0) {
      const prev = (f - 1) * cell;
      for (let i = 0; i < cell; i++) {
        const d = Math.abs(raw[base + i] - raw[prev + i]);
        diffSum += d;
        if (d >= th.cellDelta) changed++;
      }
    }
    const frameDiff = f > 0 ? diffSum / cell : 0;
    const motionArea = f > 0 ? changed / cell : 0;
    const sec = f / fps;

    signals.push({
      sec: r3(sec),
      luma: r1(luma),
      frameDiff: r1(frameDiff),
      motionArea: r3(motionArea),
    });

    if (frameDiff >= th.cutDiff) cuts.push(r3(sec));
  }

  // 运动区段：连续若干帧运动面积超阈值
  const motions: VideoAnalysis['motions'] = [];
  let start: number | null = null;
  let peak = 0;
  for (const s of signals) {
    if (s.motionArea >= th.motionArea) {
      if (start === null) {
        start = s.sec;
        peak = 0;
      }
      peak = Math.max(peak, s.motionArea);
    } else if (start !== null) {
      motions.push({ fromSec: start, toSec: s.sec, peakArea: r3(peak) });
      start = null;
    }
  }
  if (start !== null) {
    motions.push({ fromSec: start, toSec: signals[signals.length - 1].sec, peakArea: r3(peak) });
  }

  return { file: videoFile, fps, frames, signals, cuts, motions, thresholds: th };
}

/** 把画面信号翻成「候选 spot」—— 只用来看，不写进计划 */
export function videoSpots(analysis: VideoAnalysis, slotPrefix: string): SpotAnnotation[] {
  const out: SpotAnnotation[] = [];
  analysis.cuts.forEach((sec, i) => {
    out.push({
      id: `画面硬切${i + 1}`,
      fromSec: sec,
      toSec: r3(sec + 0.4),
      layer: 'IMPACT' as SfxLayer,
      slot: `${slotPrefix}Impact`,
      what: '画面硬切（纯信号推断）',
    });
  });
  analysis.motions
    .filter((m) => m.toSec - m.fromSec >= 0.2)
    .forEach((m, i) => {
      out.push({
        id: `画面运动${i + 1}`,
        fromSec: m.fromSec,
        toSec: m.toSec,
        layer: 'WHOOSH' as SfxLayer,
        slot: `${slotPrefix}Whoosh`,
        what: `画面运动（面积峰值 ${m.peakArea}，纯信号推断）`,
      });
    });
  return out;
}

export interface CompareReport {
  /** 画面在动但没配声 */
  recall: { fromSec: number; toSec: number; peakArea: number }[];
  /** 配了声但画面附近没动静 */
  noise: { key: string; fromSec: number }[];
  coveredMotions: number;
  totalMotions: number;
}

/**
 * 召回 / 噪音对账（对标原版的 compare.mts）。
 * 这是**诊断**，不是守门：画面没动静也可能该出声（比如纯氛围铺底），
 * 所以报出来给人看，不参与 vw check 的通过与否。
 */
export function compareWithPlan(
  analysis: VideoAnalysis,
  plan: { key: string; fromSec: number; durSec: number; layer: string }[],
  options: { windowSec?: number } = {}
): CompareReport {
  const win = options.windowSec ?? 0.5;

  const recall = analysis.motions.filter((m) => {
    if (m.toSec - m.fromSec < 0.25) return false;
    return !plan.some((p) => p.fromSec >= m.fromSec - win && p.fromSec <= m.toSec + win);
  });

  const noise = plan
    .filter((p) => p.layer !== 'BG' && p.layer !== 'TEX') // 铺底层本来就不跟画面动静走
    .filter(
      (p) =>
        !analysis.motions.some((m) => p.fromSec >= m.fromSec - win && p.fromSec <= m.toSec + win) &&
        !analysis.cuts.some((c) => Math.abs(c - p.fromSec) <= win)
    )
    .map((p) => ({ key: p.key, fromSec: p.fromSec }));

  return {
    recall,
    noise,
    coveredMotions: analysis.motions.length - recall.length,
    totalMotions: analysis.motions.length,
  };
}

/** 落盘到 out/<片>/video-signals.json */
export function writeAnalysis(filmId: string, analysis: VideoAnalysis): string {
  const dir = path.join(process.cwd(), 'out', filmId);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, 'video-signals.json');
  // signals 逐帧很长，落盘时只留摘要 + 切镜 + 运动区段
  fs.writeFileSync(
    p,
    JSON.stringify(
      {
        file: analysis.file,
        fps: analysis.fps,
        frames: analysis.frames,
        cuts: analysis.cuts,
        motions: analysis.motions,
        thresholds: analysis.thresholds,
        lumaRange: [
          Math.min(...analysis.signals.map((s) => s.luma)),
          Math.max(...analysis.signals.map((s) => s.luma)),
        ],
      },
      null,
      2
    ),
    'utf-8'
  );
  return p;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
