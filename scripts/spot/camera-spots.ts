/**
 * 按摄影机速度派生 spot (对标 architecture.html §15.1 的第二种来源)
 *
 * 原版口径（V5 / V6）：按 camAt 的速度自动出事件 ——
 *   WHOOSH：运动 ≥ 4 帧
 *   RISER ：运动 ≥ 24 帧时，在前 20 帧加一条
 *   IMPACT：到位后 12 帧
 *
 * 这里把「帧」换算成秒（本仓库全秒制），阈值仍按 30fps 口径折算，
 * 这样换 fps 不会改变编舞语义。
 */

import { CamKey, CameraState, evalCamera } from '../../src/shared/camera.js';
import { SpotAnnotation } from '../../src/shared/types.js';

/** 阈值按 30fps 帧数折算成秒 */
const F = (frames: number) => frames / 30;

export interface CameraSpotOptions {
  /** 采样步长（秒），默认 1/30 */
  stepSec?: number;
  /** 判定"在运动"的速度门限：每秒的归一化位移 */
  moveThreshold?: number;
  /** 槽名前缀，拼出 <前缀>Whoosh / Riser / Impact */
  slotPrefix: string;
  /** 只在这个区间里派生 */
  fromSec?: number;
  toSec?: number;
}

export interface CameraMove {
  fromSec: number;
  toSec: number;
  durSec: number;
  /** 这一段运动的峰值速度 */
  peakSpeed: number;
  /** 位移量（归一化） */
  distance: number;
}

/**
 * 相机状态之间的归一化距离。
 * z 用对数差（推拉在对数域才是线性感知的，与 camera.ts 的 lerpLog 同源），
 * 平移按视口宽度归一，旋转按度数折算。
 */
export function camDistance(a: CameraState, b: CameraState, viewWidth = 1920): number {
  const dx = (b.x - a.x) / viewWidth;
  const dy = (b.y - a.y) / viewWidth;
  const dz = Math.log(Math.max(b.z, 1e-6)) - Math.log(Math.max(a.z, 1e-6));
  const drx = ((b.rx ?? 0) - (a.rx ?? 0)) / 90;
  const dry = ((b.ry ?? 0) - (a.ry ?? 0)) / 90;
  const drz = ((b.rz ?? 0) - (a.rz ?? 0)) / 90;
  return Math.hypot(dx, dy, dz, drx, dry, drz);
}

/** 逐帧采样相机速度，切出「在运动」的连续区段 */
export function detectCameraMoves(
  keys: CamKey[],
  totalSec: number,
  options: Pick<CameraSpotOptions, 'stepSec' | 'moveThreshold' | 'fromSec' | 'toSec'> = {}
): CameraMove[] {
  const step = options.stepSec ?? F(1);
  const threshold = options.moveThreshold ?? 0.012;
  const from = options.fromSec ?? 0;
  const to = Math.min(options.toSec ?? totalSec, totalSec);

  const moves: CameraMove[] = [];
  let start: number | null = null;
  let peak = 0;
  let acc = 0;

  for (let t = from; t + step <= to; t += step) {
    const a = evalCamera(keys, t);
    const b = evalCamera(keys, t + step);
    const speed = camDistance(a, b) / step;

    if (speed >= threshold) {
      if (start === null) {
        start = t;
        peak = 0;
        acc = 0;
      }
      peak = Math.max(peak, speed);
      acc += speed * step;
    } else if (start !== null) {
      moves.push({
        fromSec: r4(start),
        toSec: r4(t),
        durSec: r4(t - start),
        peakSpeed: r4(peak),
        distance: r4(acc),
      });
      start = null;
    }
  }

  if (start !== null) {
    moves.push({
      fromSec: r4(start),
      toSec: r4(to),
      durSec: r4(to - start),
      peakSpeed: r4(peak),
      distance: r4(acc),
    });
  }

  return moves;
}

/**
 * 把运动区段翻成 spot 标注。
 * 返回的条目带 `src: 'camera'`，守门和报告里可以和语义标注区分开。
 */
export function cameraSpots(
  keys: CamKey[],
  totalSec: number,
  options: CameraSpotOptions
): SpotAnnotation[] {
  const moves = detectCameraMoves(keys, totalSec, options);
  const p = options.slotPrefix;
  const out: SpotAnnotation[] = [];

  for (const [i, m] of moves.entries()) {
    const n = i + 1;

    // WHOOSH：运动 ≥ 4 帧
    if (m.durSec >= F(4)) {
      out.push({
        id: `镜头运动${n}`,
        fromSec: m.fromSec,
        toSec: m.toSec,
        layer: 'WHOOSH',
        slot: `${p}Whoosh`,
        what: `镜头运动 ${m.durSec.toFixed(2)}s（峰值速度 ${m.peakSpeed}）`,
      });
    }

    // RISER：运动 ≥ 24 帧时，在前 20 帧加一条
    if (m.durSec >= F(24)) {
      out.push({
        id: `镜头起势${n}`,
        fromSec: r4(Math.max(0, m.toSec - F(20))),
        toSec: m.toSec,
        layer: 'RISER',
        slot: `${p}Riser`,
        what: `长运动前的起势（总长 ${m.durSec.toFixed(2)}s）`,
      });
    }

    // IMPACT：到位后 12 帧
    if (m.durSec >= F(4)) {
      out.push({
        id: `镜头到位${n}`,
        fromSec: m.toSec,
        toSec: r4(Math.min(totalSec, m.toSec + F(12))),
        layer: 'IMPACT',
        slot: `${p}Impact`,
        what: `镜头到位`,
      });
    }
  }

  return out;
}

const r4 = (v: number) => Math.round(v * 10000) / 10000;
