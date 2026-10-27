/**
 * 真实音频解码层 (Audio Decode Layer)
 * 一律通过系统 ffmpeg/ffprobe 把任意音频解成 Float32 PCM 交给 Node 计算，
 * 不猜时长、不猜 BPM、不编造任何特征。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const DECODE_RATE = 48000;

export interface DecodedAudio {
  file: string;
  rate: number;
  durationSec: number;
  /** 单声道（下混）样本，用于分析 */
  mono: Float32Array;
}

/**
 * 进程内解码缓存：键 = 路径 + 大小 + 修改时间 + 采样率。
 * surgery / analyze / envelope 常常对同一个文件解码两三次，
 * 每次解码都要起 ffprobe + ffmpeg 两个进程；并行跑测试时这个争用会把墙钟时间放大一个量级。
 */
const decodeCache = new Map<string, DecodedAudio>();
const channelCache = new Map<string, number>();
/** 缓存上限：音频是 Float32，几条 30s 的轨就是几十 MB，别无限涨 */
const DECODE_CACHE_MAX = 8;

function cacheKey(file: string, rate: number): string | null {
  const fp = fileFingerprint(file);
  return fp ? `${fp}|${rate}` : null;
}

/** 清空解码缓存（长流程里换了素材后可以手动清） */
export function clearDecodeCache(): void {
  decodeCache.clear();
  channelCache.clear();
}

/** ffprobe 读声道数；读不到按 2 处理 */
export function probeChannels(file: string): number {
  const key = fileFingerprint(file);
  if (key && channelCache.has(key)) return channelCache.get(key)!;
  const v = probeChannelsUncached(file);
  if (key) channelCache.set(key, v);
  return v;
}

function probeChannelsUncached(file: string): number {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels',
        '-of', 'default=nw=1:nk=1', file],
      { encoding: 'utf-8' }
    ).trim();
    const v = Number(out);
    return Number.isFinite(v) && v > 0 ? v : 2;
  } catch {
    return 2;
  }
}

/** ffprobe 读真实时长（秒）；读不到返回 null，绝不假设 */
export function probeDurationSec(file: string): number | null {
  if (!fs.existsSync(file)) return null;
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { encoding: 'utf-8' }
    ).trim();
    const v = Number(out);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 解码为单声道 Float32（真实 PCM，非合成）。
 * 下混用显式的 pan 平均，而不是 `-ac 1`：ffmpeg 的默认立体声下混对相关声道会抬高约 3dB，
 * 那会让计划生成里的「峰值归一到 −6dBFS」整体偏 3dB。
 */
export function decodeMono(file: string, rate = DECODE_RATE): DecodedAudio | null {
  if (!fs.existsSync(file)) return null;

  const key = cacheKey(file, rate);
  if (key) {
    const hit = decodeCache.get(key);
    if (hit) return hit;
  }

  const ch = probeChannels(file);
  const pan =
    ch <= 1
      ? 'pan=mono|c0=c0'
      : 'pan=mono|c0=' + Array.from({ length: ch }, (_, i) => `${(1 / ch).toFixed(6)}*c${i}`).join('+');

  let raw: Buffer;
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-af', pan, '-ar', String(rate), '-f', 'f32le', '-'],
      { maxBuffer: 1024 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
  const n = Math.floor(raw.byteLength / 4);
  if (n === 0) return null;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = raw.readFloatLE(i * 4);

  const decoded: DecodedAudio = { file, rate, durationSec: n / rate, mono };
  if (key) {
    if (decodeCache.size >= DECODE_CACHE_MAX) {
      const oldest = decodeCache.keys().next().value;
      if (oldest !== undefined) decodeCache.delete(oldest);
    }
    decodeCache.set(key, decoded);
  }
  return decoded;
}

/** 文件指纹：路径 + 大小 + 修改时间（与原版缓存键口径一致） */
export function fileFingerprint(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const st = fs.statSync(file);
  return `${file}|${st.size}|${Math.round(st.mtimeMs)}`;
}

/** 逐窗 RMS，返回 dBFS 序列（窗长默认 10ms，与原版分析口径一致） */
export function windowRmsDb(x: Float32Array, rate: number, hopSec = 0.01): number[] {
  const hop = Math.max(1, Math.round(rate * hopSec));
  const out: number[] = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let acc = 0;
    for (let j = i; j < i + hop; j++) acc += x[j] * x[j];
    const rms = Math.sqrt(acc / hop);
    out.push(rms > 1e-9 ? 20 * Math.log10(rms) : -120);
  }
  return out;
}

/** dB 一阶差分的正半波（谱通量 / 能量通量） */
export function positiveFlux(db: number[]): number[] {
  const out = new Array(db.length).fill(0);
  for (let i = 1; i < db.length; i++) {
    const d = db[i] - db[i - 1];
    out[i] = d > 0 ? d : 0;
  }
  return out;
}

export interface DecodedStereo {
  rate: number;
  L: Float32Array;
  R: Float32Array;
}

/**
 * 立体声解码。
 *
 * 分析一律用 decodeMono（下混更稳），但**产出音频**不能用它 ——
 * 拿 mono 当 L 和 R 写回去会把立体声压成单声道，
 * 乐句重排这种「剪完还要当成片素材用」的环节必须保住原声像。
 * 单声道源就两边都给同一路。
 */
export function decodeStereo(file: string, rate = DECODE_RATE): DecodedStereo | null {
  if (!fs.existsSync(file)) return null;
  let raw: Buffer;
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(rate), '-f', 'f32le', '-'],
      { maxBuffer: 1024 * 1024 * 1024 }
    );
  } catch {
    return null;
  }
  const frames = Math.floor(raw.byteLength / 8);
  if (frames === 0) return null;
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    L[i] = raw.readFloatLE(i * 8);
    R[i] = raw.readFloatLE(i * 8 + 4);
  }
  return { rate, L, R };
}
