/**
 * 素材包络测量 (Envelope Probe)
 * 对标 architecture.html §15.5「包络测量」：
 *   onset / peakAt / peakDb / dur 全部由真实 PCM 量出，缓存键 = 路径 + 大小 + 修改时间。
 * 计划生成的音量归一（峰值 → −6 dBFS）和 peak/onset 对齐全部依赖这里的真实数字。
 */

import fs from 'node:fs';
import path from 'node:path';
import { decodeMono, fileFingerprint, probeDurationSec } from './decode.js';

export interface Envelope {
  /** 可听起点（秒）：首个超过 −45 dBFS 相对门限的位置 */
  onsetSec: number;
  /** 峰值位置（秒） */
  peakAtSec: number;
  /** 峰值电平（dBFS） */
  peakDb: number;
  /** 真实时长（秒） */
  durSec: number;
  /** 测量来源：measured = 真实解码；missing = 文件不存在（调用方必须降级处理） */
  source: 'measured' | 'missing';
}

/**
 * 缓存算法版本：测量口径一改就必须作废旧缓存。
 * v2 = 下混从 `-ac 1` 换成按声道数的真平均 pan（旧口径对相关立体声会偏高约 3dB）。
 */
const PROBE_VERSION = 'v2';

type Cache = Record<string, Envelope & { fp: string }>;

export class EnvelopeProbe {
  private cachePath: string;
  private cache: Cache;
  private dirty = false;

  constructor(filmId: string) {
    const dir = path.join(process.cwd(), 'out', filmId);
    fs.mkdirSync(dir, { recursive: true });
    this.cachePath = path.join(dir, 'envelope-cache.json');
    this.cache = fs.existsSync(this.cachePath)
      ? JSON.parse(fs.readFileSync(this.cachePath, 'utf-8'))
      : {};
  }

  /**
   * 量一条素材的包络。file 是相对 public/ 的路径（与 sfxPlan.file 同口径）。
   */
  measure(publicRelFile: string): Envelope {
    const abs = path.join(process.cwd(), 'public', publicRelFile);
    const fp0 = fileFingerprint(abs);
    const fp = fp0 ? `${PROBE_VERSION}|${fp0}` : null;

    if (!fp) {
      return { onsetSec: 0, peakAtSec: 0, peakDb: -6, durSec: 0, source: 'missing' };
    }

    const hit = this.cache[publicRelFile];
    if (hit && hit.fp === fp) {
      const { fp: _ignored, ...env } = hit;
      return env;
    }

    const env = EnvelopeProbe.measureFile(abs);
    this.cache[publicRelFile] = { ...env, fp };
    this.dirty = true;
    return env;
  }

  flush(): void {
    if (!this.dirty) return;
    const tmp = `${this.cachePath}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2), 'utf-8');
    fs.renameSync(tmp, this.cachePath);
    this.dirty = false;
  }

  /** 纯测量：解码 PCM，量起音、峰位、峰值、时长 */
  static measureFile(absFile: string): Envelope {
    const dec = decodeMono(absFile);
    if (!dec) {
      const dur = probeDurationSec(absFile);
      return {
        onsetSec: 0,
        peakAtSec: 0,
        peakDb: -6,
        durSec: dur ?? 0,
        source: dur ? 'measured' : 'missing',
      };
    }

    const { mono, rate } = dec;

    // 1. 峰值与峰位
    let peak = 0;
    let peakIdx = 0;
    for (let i = 0; i < mono.length; i++) {
      const a = Math.abs(mono[i]);
      if (a > peak) {
        peak = a;
        peakIdx = i;
      }
    }
    const peakDb = peak > 1e-9 ? 20 * Math.log10(peak) : -120;

    // 2. 可听起点：首个超过「峰值 −45dB」且不低于 −60dBFS 绝对地板的 1ms 窗
    const relFloor = peak * Math.pow(10, -45 / 20);
    const absFloor = Math.pow(10, -60 / 20);
    const thresh = Math.max(relFloor, absFloor * 0.1);
    const win = Math.max(1, Math.round(rate * 0.001));
    let onsetIdx = 0;
    for (let i = 0; i + win <= mono.length; i += win) {
      let acc = 0;
      for (let j = i; j < i + win; j++) acc += mono[j] * mono[j];
      if (Math.sqrt(acc / win) >= thresh) {
        onsetIdx = i;
        break;
      }
    }

    return {
      onsetSec: Math.round((onsetIdx / rate) * 10000) / 10000,
      peakAtSec: Math.round((peakIdx / rate) * 10000) / 10000,
      peakDb: Math.round(peakDb * 100) / 100,
      durSec: Math.round((mono.length / rate) * 10000) / 10000,
      source: 'measured',
    };
  }
}
