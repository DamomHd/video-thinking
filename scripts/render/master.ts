/**
 * 响度母带：把混音拉到 −14 LUFS、真峰不超过 −1.2 dBTP（目标借鉴 lemo-opuscar 的 core/render/mux.sh）。
 *
 * 不用 loudnorm 的动态模式：我们的混音峰均比大（静默后重击），线性增益一拉就超真峰，loudnorm 会退回动态模式，
 * 实测把 LRA 从 5.0 压到 2.3 —— 「静 → 重击」的反差被压平。所以改成：
 *   限幅器只削瞬态（ceiling = 目标真峰 − 增益 − 余量，latency=true 补偿前瞻延迟，时间轴不动）→ 纯增益；
 *   第一遍按量到的响度算增益，第二遍按限幅后的实际响度补差（限幅会吃掉一点能量）。
 * 几乎无声的混音（整合响度 < −60 LUFS）不处理，原样返回并告警。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export const MASTER_LUFS = -14;
export const MASTER_TP = -1.2;
/** 限幅器按采样峰工作，真峰会比它高一点，AAC 编码还会再冒一点（实测 0.6 dB 余量编码后真峰 −1.0）：多留的余量（dB） */
const TP_MARGIN = 1.0;

/** ebur128 的汇总：整合响度、真峰 */
export function parseEbur(stderr: string): { i: number | null; tp: number | null } {
  const last = (re: RegExp) => {
    const all = [...stderr.matchAll(re)];
    return all.length ? Number(all[all.length - 1][1]) : null;
  };
  return { i: last(/^\s*I:\s+(-?[\d.]+)\s+LUFS/gm), tp: last(/^\s*Peak:\s+(-?[\d.]+)\s+dBFS/gm) };
}

function runStderr(args: string[]): string {
  const r = spawnSync('ffmpeg', args, { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg 失败：${String(r.stderr).slice(-400)}`);
  return String(r.stderr);
}

function measure(file: string) {
  return parseEbur(runStderr(['-hide_banner', '-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-']));
}

/** 限幅 + 增益：ceiling 让「加完增益后的峰」落在目标真峰以下 */
export function chainFor(gainDb: number): string {
  const ceilDb = Math.min(0, MASTER_TP - TP_MARGIN - gainDb);
  const lin = Math.max(0.0625, Math.pow(10, ceilDb / 20));
  return `alimiter=limit=${lin.toFixed(5)}:attack=1:release=50:level=false:latency=true,volume=${gainDb.toFixed(2)}dB,aresample=48000`;
}

export function masterLoudness(inWav: string, outWav: string): { before: number; after: number | null; truePeak: number | null; gainDb: number; skipped?: string } {
  const m0 = measure(inWav);
  const before = m0.i ?? -70;
  if (!(before > -60)) {
    fs.copyFileSync(inWav, outWav);
    return { before, after: null, truePeak: m0.tp, gainDb: 0, skipped: `混音几乎无声（${before} LUFS），不做响度处理` };
  }
  let gain = MASTER_LUFS - before;
  for (let pass = 0; pass < 2; pass++) {
    runStderr(['-hide_banner', '-nostats', '-y', '-i', inWav, '-af', chainFor(gain), '-c:a', 'pcm_s24le', outWav]);
    const m = measure(outWav);
    if (m.i === null || Math.abs(m.i - MASTER_LUFS) < 0.3) return { before, after: m.i, truePeak: m.tp, gainDb: gain };
    gain += MASTER_LUFS - m.i;
  }
  const m = measure(outWav);
  return { before, after: m.i, truePeak: m.tp, gainDb: gain };
}
