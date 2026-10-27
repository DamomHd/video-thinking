/**
 * 持续运动原语 (Continuous Motion)
 *
 * 为什么要单独有这一层 —— 实测出来的问题：
 *
 *   把本仓库出的片子和一条参考片逐帧比（320×180 灰度，相邻帧平均绝对差）：
 *
 *                      有动作的段   段中位时长   细微运动帧   大幅跳变帧
 *     参考片 185s         73 段       0.26s        15%          0%
 *     本仓库 30s           8 段       0.03s         0%          2%
 *
 *   段数折算后差不多（50 vs 73），但**每段的时长差了近 10 倍**：
 *   参考片一个动作平均铺 0.26 秒，本仓库平均 0.03 秒 —— 不到两帧。
 *   元素是「蹦」出来的，不是「长」出来的。
 *
 *   而且 0.2–1 那一档（缓慢细微的运动）本仓库是 0%：
 *   画面要么完全冻住，要么突变，中间那条让人觉得「活着」的带子是空的。
 *
 * anim.ts 里的 easeOutCubic / spring / tw 解决的是「怎么从 A 动到 B」，
 * 这里解决的是「动多久」和「停下来之后还动不动」—— 是两件事。
 */

import { clamp01, easeOutCubic, easeInOutCubic } from './anim';

/* ------------------------------------------------------------------ */
/* 1. 最短动作时长                                                      */
/* ------------------------------------------------------------------ */

/**
 * 一个动作至少要铺多久才看得出是「长出来的」。
 * 0.15s @60fps = 9 帧。低于这个数，观众感知到的是突变而不是运动。
 * （参考片的动作段中位数是 0.26s，所以这是下限不是目标。）
 */
export const MIN_ACTION_SEC = 0.15;

/** 舒服的默认动作时长 —— 对齐参考片的中位数 */
export const COMFY_ACTION_SEC = 0.26;

/* ------------------------------------------------------------------ */
/* 2. draw —— 带最短时长保证的「画出来」                                */
/* ------------------------------------------------------------------ */

/**
 * 描边 / 浮现的进度，**强制不短于 MIN_ACTION_SEC**。
 *
 * 和直接写 `easeOutCubic(tw(t, from, from + 0.1))` 的区别：
 * 那样写出来是 6 帧的突变，这里会被抬到 9 帧并给出可检查的时长。
 *
 * @param t      本幕秒
 * @param from   起始秒
 * @param durSec 希望的时长（会被抬到不小于 MIN_ACTION_SEC）
 */
export function draw(t: number, from: number, durSec = COMFY_ACTION_SEC): number {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  return easeOutCubic(clamp01((t - from) / d));
}

/** 同 draw，但两头都缓 —— 适合线条从左画到右这种有「起笔收笔」的动作 */
export function stroke(t: number, from: number, durSec = COMFY_ACTION_SEC * 2): number {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  return easeInOutCubic(clamp01((t - from) / d));
}

/* ------------------------------------------------------------------ */
/* 3. stagger —— 一组元素依次出现                                       */
/* ------------------------------------------------------------------ */

export interface StaggerPlan {
  /** 第 i 个元素的起始秒 */
  at: (i: number) => number;
  /** 每个元素的动作时长 */
  durSec: number;
  /** 整组从开始到最后一个结束，总共占多久 */
  totalSec: number;
}

/**
 * 把 n 个元素铺在 spanSec 秒里依次出现。
 *
 * 关键是**每个元素自己的动作时长不受 n 影响** ——
 * 之前的写法是 `from + i * 0.02`，元素一多、间隔一压，
 * 每个元素实际可见的运动就只剩一两帧，整组看起来像「唰」地刷出来。
 * 这里把「间隔」和「单个时长」拆开：间隔可以很密，单个动作照样铺满 0.26s。
 */
export function stagger(
  n: number,
  spanSec: number,
  options: { from?: number; durSec?: number } = {}
): StaggerPlan {
  const from = options.from ?? 0;
  const durSec = Math.max(MIN_ACTION_SEC, options.durSec ?? COMFY_ACTION_SEC);
  const step = n > 1 ? spanSec / (n - 1) : 0;
  return {
    at: (i: number) => from + step * i,
    durSec,
    totalSec: spanSec + durSec,
  };
}

/* ------------------------------------------------------------------ */
/* 4. drift —— 永不停止的缓慢位移                                       */
/* ------------------------------------------------------------------ */

/**
 * 长周期的缓慢往复，**没有终点**。
 *
 * 这是填补 0.2–1 那一档的主力：画面主体静止时，
 * 让底纹 / 标注 / 光晕以十几秒的周期轻轻漂，
 * 观众说不出哪里在动，但不会觉得这是一张静态图。
 *
 * 用正弦而不是随机：逐帧纯函数，同一帧两次渲染结果必须一致。
 *
 * @param t         片内秒（用全片时间，不是幕内时间 —— 跨幕要连续）
 * @param periodSec 周期，建议 8–20s。太短会变成「呼吸」，太长等于没动
 * @param amp       幅度（像素 / 比例，由调用方决定单位）
 * @param phase     相位 0–1，让多个元素错开
 */
export function drift(t: number, periodSec = 14, amp = 1, phase = 0): number {
  return Math.sin(((t / periodSec) + phase) * Math.PI * 2) * amp;
}

