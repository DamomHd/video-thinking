/**
 * 配乐段的缺省规划与入点对齐 (对标 architecture.html §16.7 里标为「P4 还没做」的两项)
 *   · 适配器的缺省规划：按幕表和拍点自动排出一套配乐段，人再去调，而不是从零手写
 *   · 入点对齐首小节：段入点吸附到配乐的小节头上，否则段首会从半小节切进来
 */

import { FilmAdapter, MusicCue, MusicFile, VisualHit } from '../../src/shared/types.js';
import { DEFAULT_MUSIC_VOLUME } from '../../src/shared/audio-math.js';
import { BeatGrid } from '../sync/analyze.js';

export interface DefaultPlanOptions {
  /** 一段最短多久（秒）—— 太碎的段没意义，会被并进相邻段 */
  minCueSec?: number;
  /** 段与段之间默认怎么衔接 */
  defaultJoin?: MusicCue['join'];
  /** 段基础音量 */
  volume?: number;
}

/**
 * 按幕表 + P0/P1 拍点排出一套缺省配乐段。
 *
 * 规则：
 *   1. 每个 P0 拍点自成一段的主高潮 —— 段的边界落在「上一个 P0 之后、这个 P0 之前」的幕起点
 *   2. 段内如果还有 P1 拍点，取最靠后的那个当第二高潮
 *   3. 短于 minCueSec 的段并进前一段
 *   4. 一个 P0 都没有时退化成整片一段
 * 出来的是**起点**，不是终稿：ref 都填好了，人在工作台里拖边界即可。
 */
export function defaultMusicPlan(
  adapter: FilmAdapter,
  options: DefaultPlanOptions = {}
): MusicFile {
  const minCueSec = options.minCueSec ?? 8;
  const volume = options.volume ?? DEFAULT_MUSIC_VOLUME;
  const total = adapter.timeline.totalSeconds;
  const hits = adapter.hits();
  const scenes = adapter.timeline.scenes;

  const p0 = hits.filter((h) => h.priority === 'P0').sort((a, b) => a.sec - b.sec);
  // 片头引用第一幕（它从 0 秒开始）：适配器的 SC 按幕 id 命名，没有叫 start 的键 ——
  // 写成 'SC.start' 时守门会报引用解析不到
  const firstRef = scenes.length ? `SC.${scenes[0].id}` : 'SC.end';

  if (p0.length === 0) {
    return {
      version: 2,
      cues: [
        makeCue('c1', '正片主配乐', 0, total, firstRef, 'SC.end', undefined, undefined, volume),
      ],
    };
  }

  // 每个 P0 之前最近的幕起点当段入点
  const bounds: number[] = [0];
  for (let i = 1; i < p0.length; i++) {
    const prevHit = p0[i - 1].sec;
    const thisHit = p0[i].sec;
    const candidate = [...scenes]
      .reverse()
      .find((s) => s.start > prevHit && s.start < thisHit);
    bounds.push(candidate ? candidate.start : (prevHit + thisHit) / 2);
  }
  bounds.push(total);

  // 合并过短的段
  const merged: number[] = [bounds[0]];
  for (let i = 1; i < bounds.length; i++) {
    if (bounds[i] - merged[merged.length - 1] < minCueSec && i < bounds.length - 1) continue;
    merged.push(bounds[i]);
  }

  const cues: MusicCue[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const from = merged[i];
    const to = merged[i + 1];
    const inHits = hits.filter((h) => h.sec >= from && h.sec < to);
    const climax = inHits.find((h) => h.priority === 'P0') ?? inHits[0];
    const climax2 = [...inHits].reverse().find((h) => h !== climax && h.priority !== 'P2');

    const inScene = [...scenes].reverse().find((s) => s.start <= from);
    const outScene = [...scenes].reverse().find((s) => s.start <= to);

    cues.push(
      makeCue(
        `c${i + 1}`,
        climax ? `配乐段 ${i + 1}（高潮 ${climax.id}）` : `配乐段 ${i + 1}`,
        from,
        to,
        i === 0 ? firstRef : inScene ? `SC.${inScene.id}` : firstRef,
        i === merged.length - 2 ? 'SC.end' : outScene ? `SC.${outScene.id}` : 'SC.end',
        climax,
        climax2,
        volume,
        i > 0 ? options.defaultJoin ?? { kind: 'crossfade', overlapSec: 1.5 } : undefined
      )
    );
  }

  return { version: 2, cues };
}

