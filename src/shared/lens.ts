/**
 * 光学原语：拉焦 (Rack Focus) + 纵深 (Lift)
 *
 * 参考片换内容几乎不用淡入淡出：旧标题在原位模糊着退场，
 * 新标题在**同一个位置**逐字从模糊里聚焦出来 —— 这是电影里的拉焦，
 * 景深一变，观众就觉得是「镜头」在看，而不是「页面」在换。
 *
 * 这里只出数（opacity / blurPx / dy），不碰 DOM；组件见 components/shot。
 */

import { clamp01, easeOutCubic } from './anim';
import { MIN_ACTION_SEC, stagger } from './motion';

export interface FocusState {
  opacity: number;
  /** 模糊半径（px）。< 0.3 时调用方应输出 filter:none，省掉合成层 */
  blurPx: number;
  /** 竖向偏移（px），聚焦时从下往上收 */
  dy: number;
}

/** 拉焦默认：模糊 12px、偏移 10px、0.5s —— 对齐参考片 26s / 96s 两处标题 */
export const FOCUS_DEFAULTS = { blurPx: 12, dyPx: 10, durSec: 0.5 } as const;

export interface FocusOptions {
  blurPx?: number;
  dyPx?: number;
}

function focusAt(q: number, o: FocusOptions): FocusState {
  const blur = o.blurPx ?? FOCUS_DEFAULTS.blurPx;
  const dy = o.dyPx ?? FOCUS_DEFAULTS.dyPx;
  return { opacity: q, blurPx: (1 - q) * blur, dy: (1 - q) * dy };
}

/** 从模糊聚焦到清晰。时长同样不短于 MIN_ACTION_SEC */
export function focusIn(
  t: number,
  from: number,
  durSec: number = FOCUS_DEFAULTS.durSec,
  o: FocusOptions = {}
): FocusState {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  return focusAt(easeOutCubic(clamp01((t - from) / d)), o);
}

/** 从清晰失焦退场：模糊变大、往上飘、变透明（和 focusIn 方向相反，读起来是「被推远」） */
export function focusOut(
  t: number,
  from: number,
  durSec: number = FOCUS_DEFAULTS.durSec * 0.8,
  o: FocusOptions = {}
): FocusState {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  const q = 1 - easeOutCubic(clamp01((t - from) / d));
  const s = focusAt(q, o);
  return { ...s, dy: -s.dy };
}

/**
 * 同一位置换内容的拉焦：旧的在 at 开始失焦，新的在 at + gapSec 开始聚焦。
 * gapSec 默认 0.2 —— 两者有交叠但旧的先走，不会两行字糊在一起。
 */
export function rackFocus(
  t: number,
  at: number,
  options: FocusOptions & { outSec?: number; inSec?: number; gapSec?: number } = {}
): { out: FocusState; in: FocusState } {
  const gap = options.gapSec ?? 0.2;
  return {
    out: focusOut(t, at, options.outSec, options),
    in: focusIn(t, at + gap, options.inSec, options),
  };
}

/**
 * 逐字聚焦：n 个字铺在 spanSec 里依次聚焦，每个字自己的聚焦时长不受 n 影响。
 * 返回第 i 个字的状态。
 */
export function charFocus(
  i: number,
  n: number,
  t: number,
  from: number,
  options: FocusOptions & { spanSec?: number; durSec?: number } = {}
): FocusState {
  const plan = stagger(n, options.spanSec ?? Math.min(0.6, 0.05 * n), {
    from,
    durSec: options.durSec ?? 0.45,
  });
  return focusIn(t, plan.at(i), plan.durSec, options);
}

/** 输出 CSS filter；模糊可忽略时返回 'none'，避免多余的合成层 */
export function blurFilter(blurPx: number): string {
  return blurPx < 0.3 ? 'none' : `blur(${blurPx.toFixed(2)}px)`;
}

/* ------------------------------------------------------------------ */
/* 纵深：卡片从纸面上浮起来                                             */
/* ------------------------------------------------------------------ */

export interface LiftState {
  /** 上浮像素（负值 = 往上） */
  dy: number;
  boxShadow: string;
}

/**
 * p ∈ [0,1]：0 贴在纸上（极淡的接触阴影），1 浮起（落差阴影拉长变软）。
 * 两层阴影：近处一层硬的定住接触面，远处一层软的给出高度 —— 只有一层会像贴纸。
 */
export function lift(p: number, options: { heightPx?: number; ink?: string } = {}): LiftState {
  const q = clamp01(p);
  const h = options.heightPx ?? 8;
  const ink = options.ink ?? '24,22,20';
  const a1 = (0.06 + 0.04 * q).toFixed(3);
  const a2 = (0.1 * q).toFixed(3);
  return {
    dy: -h * q,
    boxShadow:
      `0 ${(1 + q).toFixed(1)}px ${(2 + 2 * q).toFixed(1)}px rgba(${ink},${a1}), ` +
      `0 ${(2 + h * 1.6 * q).toFixed(1)}px ${(4 + h * 3.5 * q).toFixed(1)}px rgba(${ink},${a2})`,
  };
}
