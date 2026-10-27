/**
 * 音效候选打分 (Candidate Scoring)
 * 对标 architecture.html §15.3：
 *   候选分 = 0.3·标签词重叠 + 0.15·排名 + 0.4·声学画像 + 0.15·UCS 命中
 *            − 0.35·避让词数 − 0.5·缺本层必含词
 * 声学画像按层对照目标形状（UI 起音 ≤ 25ms；RISER 后段比前段响 …），
 * 全部来自真实预览解码出的特征，不编造。
 */

import { AudioLayer, SfxLayer, PaletteSpec } from '../../src/shared/types.js';

export interface AcousticFeatures {
  /** 起音时长（ms） */
  attackMs: number;
  /** 尾长（ms） */
  tailMs: number;
  /** 亮度 0~1（高频能量占比） */
  bright: number;
  /** 起势 0~1（后半段 RMS / 前半段 RMS 的归一化值，>0.5 表示渐强） */
  rise: number;
  /** 峰均差（crest factor, dB） */
  crest: number;
  /** 峰值 dBFS */
  peakDb: number;
}

export interface Candidate {
  id: string;
  title: string;
  tags: string[];
  slugs: string[];
  durationSec: number;
  previewUrl?: string;
  /** 两种排序下的名次（1 起） */
  rank: { relevance: number; popularity: number };
  ucs?: string;
  feat?: AcousticFeatures;
  score?: number;
  parts?: Record<string, number>;
  file?: string;
  /** 外部 CC0 来源（freesound / kenney）；Epidemic 与本地合成不写 */
  source?: 'freesound' | 'kenney';
  /** 许可证 URL（CC0 为 http://creativecommons.org/publicdomain/zero/1.0/） */
  license?: string;
  /** 素材原始页面 */
  url?: string;
  author?: string;
  /** 原始文件格式（Freesound 的 type：wav / flac / aiff / mp3 …） */
  fileType?: string;
}

/** 各层的目标声学形状 */
export interface LayerShape {
  attackMs: [number, number];
  tailMs: [number, number];
  bright: [number, number];
  rise: [number, number];
  /** 本层必含词（缺一个罚 0.5） */
  required: string[];
  /** 避让词（命中一个罚 0.35） */
  avoid: string[];
}