/**
 * 缓慢的明暗/缩放呼吸，范围 [min, max]。
 * 和 drift 的区别只是输出区间不同，分开是为了调用处读起来直白。
 */
export function breathe(t: number, periodSec = 11, min = 0.92, max = 1.0, phase = 0): number {
  const u = 0.5 + 0.5 * Math.sin(((t / periodSec) + phase) * Math.PI * 2);
  return min + (max - min) * u;
}

/* ------------------------------------------------------------------ */
/* 5. settle —— 到位之后不要硬停                                        */
/* ------------------------------------------------------------------ */

/**
 * 动作结束后，让元素以极小的幅度继续沉降一段时间。
 *
 * 返回一个 0 附近的偏移量：动作期间是 0（位置由 draw 控制），
 * 动作结束后的 settleSec 秒里做一次衰减振荡，幅度只有 ampPx。
 *
 * 作用是消掉「啪一下定住」的机械感。幅度要小到说不出来 —— 1–3px 足够。
 */
export function settle(
  t: number,
  from: number,
  durSec: number,
  options: { settleSec?: number; ampPx?: number } = {}
): number {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  const settleSec = options.settleSec ?? 0.9;
  const ampPx = options.ampPx ?? 2;
  const after = t - (from + d);
  if (after <= 0 || after >= settleSec) return 0;
  const u = after / settleSec;
  return Math.sin(u * Math.PI * 3) * ampPx * (1 - u) * (1 - u);
}

/* ------------------------------------------------------------------ */
/* 6. 亮暗切换：要么一帧，要么足够长                                     */
/* ------------------------------------------------------------------ */

/**
 * 亮场 ↔ 暗场之间的交叠时长，低于这个值就不该用淡化。
 *
 * 实测：米白纸底和纯黑底之间做 250ms 交叉淡化，
 * 中间 15 帧是一团灰浆 —— 既不干脆也不平滑，是最差的选项。
 * 参考片同样有亮暗切换，它用的是**单帧硬切**。
 *
 * 所以规则是二选一：
 *   · 硬切（overlap = 0，enter = 'none'）—— 干脆，推荐
 *   · 淡化但要铺够 ≥ 0.8s，让灰浆变成有意的过渡
 */
export const MIN_POLARITY_CROSSFADE_SEC = 0.8;

/**
 * 判断一次幕间过渡该不该用淡化。
 * 同极性（都亮或都暗）随便；跨极性要么硬切要么铺够。
 */
export function polarityTransitionOk(
  fromDark: boolean,
  toDark: boolean,
  overlapSec: number
): { ok: boolean; reason?: string } {
  if (fromDark === toDark) return { ok: true };
  if (overlapSec <= 1e-6) return { ok: true }; // 硬切
  if (overlapSec >= MIN_POLARITY_CROSSFADE_SEC) return { ok: true };
  return {
    ok: false,
    reason:
      `亮暗之间用了 ${overlapSec.toFixed(2)}s 的淡化 —— ` +
      `两边底色差太远，这个长度只会糊成灰浆。` +
      `要么硬切（overlap=0 / enter='none'），要么铺够 ${MIN_POLARITY_CROSSFADE_SEC}s`,
  };
}

/* ------------------------------------------------------------------ */
/* 7. 落点对齐：让动作「到位」的那一帧踩在拍上，而不是起点                   */
/* ------------------------------------------------------------------ */

/**
 * 卡点卡的是落点。一个元素弹进来，观众感受到「咚」的是它到位、冲击最强的那一帧；
 * 只把起点对在拍上，落点就晚了半个动作，看起来总慢半拍。
 *
 * 落点的定义：缓动进度第一次到达 landAt（缺省 0.98，肉眼已认为到位）的时刻。
 * easeOutCubic 在 73% 处到 0.98，所以一个 0.4s 的动作要提前约 0.29s 开始。
 * 带回弹的缓动（spring / overshoot）第一次越过 1 就是冲击点，landAt 传 1。
 */
export function landingFraction(ease: (p: number) => number, landAt = 0.98): number {
  const STEPS = 2000;
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    if (ease(p) >= landAt) return p;
  }
  return 1;
}

/**
 * 给定拍点和动作时长，算出动作该从什么时候开始，使落点正好在 beatSec。
 * 时长同样不短于 MIN_ACTION_SEC（和 draw 口径一致）。
 */
export function landOn(
  beatSec: number,
  durSec: number = COMFY_ACTION_SEC,
  options: { ease?: (p: number) => number; landAt?: number } = {}
): number {
  const d = Math.max(MIN_ACTION_SEC, durSec);
  return beatSec - d * landingFraction(options.ease ?? easeOutCubic, options.landAt);
}

/**
 * 物理弹簧（anim.spring，按秒）第一次越过 1 的时刻 —— 冲击点。
 * 用来把弹簧动作的起点往前挪：start = beatSec − springImpactSec(config)。
 */
export function springImpactSec(spring: (t: number) => number, maxSec = 3, landAt = 1): number {
  const STEP = 1 / 2000;
  for (let t = 0; t <= maxSec; t += STEP) if (spring(t) >= landAt) return t;
  return maxSec;
}

/** draw 的落点版：动作在 beatSec 落定（缓动 easeOutCubic，进度 0.98 处算落点） */
export function drawLanding(t: number, beatSec: number, durSec = COMFY_ACTION_SEC): number {
  return draw(t, landOn(beatSec, durSec), durSec);
}
