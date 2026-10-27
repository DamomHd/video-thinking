import { evaluateBpmFit } from './bpmfit.js';
import { VisualHit } from '../../src/shared/types.js';

export interface CamelotKey {
  number: number; // 1 ~ 12
  letter: 'A' | 'B';
}

/**
 * 解析 Camelot 调性字符串，例如 "8A", "11B"
 */
export function parseCamelot(keyStr?: string): CamelotKey | null {
  if (!keyStr) return null;
  const match = keyStr.trim().toUpperCase().match(/^(\d{1,2})([AB])$/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > 12) return null;
  return { number: num, letter: match[2] as 'A' | 'B' };
}

/**
 * 计算 Camelot 调性过渡得分 (0 ~ 100)
 */
export function scoreCamelotTransition(fromKeyStr?: string, toKeyStr?: string): number {
  const from = parseCamelot(fromKeyStr);
  const to = parseCamelot(toKeyStr);
  if (!from || !to) return 50; // 无调性信息时给中立默认分

  const numDist = Math.min(
    Math.abs(from.number - to.number),
    12 - Math.abs(from.number - to.number)
  );
  const sameLetter = from.letter === to.letter;

  // 1. 同调
  if (numDist === 0 && sameLetter) return 100;
  // 2. 同数字相对大小调 (例如 8A -> 8B)
  if (numDist === 0 && !sameLetter) return 95;
  // 3. 相邻调 (例如 8A -> 7A, 9A)
  if (numDist === 1 && sameLetter) return 90;
  // 4. 相邻数字且大小调切换 (例如 8A -> 7B, 9B)
  if (numDist === 1 && !sameLetter) return 80;
  // 5. 跨两步 (能量提升转调，例如 8A -> 10A)
  if (numDist === 2 && sameLetter) return 65;

  // 其余较远调性按距离衰减
  return Math.max(10, 60 - numDist * 10);
}

/**
 * 计算两段之间的速度接续得分 (0 ~ 100)
 * 允许原速、倍速 (2x)、半速 (0.5x)
 */
export function scoreBpmTransition(
  bpmFrom: number,
  bpmTo: number,
  joinKind?: string
): number {
  if (joinKind === 'gap' || joinKind === 'bridge') {
    // 留白或音效桥衔接时，速度不计，满分通过
    return 100;
  }
  if (bpmFrom <= 0 || bpmTo <= 0) return 50;

  const ratios = [
    Math.abs(bpmTo / bpmFrom - 1.0),
    Math.abs(bpmTo / (bpmFrom * 2) - 1.0),
    Math.abs((bpmTo * 2) / bpmFrom - 1.0),
  ];
  const minErr = Math.min(...ratios);

  // ±6% 满分 100
  if (minErr <= 0.06) return 100;
  // ±12% 半分 50
  if (minErr <= 0.12) {
    return 50 + ((0.12 - minErr) / 0.06) * 50;
  }
  // 超过 12% 线性衰减
  return Math.max(0, 50 - (minErr - 0.12) * 200);
}

export interface ContinuityFactors {
  prevBpm: number;
  prevKey?: string;
  prevArtist?: string;
  joinKind?: string;
}

/**
 * 计算段落接续项得分 (0 ~ 100)
 * 公式：接续 = 0.5·速度 + 0.4·Camelot 调性 + 0.1·同艺人
 */
export function computeContinuityScore(
  target: { bpm: number; key?: string; artist?: string },
  factors: ContinuityFactors
): number {
  const sBpm = scoreBpmTransition(factors.prevBpm, target.bpm, factors.joinKind);
  const sKey = scoreCamelotTransition(factors.prevKey, target.key);
  const sArtist =
    factors.prevArtist &&
    target.artist &&
    factors.prevArtist.trim().toLowerCase() === target.artist.trim().toLowerCase()
      ? 100
      : 0;

  return 0.5 * sBpm + 0.4 * sKey + 0.1 * sArtist;
}

export interface CandidateTrack {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  key?: string;
  durationSec: number;
  hasVocals?: boolean;
  vocalScore?: number; // 0 ~ 1 (1 代表包含明显人声歌词)
  rank?: number;       // 1 ~ N (搜索自然排序)
  moodScore?: number;  // 0 ~ 100
  genreScore?: number; // 0 ~ 100
}

export interface MscoreOptions {
  enableContinuity?: boolean;
  continuityFactors?: ContinuityFactors;
  useGridFit?: boolean;
  gridHits?: VisualHit[];
  dropSec?: number;
  targetDurationSec?: number;
}

export interface MscoreBreakdown {
  mscore: number;
  mood: number;
  genre: number;
  speed: number;
  length: number;
  rank: number;
  vocalPenalty: number;
  continuity?: number;
}

/**
 * 选曲打分综合算法 (LoomCare 附录 C 标准公式)
 * mscore = 0.3·情绪 + 0.15·流派 + 0.2·速度 + 0.15·长度 + 0.2·排名 − 0.6·人声 (+ 0.2·接续)
 */
export function computeMscore(
  track: CandidateTrack,
  options?: MscoreOptions
): MscoreBreakdown {
  const mood = track.moodScore ?? 80;
  const genre = track.genreScore ?? 80;

  // 1. 速度项 (若开启网格拟合，则使用 bpmfit)
  let speed = 80;
  if (options?.useGridFit && options?.gridHits && options?.dropSec !== undefined) {
    const res = evaluateBpmFit(options.gridHits, options.dropSec, track.bpm);
    speed = res.fitScore;
  } else {
    // 默认理想速度区间 100~125
    if (track.bpm >= 95 && track.bpm <= 130) {
      speed = 100;
    } else {
      speed = Math.max(30, 100 - Math.abs(track.bpm - 110) * 1.5);
    }
  }

  // 2. 长度项
  let length = 100;
  if (options?.targetDurationSec) {
    if (track.durationSec < options.targetDurationSec - 2) {
      // 短于所需时长罚分较重
      length = Math.max(20, 100 - (options.targetDurationSec - track.durationSec) * 5);
    } else {
      length = 100; // 长于或等于片长可用于 Adapt
    }
  }

  // 3. 排名项 (Epidemic 自然排名递减)
  const rankIdx = track.rank ?? 1;
  const rank = Math.max(10, 100 - (rankIdx - 1) * 4.5);

  // 4. 人声惩罚
  const vocalAmt = track.hasVocals ? 1.0 : track.vocalScore ?? 0;
  const vocalPenalty = 0.6 * (vocalAmt * 100);

  // 5. 基础打分
  let baseScore =
    0.3 * mood +
    0.15 * genre +
    0.2 * speed +
    0.15 * length +
    0.2 * rank -
    vocalPenalty;

  // 6. 接续项
  let continuity: number | undefined;
  if (options?.enableContinuity && options.continuityFactors) {
    continuity = computeContinuityScore(track, options.continuityFactors);
    baseScore += 0.2 * continuity;
  }

  return {
    mscore: Number(baseScore.toFixed(2)),
    mood: Number(mood.toFixed(1)),
    genre: Number(genre.toFixed(1)),
    speed: Number(speed.toFixed(1)),
    length: Number(length.toFixed(1)),
    rank: Number(rank.toFixed(1)),
    vocalPenalty: Number(vocalPenalty.toFixed(1)),
    continuity: continuity !== undefined ? Number(continuity.toFixed(1)) : undefined,
  };
}
