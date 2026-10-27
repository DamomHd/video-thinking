import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MusicFile } from '../../src/shared/types.js';

/**
 * 配乐覆盖率守门
 *
 * 2026-10-25 的事故：本地作曲只写了 23 秒的谱，WAV 却按段长补成了 60 秒 ——
 * 文件时长、段区间、锚点全都合法，旧守门一条都没拦住，成片后 37 秒没有音乐，只剩音效。
 * 所以守门不能只看「文件多长」，要看「段里实际有没有声音」：
 *
 *   ✗ 段内静音占比 > 15%
 *   ✗ 段尾空出 > 2 秒（不算段自己的 fadeOut —— 淡出是混音做的，文件里得有声音可淡）
 *   ⚠ 段内有超过 3 秒的连续空档（可能是故意的停顿，给警告不拦）
 *
 * 静音口径：10ms 帧 RMS 低于 −50 dBFS。
 */

export const MUSIC_SILENT_DB = -50;
export const MAX_SILENT_RATIO = 0.15;
export const MAX_TRAILING_SILENCE_SEC = 2;
export const WARN_GAP_SEC = 3;
const FRAME_SEC = 0.01;

export interface CoverageStats {
  silentRatio: number;
  trailingSilenceSec: number;
  longestGapSec: number;
}

/** 纯函数：逐帧 dB → 覆盖率统计 */
export function coverageFromDb(frameDb: number[], frameSec = FRAME_SEC, floorDb = MUSIC_SILENT_DB): CoverageStats {
  if (!frameDb.length) return { silentRatio: 1, trailingSilenceSec: 0, longestGapSec: 0 };
  let silent = 0;
  let run = 0;
  let longest = 0;
  for (const d of frameDb) {
    if (d < floorDb) {
      silent++;
      run++;
      longest = Math.max(longest, run);
    } else run = 0;
  }
  let tail = 0;
  for (let i = frameDb.length - 1; i >= 0 && frameDb[i] < floorDb; i--) tail++;
  return {
    silentRatio: silent / frameDb.length,
    trailingSilenceSec: tail * frameSec,
    longestGapSec: longest * frameSec,
  };
}

function decodeDb(file: string, startSec: number, durSec: number): number[] | null {
  const SR = 8000;
  const HOP = Math.round(SR * FRAME_SEC);
  let buf: Buffer;
  try {
    buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(startSec), '-t', String(durSec), '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], {
      maxBuffer: 1 << 30,
    });
  } catch {
    return null;
  }
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  const out: number[] = [];
  for (let i = 0; i + HOP <= x.length; i += HOP) {
    let s = 0;
    for (let j = 0; j < HOP; j++) s += x[i + j] * x[i + j];
    out.push(10 * Math.log10(s / HOP + 1e-12));
  }
  return out;
}

export interface MusicCoverageReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  cues: { id: string; stats: CoverageStats | null }[];
}

export function checkMusicCoverage(music: MusicFile, publicDir = path.join(process.cwd(), 'public')): MusicCoverageReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cues: MusicCoverageReport['cues'] = [];

  for (const cue of music?.cues ?? []) {
    const file = cue.track?.file;
    if (!file) continue; // 没选曲的段由别的守门管
    const abs = path.join(publicDir, file);
    if (!fs.existsSync(abs)) continue; // 文件缺失同上
    const span = cue.out.sec - cue.in.sec;
    // 段尾 fadeOut 由混音做，文件里这一截允许渐弱，但不该提前没声
    const checkDur = Math.max(0.5, span - (cue.fadeOutSec ?? 0));
    const db = decodeDb(abs, cue.startFromSec ?? 0, checkDur);
    if (!db) {
      warnings.push(`配乐段 [${cue.id}] 解码失败，跳过覆盖率检查（${file}）`);
      cues.push({ id: cue.id, stats: null });
      continue;
    }
    // 文件比段短时，缺的那截按静音算
    const want = Math.round(checkDur / FRAME_SEC);
    while (db.length < want) db.push(-120);
    const st = coverageFromDb(db);
    cues.push({ id: cue.id, stats: st });
    const pct = (st.silentRatio * 100).toFixed(0);
    if (st.silentRatio > MAX_SILENT_RATIO) {
      errors.push(
        `配乐段 [${cue.id}] 段内 ${pct}% 是静音（上限 ${MAX_SILENT_RATIO * 100}%）—— 配乐没铺满，成片会只剩音效。` +
          `本地作曲请确认按段长生成（vw music match --local 会传段长与高潮）`
      );
    }
    if (st.trailingSilenceSec > MAX_TRAILING_SILENCE_SEC) {
      errors.push(
        `配乐段 [${cue.id}] 段尾空出 ${st.trailingSilenceSec.toFixed(1)}s（上限 ${MAX_TRAILING_SILENCE_SEC}s）—— 曲子比段短，后面没音乐`
      );
    }
    if (st.longestGapSec > WARN_GAP_SEC && st.trailingSilenceSec <= MAX_TRAILING_SILENCE_SEC) {
      warnings.push(`配乐段 [${cue.id}] 段内有 ${st.longestGapSec.toFixed(1)}s 的连续空档，确认是故意的停顿`);
    }
  }
  return { valid: errors.length === 0, errors, warnings, cues };
}