export const LAYER_SHAPES: Record<SfxLayer, LayerShape> = {
  BG: {
    attackMs: [60, 4000], tailMs: [1500, 60000], bright: [0.05, 0.45], rise: [0.3, 0.7],
    required: [], avoid: ['impact', 'hit', 'stinger', 'voice', 'speech'],
  },
  TEX: {
    attackMs: [5, 400], tailMs: [200, 6000], bright: [0.25, 0.9], rise: [0.2, 0.8],
    required: [], avoid: ['loop', 'music', 'melody', 'voice'],
  },
  RISER: {
    // 起势必须渐强：rise 下界高
    attackMs: [100, 3000], tailMs: [300, 12000], bright: [0.2, 0.85], rise: [0.6, 1.0],
    required: ['riser', 'rise', 'build', 'sweep', 'up'], avoid: ['down', 'fall', 'reverse'],
  },
  WHOOSH: {
    attackMs: [10, 300], tailMs: [150, 3000], bright: [0.2, 0.8], rise: [0.2, 0.7],
    required: ['whoosh', 'swoosh', 'air', 'pass', 'sweep'], avoid: ['loop', 'music'],
  },
  IMPACT: {
    attackMs: [0, 40], tailMs: [200, 8000], bright: [0.1, 0.7], rise: [0.0, 0.35],
    required: ['impact', 'hit', 'boom', 'drop', 'slam'], avoid: ['loop', 'riser', 'build'],
  },
  UI: {
    // UI 起音 ≤ 25ms
    attackMs: [0, 25], tailMs: [20, 900], bright: [0.3, 1.0], rise: [0.0, 0.4],
    required: [], avoid: ['loop', 'music', 'ambience', 'voice'],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** 把检索串切成词 */
export function terms(tags: string): string[] {
  return norm(tags).split(/\s+/).filter((w) => w.length > 1);
}

/** 标签词重叠：候选标签里命中了多少检索词 */
export function tagOverlap(spec: PaletteSpec, cand: Candidate): number {
  const want = new Set([...terms(spec.tags), ...terms(spec.alt ?? ''), ...terms(spec.cat)]);
  if (want.size === 0) return 0;
  const have = new Set(
    [...cand.tags, ...cand.slugs, cand.title].flatMap((s) => terms(String(s)))
  );
  let hit = 0;
  for (const w of want) if (have.has(w)) hit++;
  return hit / want.size;
}

/** 名次分：两种排序取较好的那个，1 名得 1 分，衰减到 0 */
export function rankScore(cand: Candidate, poolSize: number): number {
  const best = Math.min(cand.rank.relevance || 999, cand.rank.popularity || 999);
  if (!Number.isFinite(best) || best <= 0) return 0;
  return Math.max(0, 1 - (best - 1) / Math.max(1, poolSize));
}

/** 单个指标落在目标区间内得 1 分，区间外按距离线性衰减 */
function inRange(v: number, [lo, hi]: [number, number]): number {
  if (v >= lo && v <= hi) return 1;
  const span = Math.max(1e-6, hi - lo);
  const d = v < lo ? lo - v : v - hi;
  return Math.max(0, 1 - d / span);
}

/** 声学画像分：按层目标形状比对真实特征 */
export function acousticScore(spec: PaletteSpec, cand: Candidate): number {
  if (!cand.feat) return 0;
  const shape = LAYER_SHAPES[spec.layer];
  const f = cand.feat;
  const parts = [
    inRange(f.attackMs, shape.attackMs),
    inRange(f.tailMs, shape.tailMs),
    inRange(f.bright, shape.bright),
    inRange(f.rise, shape.rise),
  ];
  // 时长也要落在采购单要求的区间里
  const durFit = inRange(cand.durationSec, spec.dur);
  return (parts.reduce((a, c) => a + c, 0) / parts.length) * 0.75 + durFit * 0.25;
}

/** UCS 命中：候选的 UCS 子类在槽允许的清单里 */
export function ucsScore(spec: PaletteSpec, cand: Candidate): number {
  if (!spec.ucs || spec.ucs.length === 0) return 0;
  if (!cand.ucs) return 0;
  return spec.ucs.includes(cand.ucs) ? 1 : 0;
}

/** 避让词命中数 */
export function avoidHits(spec: PaletteSpec, cand: Candidate): number {
  const shape = LAYER_SHAPES[spec.layer];
  const have = new Set(
    [...cand.tags, ...cand.slugs, cand.title].flatMap((s) => terms(String(s)))
  );
  return shape.avoid.filter((w) => have.has(w)).length;
}

/** 缺本层必含词：一个都没命中算缺 */
export function missingRequired(spec: PaletteSpec, cand: Candidate): number {
  const shape = LAYER_SHAPES[spec.layer];
  if (shape.required.length === 0) return 0;
  const have = new Set(
    [...cand.tags, ...cand.slugs, cand.title].flatMap((s) => terms(String(s)))
  );
  return shape.required.some((w) => have.has(w)) ? 0 : 1;
}

/**
 * 候选总分。parts 一并返回，便于在报告里看清每一项的贡献。
 */
export function scoreCandidate(
  spec: PaletteSpec,
  cand: Candidate,
  poolSize: number
): { score: number; parts: Record<string, number> } {
  const parts = {
    tag: tagOverlap(spec, cand),
    rank: rankScore(cand, poolSize),
    acoustic: acousticScore(spec, cand),
    ucs: ucsScore(spec, cand),
    avoid: avoidHits(spec, cand),
    missing: missingRequired(spec, cand),
  };
  const score =
    0.3 * parts.tag +
    0.15 * parts.rank +
    0.4 * parts.acoustic +
    0.15 * parts.ucs -
    0.35 * parts.avoid -
    0.5 * parts.missing;
  return { score: Math.round(score * 10000) / 10000, parts };
}

/** 对候选池排序：分高者在前，首位即当前选中 */
export function rankCandidates(spec: PaletteSpec, cands: Candidate[]): Candidate[] {
  const poolSize = Math.max(1, cands.length);
  return cands
    .map((c) => {
      const { score, parts } = scoreCandidate(spec, c, poolSize);
      return { ...c, score, parts };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
