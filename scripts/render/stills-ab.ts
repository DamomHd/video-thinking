/**
 * 开关 A/B 静帧对比 (stills-ab)
 * 对标 architecture.html §10：
 *   "bundle + renderStill，把某个开关的开、关两版各渲一张静帧来比较；
 *    冷开场 GL 粒子有 ±15 的非确定性，要先测底噪。"
 *
 * 用法：想知道某个 --props 开关到底改了画面的哪里，就用它。
 * 关键是**先测底噪**：同一组参数连渲两张，量出这一帧本身的非确定性，
 * 再拿它当门限判断 A/B 的差异是真的还是抖动。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface StillsAbOptions {
  compositionId: string;
  frame: number;
  /** A 版的 input props */
  propsA: Record<string, unknown>;
  /** B 版的 input props */
  propsB: Record<string, unknown>;
  outDir?: string;
  entry?: string;
  /** 底噪采样次数（同一组参数重复渲几张），默认 2 */
  noiseSamples?: number;
  gl?: string;
}

export interface StillsAbResult {
  ok: boolean;
  frame: number;
  /** 同参数重复渲染之间的差（底噪） */
  noiseFloor: number;
  /** A 与 B 之间的差 */
  abDiff: number;
  /** 差异是否超过底噪（超过才说明开关真的改了画面） */
  significant: boolean;
  files: { a: string; b: string; noise?: string };
  reason?: string;
}

export function stillsAb(options: StillsAbOptions): StillsAbResult {
  const {
    compositionId,
    frame,
    propsA,
    propsB,
    entry = 'src/Root.tsx',
    noiseSamples = 2,
    gl = 'angle',
  } = options;
  const outDir = options.outDir ?? path.join(process.cwd(), 'out', 'stills-ab');
  fs.mkdirSync(outDir, { recursive: true });

  const render = (props: Record<string, unknown>, tag: string): string | null => {
    const propsFile = path.join(outDir, `props-${tag}.json`);
    fs.writeFileSync(propsFile, JSON.stringify(props), 'utf-8');
    const out = path.join(outDir, `${compositionId}-${frame}-${tag}.png`);
    try {
      execFileSync(
        'npx',
        ['remotion', 'still', entry, compositionId, out,
          `--frame=${frame}`, `--gl=${gl}`, `--props=${propsFile}`, '--log=error'],
        { stdio: 'pipe', timeout: 300000 }
      );
      return fs.existsSync(out) ? out : null;
    } catch {
      return null;
    }
  };

  const a = render(propsA, 'a');
  if (!a) return fail('A 版渲染失败');

  // 先测底噪：同一组参数再渲一张，量这一帧本身的非确定性
  let noiseFloor = 0;
  let noiseFile: string | undefined;
  for (let i = 0; i < Math.max(1, noiseSamples - 1); i++) {
    const n = render(propsA, `a-noise${i}`);
    if (!n) continue;
    noiseFile = n;
    noiseFloor = Math.max(noiseFloor, imageDiff(a, n) ?? 0);
  }

  const b = render(propsB, 'b');
  if (!b) return fail('B 版渲染失败');

  const abDiff = imageDiff(a, b);
  if (abDiff === null) return fail('无法比较两张图');

  return {
    ok: true,
    frame,
    noiseFloor: r2(noiseFloor),
    abDiff: r2(abDiff),
    // 超过底噪 1.5 倍、且绝对值不低于 0.05（全分辨率平均差的量纲比缩图小得多）
    significant: abDiff > Math.max(noiseFloor * 1.5, 0.05),
    files: { a, b, noise: noiseFile },
  };

  function fail(reason: string): StillsAbResult {
    return {
      ok: false,
      frame,
      noiseFloor: 0,
      abDiff: 0,
      significant: false,
      files: { a: a ?? '', b: '' },
      reason,
    };
  }
}

/**
 * 两张图的平均绝对差（0..255）。
 *
 * 注意比较分辨率：缩图再比会把**亚像素差异**洗掉，而 SSAA 改的恰恰就是边缘的亚像素质量 ——
 * 用 96px 比会得出「SSAA 没有可见影响」这种错误结论。所以默认按原分辨率比，
 * 只有在明确只关心大块构图变化时才缩。
 */
export function imageDiff(fileA: string, fileB: string, grid?: number): number | null {
  const gray = (f: string): Buffer | null => {
    const vf = grid
      ? `scale=${grid}:${Math.round((grid * 9) / 16)},format=gray`
      : 'format=gray';
    try {
      return execFileSync(
        'ffmpeg',
        ['-v', 'error', '-i', f, '-vf', vf, '-f', 'rawvideo', '-'],
        { maxBuffer: 256 * 1024 * 1024 }
      );
    } catch {
      return null;
    }
  };
  const a = gray(fileA);
  const b = gray(fileB);
  if (!a || !b || a.length !== b.length || a.length === 0) return null;
  let acc = 0;
  for (let i = 0; i < a.length; i++) acc += Math.abs(a[i] - b[i]);
  return acc / a.length;
}

const r2 = (v: number) => Math.round(v * 100) / 100;
