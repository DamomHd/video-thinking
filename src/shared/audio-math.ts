import { AudioLayer, SfxLayer, DuckSpec, MixFile } from './types';

export const roundSec = (sec: number): number => Math.round(sec * 10000) / 10000;
export const dbToLinear = (db: number): number => Math.pow(10, db / 20);
export const linearToDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-6));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * 新建配乐段的缺省音量（线性）。
 * 原来是 0.5–0.55：对照 loomcare.mp4 / 迁移汇报.mp4，参考片的配乐是一层持续托底的低频，
 * 我们的配乐压得太低，成片里音效一下一下很冲、中间发空（LRA 17 vs 参考 5–7）。
 * 只影响新建的段；已有段的 volume 写在 music.json 里，不受影响。
 */
export const DEFAULT_MUSIC_VOLUME = 0.8;

export const LAYER_BASE_VOL: Record<SfxLayer, number> = {
  BG: 0.32,
  TEX: 0.20,
  RISER: 0.50,
  WHOOSH: 0.50,
  IMPACT: 0.60,
  UI: 0.50,
};

/**
 * 计划生成时计算素材的归一化音量（目标峰值 -6 dBFS）
 */
export function calcPlanVolume(
  layer: SfxLayer,
  peakDb: number,
  paletteGain = 1.0
): number {
  const norm = Math.max(0.15, Math.min(1.6, dbToLinear(-6 - peakDb)));
  return roundSec(LAYER_BASE_VOL[layer] * norm * paletteGain);
}

/**
 * 计算三级增益乘积：片段增益 × 层推子 × Master 总线
 */
export function gainOf(
  key: string,
  layer: AudioLayer,
  gains: Record<string, number>,
  mix: MixFile
): number {
  if (mix.muted.includes(layer)) return 0;
  const itemDb = gains[key] ?? 0;
  const layerDb = mix.layers[layer] ?? 0;
  const masterDb = mix.master ?? 0;
  return dbToLinear(itemDb + layerDb + masterDb);
}

/**
 * 片段线性淡入淡出计算
 */
export function fadeAt(
  localSec: number,
  durSec: number,
  fadeInSec: number,
  fadeOutSec: number
): number {
  if (localSec < 0 || localSec > durSec) return 0;
  const inFactor = fadeInSec > 0 ? localSec / fadeInSec : 1;
  const outFactor = fadeOutSec > 0 ? (durSec - localSec) / fadeOutSec : 1;
  return clamp01(Math.min(inFactor, outFactor));
}

/**
 * 渲染端按帧取的淡化系数。
 *
 * Remotion 对一整帧的采样用同一个音量值。按帧起点算淡入（fadeAt(frame / fps)）时，第 0 帧系数是 0 ——
 * 每个音效开头一整帧（30fps 33ms、60fps 17ms）被静音，起音瞬态全丢，听起来比画面晚一帧、发软
 * （2026-10-26 实测：所有音效起音都晚整一帧，原始 <Sequence><Audio> 则是准的）。
 * 所以淡入按这一帧的**结束**时刻取、淡出按**开始**时刻取：首尾帧都不会被整帧吃掉，也更接近工作台里连续的淡化。
 */
export function frameFadeAt(frame: number, fps: number, durSec: number, fadeInSec: number, fadeOutSec: number): number {
  const start = frame / fps;
  const end = (frame + 1) / fps;
  if (start < 0 || start > durSec) return 0;
  const inFactor = fadeInSec > 0 ? end / fadeInSec : 1;
  const outFactor = fadeOutSec > 0 ? (durSec - start) / fadeOutSec : 1;
  return clamp01(Math.min(inFactor, outFactor));
}

/**
 * 等功率交叉淡化 (保证 cos² + sin² = 1，能量恒定)
 */
export function equalPowerCrossfade(progress01: number): { outGain: number; inGain: number } {
  const p = clamp01(progress01);
  const angle = p * (Math.PI / 2);
  return {
    outGain: Math.cos(angle),
    inGain: Math.sin(angle),
  };
}

export interface ActiveDuckTrigger {
  triggerStartSec: number;
  spec: DuckSpec;
}

/**
 * 计算某时刻对目标泳道的闪避/让位衰减系数
 */
export function duckAt(filmSec: number, targetLayer: AudioLayer, triggers: ActiveDuckTrigger[]): number {
  let minGain = 1.0;
  for (const { triggerStartSec, spec } of triggers) {
    if (!spec.layers.includes(targetLayer)) continue;
    const t0 = triggerStartSec - spec.preSec;
    const t1 = triggerStartSec;
    const t2 = triggerStartSec + spec.holdSec;
    const t3 = t2 + spec.releaseSec;

    if (filmSec <= t0 || filmSec >= t3) continue;
    const targetFloor = dbToLinear(spec.db);
    let g = 1.0;
    if (filmSec < t1) {
      const p = (filmSec - t0) / Math.max(spec.preSec, 1e-4);
      g = 1.0 + (targetFloor - 1.0) * p;
    } else if (filmSec <= t2) {
      g = targetFloor;
    } else {
      const p = (filmSec - t2) / Math.max(spec.releaseSec, 1e-4);
      g = targetFloor + (1.0 - targetFloor) * p;
    }
    if (g < minGain) minGain = g;
  }
  return minGain;
}
