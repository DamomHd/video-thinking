/**
 * huashu-clip 画法片段的数据（spec）与配声（纯函数，Node 可跑）。
 *
 * 一个片段 = 一个画法（grammar）+ 一串提示点（cues）：{ at 秒, kind 类型, text / sub / data }。
 * 画法负责怎么画（src/vendor/huashu-clip，渲染组件 src/components/clip/ClipCanvas）；
 * 这里把提示点换成本工程的动作事件（shared/events），配声就和别的画面一样走 autoSpots。
 * 各画法认哪些 kind、data 怎么写，见对应画法文件开头的注释（src/vendor/huashu-clip/grammars/*.js）。
 */

import { MotionEvent, MotionKind } from './events';

export type ClipGrammar = 't1_3b1b' | 't2_keynote_ui' | 't3_finance_chart' | 'y1_kurzgesagt' | 'y2_vox' | 'y3_whiteboard' | 'y5_kinetic_type';

export interface ClipCue {
  at: number;
  kind: string;
  text?: string;
  sub?: string;
  image?: string;
  dur?: number;
  data?: Record<string, unknown>;
  /** false = 这个提示点不配声；字符串 = 指定上游的音效名（本工程忽略，仍按 kind 配） */
  sfx?: string | false;
  [k: string]: unknown;
}

export interface ClipSpec {
  grammar: ClipGrammar;
  /** 片段长度（秒，乘 pace 前） */
  duration: number;
  /** 所有时刻乘这个倍数（>1 放慢）；上游示例数据比实际节奏密 2.5–3 倍 */
  pace?: number;
  fps?: number;
  width?: number;
  height?: number;
  /** 透明底（叠在别的画面上） */
  alpha?: boolean;
  safe?: { top?: number; bottom?: number; left?: number; right?: number; fill?: string };
  theme?: Record<string, unknown>;
  data?: Record<string, unknown>;
  cues: ClipCue[];
}

/** 各画法的中文名（文档、日志用） */
export const CLIP_GRAMMARS: Record<ClipGrammar, string> = {
  t1_3b1b: '公式讲解（3Blue1Brown 式）',
  t2_keynote_ui: '发布会卡片',
  t3_finance_chart: '金融图表',
  y1_kurzgesagt: '科普插画（Kurzgesagt 式）',
  y2_vox: '拼贴论证（Vox 式）',
  y3_whiteboard: '白板推演',
  y5_kinetic_type: '动态文字',
};

/**
 * 提示点类型 → 动作事件类型。照上游 clip.js 的 C.SFX（title 渐起、point 弹出、number 滚动计数、highlight / line / draw 描、
 * bar / candle 嗒、enter 嗖、image / clip 纸张、insert 弹出、react 弹跳）；
 * 上游没配声的几类（equation / card / step / custom）本工程也配上：卡片落定、公式聚焦、步骤弹出——元素出现就要有声。
 * [动作类型, 持续秒（描 / 渐起类）]
 */
const KIND_MAP: Record<string, [MotionKind, number]> = {
  title: ['reveal', 0.6],
  point: ['pop', 0],
  number: ['count', 0.8],
  highlight: ['draw', 0.5],
  bar: ['pop', 0],
  candle: ['pop', 0],
  line: ['draw', 0.8],
  enter: ['morph', 0],
  image: ['reveal', 0.5],
  clip: ['reveal', 0.5],
  insert: ['pop', 0],
  react: ['stamp', 0],
  draw: ['draw', 0.6],
  equation: ['focus', 0],
  card: ['land', 0],
  step: ['pop', 0],
  custom: ['pop', 0],
};

/**
 * 片段的提示点 → 动作事件（片段放在全片 offsetSec 秒开始）。
 * 时刻乘 pace（和渲染端 ClipCues.prepare 一致，不含口播锚点）；cue.sfx === false 记为留白；认不出的类型也记留白并写明。
 * 同类型的提示点带 index / of，落定类（land / pop）可以按调内音阶走序列。
 */
export function clipEvents(spec: ClipSpec, options: { offsetSec?: number; idPrefix?: string } = {}): MotionEvent[] {
  const off = options.offsetSec ?? 0;
  const pace = spec.pace && spec.pace > 0 ? spec.pace : 1;
  const prefix = options.idPrefix ?? CLIP_GRAMMARS[spec.grammar] ?? spec.grammar;
  const dur = (spec.duration || 0) * pace;
  const cues = spec.cues
    .map((q, i) => ({ q, i, at: (Number(q.at) || 0) * pace }))
    .filter((c) => c.at <= dur + 1e-9)
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const totals: Record<string, number> = {};
  cues.forEach(({ q }) => (totals[q.kind] = (totals[q.kind] ?? 0) + 1));
  const seen: Record<string, number> = {};
  return cues.map(({ q, at }) => {
    const n = (seen[q.kind] = (seen[q.kind] ?? 0) + 1);
    const id = `${prefix} · ${q.kind} ${n}`;
    const m = KIND_MAP[q.kind];
    const t = off + at;
    if (!m) return { id, kind: 'pop', at: t, land: t, silent: `故意不单独配声：画法 ${spec.grammar} 的提示点类型 ${q.kind} 没有对应的声音` };
    const [kind, sustain] = m;
    const e: MotionEvent =
      kind === 'count'
        ? { id, kind, at: t - sustain, land: t, end: t, count: { from: 0, to: Number((q.data as { value?: number } | undefined)?.value ?? 0) } }
        : sustain > 0
          ? { id, kind, at: t, land: t + sustain, end: t + sustain }
          : { id, kind, at: t, land: t, index: n - 1, of: totals[q.kind] };
    if (q.sfx === false) e.silent = '故意不单独配声：片段数据里 sfx: false';
    return e;
  });
}
