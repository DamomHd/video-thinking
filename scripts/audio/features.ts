/**
 * 声学画像提取 (Acoustic Profiling)
 * 对标 architecture.html §15.3「声学画像」：从免费的低清预览量起音、尾长、亮度、起势、峰均差。
 * 全部数字来自真实解码，不可用时返回 null —— 打分函数会据此给 0 分，而不是蒙一个值。
 */

import { decodeMono, windowRmsDb } from './decode.js';
import { biquad } from '../composer/dsp.js';
import { AcousticFeatures } from '../epidemic/scoring.js';

export function extractFeatures(absFile: string): AcousticFeatures | null {
  const dec = decodeMono(absFile);
  if (!dec || dec.mono.length < 256) return null;

  const { mono, rate } = dec;

  // 峰值与峰位
  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < mono.length; i++) {
    const a = Math.abs(mono[i]);
    if (a > peak) {
      peak = a;
      peakIdx = i;
    }
  }
  if (peak < 1e-7) return null;
  const peakDb = 20 * Math.log10(peak);

  // 起音：从可听起点到峰值的时间
  const thresh = peak * Math.pow(10, -40 / 20);
  let onsetIdx = 0;
  for (let i = 0; i < mono.length; i++) {
    if (Math.abs(mono[i]) >= thresh) {
      onsetIdx = i;
      break;
    }
  }
  const attackMs = Math.max(0, ((peakIdx - onsetIdx) / rate) * 1000);

  // 尾长：峰后衰减到 −35dB 相对峰值所用时间
  const tailThresh = peak * Math.pow(10, -35 / 20);
  let tailIdx = mono.length - 1;
  for (let i = mono.length - 1; i > peakIdx; i--) {
    if (Math.abs(mono[i]) >= tailThresh) {
      tailIdx = i;
      break;
    }
  }
  const tailMs = Math.max(0, ((tailIdx - peakIdx) / rate) * 1000);

  // 亮度：>2500Hz 的能量占比
  const high = biquad(mono, 'hp', 2500);
  const eAll = energy(mono);
  const eHigh = energy(high);
  const bright = eAll > 0 ? Math.min(1, eHigh / eAll) : 0;

  // 起势：后半段 RMS 相对前半段，映射到 0~1（0.5 = 持平，>0.6 = 渐强）
  const half = Math.floor(mono.length / 2);
  const rmsA = Math.sqrt(energy(mono.subarray(0, half)) / Math.max(1, half));
  const rmsB = Math.sqrt(energy(mono.subarray(half)) / Math.max(1, mono.length - half));
  const ratioDb = 20 * Math.log10(Math.max(rmsB, 1e-9) / Math.max(rmsA, 1e-9));
  const rise = Math.max(0, Math.min(1, 0.5 + ratioDb / 24));

  // 峰均差 (crest factor, dB)
  const rmsAll = Math.sqrt(energy(mono) / mono.length);
  const crest = 20 * Math.log10(peak / Math.max(rmsAll, 1e-9));

  // 10ms 窗序列只用于稳定性检查，避免个别爆点主导
  const dbSeq = windowRmsDb(mono, rate, 0.01);
  if (dbSeq.length === 0) return null;

  return {
    attackMs: Math.round(attackMs * 10) / 10,
    tailMs: Math.round(tailMs),
    bright: Math.round(bright * 1000) / 1000,
    rise: Math.round(rise * 1000) / 1000,
    crest: Math.round(crest * 100) / 100,
    peakDb: Math.round(peakDb * 100) / 100,
  };
}

function energy(x: Float32Array): number {
  let acc = 0;
  for (let i = 0; i < x.length; i++) acc += x[i] * x[i];
  return acc;
}
