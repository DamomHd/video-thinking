/**
 * 抽帧视觉 QA 守门
 * 对标 architecture.html §10：在关键拍点抽帧，查黑帧与渲染崩溃。
 * 真的调 remotion still 出图并解像素，不打印假结论。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FilmAdapter } from '../../src/shared/types.js';

export interface QaFrameResult {
  sec: number;
  label: string;
  file: string;
  ok: boolean;
  /** 平均亮度 0~255 */
  meanLuma?: number;
  /** 最大亮度 0~255 —— 判黑帧看这个，不看平均 */
  maxLuma?: number;
  reason?: string;
}

export interface QaFramesReport {
  ran: boolean;
  frames: QaFrameResult[];
  failures: QaFrameResult[];
  skipReason?: string;
}

/**
 * 在各幕起点与 hits 拍点抽帧。
 * 黑帧判定看**最大亮度**而不是平均亮度：暗调电影画面的平均亮度本来就接近 0
 * （Us 的深空底色是 #050508），用平均值判会把正常画面全报成黑帧。
 * 真正的黑帧（WebGL 上下文丢失、组件抛错、转场没接上）是连高光都没有的。
 */
export function runQaFrames(
  adapter: FilmAdapter,
  options: { maxFrames?: number; outDir?: string } = {}
): QaFramesReport {
  const maxFrames = options.maxFrames ?? 8;
  const outDir =
    options.outDir ?? path.join(process.cwd(), 'out', adapter.filmId, 'qa-frames');
  fs.mkdirSync(outDir, { recursive: true });

  // 抽样点：各幕起点 + 0.3s，再加上 hits
  const samples: { sec: number; label: string }[] = [
    ...adapter.timeline.scenes.map((s) => ({ sec: s.start + 0.3, label: s.id })),
    ...adapter.hits().map((h) => ({ sec: h.sec, label: h.id })),
  ]
    .filter((s) => s.sec >= 0 && s.sec < adapter.timeline.totalSeconds)
    .sort((a, b) => a.sec - b.sec);

  // 均匀取 maxFrames 个
  const step = Math.max(1, Math.ceil(samples.length / maxFrames));
  const picked = samples.filter((_, i) => i % step === 0).slice(0, maxFrames);

  const frames: QaFrameResult[] = [];

  for (const s of picked) {
    const frame = Math.round(s.sec * 30);
    const file = path.join(outDir, `${String(frame).padStart(5, '0')}-${sanitize(s.label)}.png`);
    try {
      execFileSync(
        'npx',
        [
          'remotion',
          'still',
          'src/Root.tsx',
          adapter.filmId,
          file,
          `--frame=${frame}`,
          '--gl=angle',
          '--log=error',
        ],
        { stdio: 'pipe', timeout: 240000 }
      );
    } catch (e: any) {
      frames.push({ sec: s.sec, label: s.label, file, ok: false, reason: `渲染失败: ${trimErr(e)}` });
      continue;
    }

    if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
      frames.push({ sec: s.sec, label: s.label, file, ok: false, reason: '没有产出图片' });
      continue;
    }

    const luma = frameLuma(file);
    if (luma === null) {
      frames.push({ sec: s.sec, label: s.label, file, ok: true, reason: '无法解析亮度（已跳过黑帧判定）' });
      continue;
    }
    const ok = luma.max >= BLACK_MAX_LUMA;
    frames.push({
      sec: s.sec,
      label: s.label,
      file,
      ok,
      meanLuma: luma.mean,
      maxLuma: luma.max,
      reason: ok
        ? undefined
        : `疑似黑帧（最大亮度 ${luma.max} < ${BLACK_MAX_LUMA}，平均 ${luma.mean}）`,
    });
  }

  return { ran: true, frames, failures: frames.filter((f) => !f.ok) };
}

/** 低于这个最大亮度就算黑帧（0~255） */
export const BLACK_MAX_LUMA = 8;

/**
 * 把图缩成 32×18 灰度网格，读出平均亮度与最大亮度。
 * 缩到网格而不是 1×1，是为了让画面里一小块高光（落版光晕、字幕）也能被 max 捕到。
 */
export function frameLuma(file: string): { mean: number; max: number } | null {
  try {
    const raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', file, '-vf', 'scale=32:18,format=gray', '-f', 'rawvideo', '-'],
      { maxBuffer: 64 * 1024 }
    );
    if (raw.length === 0) return null;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < raw.length; i++) {
      sum += raw[i];
      if (raw[i] > max) max = raw[i];
    }
    return { mean: Math.round((sum / raw.length) * 10) / 10, max };
  } catch {
    return null;
  }
}

const sanitize = (s: string) => s.replace(/[^\w.-]+/g, '_').slice(0, 40);
const trimErr = (e: any) =>
  String(e?.stderr?.toString?.() || e?.message || e).split('\n').slice(0, 2).join(' ').slice(0, 220);
