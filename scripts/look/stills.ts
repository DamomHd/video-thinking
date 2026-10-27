/**
 * 看画面的工具（设计评审用）
 *
 *   vw still <片> --at 1.2,3.4   按秒抽静帧：只打包一次，连续出多帧（npx remotion still 每帧都要重新打包，很慢）
 *   vw still <片> --strip=2.0:2.5 一段时间里的每一帧拼成连拍（看动作：预备、跟随、跳帧、抖动、转场）
 *   --crop=x,y,w,h              每帧只取这块区域、原分辨率（看脸、手、接触点、光晕）；和 --at / --strip 都能配
 *   （连拍和局部放大借鉴 ClaudeAnimationBase 的 render.mjs --strip / --crop）
 *   vw sheet <片|mp4> [--n=12]   成片缩略图：均匀抽 n 帧拼成一张，评审时一眼看全片
 *   vw ref <视频> --out=<目录>    参考片抽帧 + 缩略图 + 观察笔记模板（学「为什么好」，不是对齐目标）
 *
 * 秒数是放映时间（成片里的时间）；合成按自己的 fps 换算成帧号。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** 秒 → 帧号：四舍五入，夹在 [0, durationInFrames - 1] */
export function secToFrame(sec: number, fps: number, durationInFrames: number): number {
  return Math.max(0, Math.min(durationInFrames - 1, Math.round(sec * fps)));
}

/** 均匀抽 n 个时刻：每格取中点（不取首尾黑帧） */
export function evenTimes(durationSec: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) * durationSec * 1000) / n) / 1000);
}

/** 连拍：[a, b] 秒之间的每一帧（含两端），夹在合成范围内 */
export function stripFrames(a: number, b: number, fps: number, durationInFrames: number): number[] {
  const f0 = secToFrame(Math.min(a, b), fps, durationInFrames);
  const f1 = secToFrame(Math.max(a, b), fps, durationInFrames);
  return Array.from({ length: f1 - f0 + 1 }, (_, i) => f0 + i);
}

/** --crop=x,y,w,h → ffmpeg crop 滤镜参数（整数、宽高至少 2） */
export function cropFilter(crop: [number, number, number, number]): string {
  const [x, y, w, h] = crop.map((v) => Math.round(v));
  return `crop=${Math.max(2, w)}:${Math.max(2, h)}:${Math.max(0, x)}:${Math.max(0, y)}`;
}

/** 多张图按 cols 列拼成一张（每格缩到 width 宽；crop 先裁再缩） */
export function tileImages(files: string[], out: string, options: { cols?: number; width?: number; crop?: [number, number, number, number] } = {}): string {
  const cols = options.cols ?? 6;
  const width = options.width ?? 320;
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.tile-'));
  try {
    files.forEach((f, i) => {
      const vf = [options.crop ? cropFilter(options.crop) : null, `scale=${width}:-2`].filter(Boolean).join(',');
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', f, '-vf', vf, path.join(tmp, `f${String(i).padStart(4, '0')}.png`)]);
    });
    const rows = Math.ceil(files.length / cols);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', path.join(tmp, 'f%04d.png'), '-vf', `tile=${cols}x${rows}:padding=4:color=white`, '-frames:v', '1', out]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return out;
}

export async function renderStills(options: {
  composition: string;
  secs: number[];
  outDir: string;
  entry?: string;
  gl?: string;
  /** 连拍区间（秒）：给了就忽略 secs，渲这段的每一帧 */
  strip?: [number, number];
}): Promise<string[]> {
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderStill } = await import('@remotion/renderer');
  const entry = path.resolve(options.entry ?? 'src/Root.tsx');
  const serveUrl = await bundle({ entryPoint: entry });
  const chromiumOptions = { gl: (options.gl ?? 'angle') as 'angle' };
  const comp = await selectComposition({ serveUrl, id: options.composition, inputProps: {}, chromiumOptions });
  fs.mkdirSync(options.outDir, { recursive: true });
  const files: string[] = [];
  const frames = options.strip
    ? stripFrames(options.strip[0], options.strip[1], comp.fps, comp.durationInFrames)
    : options.secs.map((sec) => secToFrame(sec, comp.fps, comp.durationInFrames));
  for (const frame of frames) {
    const sec = frame / comp.fps;
    const output = path.join(options.outDir, `${options.composition}-${sec.toFixed(options.strip ? 3 : 2)}s.png`);
    await renderStill({ composition: comp, serveUrl, output, frame, chromiumOptions, logLevel: 'error' });
    files.push(output);
  }
  return files;
}

function probeDuration(file: string): number {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf-8' }).trim()) || 0;
}

/** 从视频均匀抽 n 帧，拼成 cols 列的缩略图；返回图路径和每格的时刻 */
export function contactSheet(video: string, out: string, options: { n?: number; cols?: number; width?: number } = {}): { file: string; times: number[] } {
  const n = options.n ?? 12;
  const cols = options.cols ?? 4;
  const width = options.width ?? 640;
  const dur = probeDuration(video);
  if (!dur) throw new Error(`读不到时长：${video}`);
  const times = evenTimes(dur, n);
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.sheet-'));
  try {
    times.forEach((t, i) => {
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', `scale=${width}:-2`, path.join(tmp, `f${String(i).padStart(3, '0')}.png`)]);
    });
    const rows = Math.ceil(n / cols);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', path.join(tmp, 'f%03d.png'), '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', out]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { file: out, times };
}

/** 参考片：抽 n 帧（jpg）+ 缩略图 + 观察笔记模板（已有笔记不覆盖） */
export function extractRef(video: string, outDir: string, options: { n?: number } = {}): { frames: string[]; sheet: string; notes: string } {
  const n = options.n ?? 8;
  fs.mkdirSync(outDir, { recursive: true });
  const dur = probeDuration(video);
  if (!dur) throw new Error(`读不到时长：${video}`);
  const frames = evenTimes(dur, n).map((t) => {
    const f = path.join(outDir, `ref-${Math.round(t)}s.jpg`);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '3', f]);
    return f;
  });
  const { file: sheet } = contactSheet(video, path.join(outDir, 'sheet.png'), { n: Math.max(n, 8), cols: 4 });
  const notes = path.join(outDir, 'notes.md');
  if (!fs.existsSync(notes)) {
    fs.writeFileSync(
      notes,
      `# ${path.basename(video)}\n\n> ${dur.toFixed(0)} 秒。学「为什么好」，不是对齐目标。观察和推测分开写；每条原则配一个具体时间点或画面。原则见 docs/method/taste.md。\n\n## 观察\n- \n\n## 推测：它为什么好\n- \n\n## 能迁移的\n- \n\n## 不该照搬的\n- \n`,
      'utf-8'
    );
  }
  return { frames, sheet, notes };
}