function makeCue(
  id: string,
  label: string,
  fromSec: number,
  toSec: number,
  inRef: string,
  outRef: string,
  climax: VisualHit | undefined,
  climax2: VisualHit | undefined,
  volume: number,
  join?: MusicCue['join']
): MusicCue {
  return {
    id,
    label,
    in: { ref: inRef, sec: r4(fromSec) },
    out: { ref: outRef, sec: r4(toSec) },
    climax: climax ? { ref: climax.id, sec: r4(climax.sec) } : undefined,
    climax2: climax2 ? { ref: climax2.id, sec: r4(climax2.sec) } : undefined,
    brief: '',
    startFromSec: 0,
    volume,
    fadeInSec: 1.0,
    fadeOutSec: 2.0,
    join,
  };
}

/* ------------------------------------------------------------------ */
/* 入点对齐首小节                                                      */
/* ------------------------------------------------------------------ */

export interface AlignReport {
  cueId: string;
  fromSec: number;
  alignedSec: number;
  deltaSec: number;
  /** 吸附到的是小节头还是拍 */
  snappedTo: 'bar' | 'beat' | 'none';
  reason?: string;
}

/**
 * 把配乐段的 startFromSec 对齐到曲子的首小节。
 *
 * 要解决的问题：段入点落在画面上（比如某一幕的起点），
 * 而曲子从 startFromSec 开始取 —— 如果 startFromSec 不在小节头上，
 * 段首就会从半小节切进来，听着像「漏了半拍」。
 *
 * 做法：把 startFromSec 吸附到最近的小节头；偏差超过半小节就退一步吸附到拍，
 * 都够不着（没有可信网格）就不动，并说明原因。
 */
export function alignCueIntro(
  cue: MusicCue,
  grid: BeatGrid,
  options: { maxShiftSec?: number } = {}
): AlignReport {
  const maxShift = options.maxShiftSec ?? grid.barSec / 2;
  const from = cue.startFromSec;

  if (grid.source !== 'measured' || grid.downbeats.length === 0) {
    return {
      cueId: cue.id,
      fromSec: from,
      alignedSec: from,
      deltaSec: 0,
      snappedTo: 'none',
      reason: '没有实测网格，不动（synthetic 网格对齐没有意义）',
    };
  }

  const nearest = (xs: number[]) =>
    xs.reduce((best, x) => (Math.abs(x - from) < Math.abs(best - from) ? x : best), xs[0]);

  const bar = nearest(grid.downbeats);
  if (Math.abs(bar - from) <= maxShift) {
    return {
      cueId: cue.id,
      fromSec: from,
      alignedSec: r4(bar),
      deltaSec: r4(bar - from),
      snappedTo: 'bar',
    };
  }

  const beat = grid.beats.length > 0 ? nearest(grid.beats) : from;
  if (Math.abs(beat - from) <= maxShift) {
    return {
      cueId: cue.id,
      fromSec: from,
      alignedSec: r4(beat),
      deltaSec: r4(beat - from),
      snappedTo: 'beat',
      reason: '最近的小节头太远，降级吸附到拍',
    };
  }

  return {
    cueId: cue.id,
    fromSec: from,
    alignedSec: from,
    deltaSec: 0,
    snappedTo: 'none',
    reason: `最近的小节头与拍都超出 ${maxShift.toFixed(2)}s 的允许位移`,
  };
}

/** 对全部段做入点对齐，返回改过的 music 和逐段报告 */
export function alignAllCues(
  music: MusicFile,
  getGrid: (cue: MusicCue) => BeatGrid,
  options: { maxShiftSec?: number } = {}
): { music: MusicFile; reports: AlignReport[] } {
  const out: MusicFile = JSON.parse(JSON.stringify(music));
  const reports: AlignReport[] = [];
  for (const cue of out.cues) {
    if (!cue.track?.file) continue;
    const r = alignCueIntro(cue, getGrid(cue), options);
    reports.push(r);
    cue.startFromSec = r.alignedSec;
  }
  return { music: out, reports };
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
