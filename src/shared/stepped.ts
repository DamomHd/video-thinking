/**
 * 定格节奏 (Stepped / On Twos)
 *
 * 定格动画、黏土、剪纸、手绘逐帧动画的「顿挫感」来自两件事：
 *   1. 画面每隔 2–3 帧才变一次（on twos / on threes）—— 不是低帧率，是成片 60fps 里有节奏地停顿
 *   2. 每一张「拍摄帧」之间物体有轻微的错位（手摆模型摆不到完全一样的位置）
 *
 * 用法：把传给编舞的时间换成 stepTime(t, 12)，整个画面就变成 12 张/秒的定格节奏；
 * 再给元素叠一个 stepJitter，每张拍摄帧带一点点不同的错位。
 * 纯函数、按种子，同一帧每次渲出来一样。
 */

import { createRng } from './anim';

/** 时间量化到每秒 stepFps 张：on twos @24fps = 12，on threes = 8 */
export function stepTime(t: number, stepFps: number): number {
  if (stepFps <= 0) return t;
  return Math.floor(t * stepFps + 1e-9) / stepFps;
}

/** 第几张拍摄帧 */
export function stepIndex(t: number, stepFps: number): number {
  return Math.floor(t * stepFps + 1e-9);
}

export interface StepJitter {
  dx: number;
  dy: number;
  /** 旋转（度） */
  rot: number;
  /** 缩放偏差（1 附近） */
  scale: number;
}

/**
 * 每张拍摄帧一组固定的错位（同一张帧内不变，换帧才变）。
 * ampPx 1–2 像素就够：大了就从「手作感」变成「抖」。
 */
export function stepJitter(
  t: number,
  stepFps: number,
  seed: number,
  options: { ampPx?: number; rotDeg?: number; scaleAmp?: number } = {}
): StepJitter {
  const rng = createRng(seed * 7919 + stepIndex(t, stepFps) * 104729);
  const u = () => rng() * 2 - 1;
  return {
    dx: u() * (options.ampPx ?? 1.2),
    dy: u() * (options.ampPx ?? 1.2),
    rot: u() * (options.rotDeg ?? 0.3),
    scale: 1 + u() * (options.scaleAmp ?? 0.004),
  };
}

/** 错位 → CSS transform */
export function jitterTransform(j: StepJitter): string {
  return `translate(${j.dx.toFixed(2)}px, ${j.dy.toFixed(2)}px) rotate(${j.rot.toFixed(3)}deg) scale(${j.scale.toFixed(4)})`;
}
