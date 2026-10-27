/**
 * 出片验收 (Delivery Verification)
 * 对标 architecture.html §9.2 的「验收：响度 · 同步 · 抽帧」：
 *   ebur128 测整合响度与真峰值；
 *   互相关测成片 AAC 与混音 WAV 的时差（应为 0 —— 这是三段式存在的理由）；
 *   在关键时刻抽帧看画面。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { decodeMono } from '../audio/decode.js';

export interface LoudnessReport {
  integratedLufs: number | null;
  truePeakDb: number | null;
  lra: number | null;
}

export function measureLoudness(file: string): LoudnessReport {
  // ebur128 的汇总块写在 stderr（ffmpeg 一向如此），所以必须两条流都收
  const r = spawnSync(
    'ffmpeg',
    ['-nostats', '-i', file, '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
    { encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }
  );
  return parseEbur(`${r.stderr ?? ''}\n${r.stdout ?? ''}`);
}

function parseEbur(text: string): LoudnessReport {
  // ffmpeg 处理过程中会逐帧打 "I: -70.0 LUFS LRA: 0.0 LU"，
  // 真正的结果在最后的 Summary 块里 —— 只认 Summary，否则会读到开头的门限值。
  const sumIdx = text.lastIndexOf('Summary:');
  const scope = sumIdx >= 0 ? text.slice(sumIdx) : text;

  const lastNum = (re: RegExp): number | null => {
    const all = [...scope.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'))];
    if (all.length === 0) return null;
    const v = Number(all[all.length - 1][1]);
    return Number.isFinite(v) ? v : null;
  };

  return {
    integratedLufs: lastNum(/^\s*I:\s+(-?[\d.]+)\s+LUFS/m),
    truePeakDb: lastNum(/^\s*Peak:\s+(-?[\d.]+)\s+dBFS/m),
    lra: lastNum(/^\s*LRA:\s+(-?[\d.]+)\s+LU\s*$/m),
  };
}

export interface SyncReport {
  /** 成片音轨相对混音 WAV 的时差（毫秒），正数表示成片偏晚 */
  offsetMs: number | null;
  /** 互相关峰值归一化系数 0~1，太低说明两条轨对不上，时差不可信 */
  correlation: number | null;
  note?: string;
}

/**
 * 互相关测音画时差：把成片的音轨解出来，和混音 WAV 对齐。
 * Remotion 直出 AAC 会整轨晚 2048 个采样（42.7ms）；三段式重编之后这里应该是 0。
 */
export function measureAvSync(finalFile: string, mixWav: string, searchMs = 300): SyncReport {
  if (!fs.existsSync(finalFile) || !fs.existsSync(mixWav)) {
    return { offsetMs: null, correlation: null, note: '缺少成片或混音 WAV' };
  }

  const tmp = path.join(path.dirname(finalFile), '.verify-final-audio.wav');
  try {
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', finalFile, '-vn', '-ac', '1', '-ar', '48000', tmp],
      { stdio: 'pipe' }
    );
  } catch {
    return { offsetMs: null, correlation: null, note: '无法从成片抽出音轨' };
  }

  const a = decodeMono(mixWav);
  const b = decodeMono(tmp);
  fs.existsSync(tmp) && fs.unlinkSync(tmp);
  if (!a || !b) return { offsetMs: null, correlation: null, note: '解码失败' };

  // 只取前 20s 做互相关，够判断整轨偏移
  const n = Math.min(a.mono.length, b.mono.length, 48000 * 20);
  const maxLag = Math.round((searchMs / 1000) * 48000);
  let bestLag = 0;
  let bestScore = -Infinity;

  for (let lag = -maxLag; lag <= maxLag; lag += 8) {
    let dot = 0;
    let ea = 0;
    let eb = 0;
    for (let i = Math.max(0, -lag); i < n - Math.max(0, lag); i += 4) {
      const va = a.mono[i];
      const vb = b.mono[i + lag];
      dot += va * vb;
      ea += va * va;
      eb += vb * vb;
    }
    const den = Math.sqrt(ea * eb);
    const score = den > 1e-12 ? dot / den : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // 在粗峰附近逐采样精修
  for (let lag = bestLag - 8; lag <= bestLag + 8; lag++) {
    let dot = 0;
    let ea = 0;
    let eb = 0;
    for (let i = Math.max(0, -lag); i < n - Math.max(0, lag); i += 4) {
      const va = a.mono[i];
      const vb = b.mono[i + lag];
      dot += va * vb;
      ea += va * va;
      eb += vb * vb;
    }
    const den = Math.sqrt(ea * eb);
    const score = den > 1e-12 ? dot / den : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return {
    offsetMs: Math.round((bestLag / 48000) * 100000) / 100,
    correlation: Math.round(bestScore * 10000) / 10000,
  };
}

/** 在关键时刻抽帧（ffmpeg 直接从成片抽，不重渲） */
export function grabFrames(videoFile: string, secs: number[], outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });
  const out: string[] = [];
  for (const sec of secs) {
    const file = path.join(outDir, `${sec.toFixed(2).replace('.', '_')}s.png`);
    try {
      execFileSync(
        'ffmpeg',
        ['-v', 'error', '-y', '-ss', String(sec), '-i', videoFile, '-frames:v', '1', file],
        { stdio: 'pipe' }
      );
      if (fs.existsSync(file)) out.push(file);
    } catch {
      /* 抽不到就跳过 */
    }
  }
  return out;
}

/**
 * 频段平衡：低频（20–120 Hz）相对中频（120 Hz–2 kHz）的平均电平差（借鉴 lemo-opuscar TECHNIQUE.md §5：合成的配乐容易低频过重，
 * 混音后低频比中频低约 3 dB 为宜；高于 0 dB 听着闷、在大音箱上轰，低于 −9 dB 在小喇叭上发薄）。
 */
export function measureBands(file: string): { lowRelDb: number | null } {
  const mean = (af: string): number | null => {
    const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-i', file, '-vn', '-af', `${af},volumedetect`, '-f', 'null', '-'], { encoding: 'utf-8', maxBuffer: 1 << 26 });
    const m = String(r.stderr).match(/mean_volume:\s*(-?[\d.]+) dB/);
    return m ? Number(m[1]) : null;
  };
  const low = mean('highpass=f=20,lowpass=f=120');
  const mid = mean('highpass=f=120,lowpass=f=2000');
  return { lowRelDb: low === null || mid === null ? null : Math.round((low - mid) * 10) / 10 };
}

export function bandVerdict(lowRelDb: number | null): { ok: boolean; text: string } {
  if (lowRelDb === null) return { ok: true, text: '频段：没量到' };
  if (lowRelDb > 0) return { ok: false, text: `低频比中频高 ${lowRelDb} dB：偏闷（建议约 −3 dB）——压低贝斯 / 底鼓 / 低音铺底，或给低音加二三次谐波让它在小喇叭上也听得见` };
  if (lowRelDb < -9) return { ok: false, text: `低频比中频低 ${-lowRelDb} dB：偏薄（建议约 −3 dB）——加低音声部或重拍的低频层` };
  return { ok: true, text: `低频相对中频 ${lowRelDb} dB（建议约 −3）` };
}
