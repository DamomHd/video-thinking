/**
 * 逐帧灰度比对新旧成片 (对标 architecture.html §10 的调试做法)
 *   "抽帧拼对比图、逐帧灰度比对新旧成片"
 *
 * 用处：改了画面代码之后，拿新成片和上一版比，回答两个问题 ——
 *   1. 到底哪几帧变了（而不是靠肉眼扫一遍 30 秒）
 *   2. 变化是真的，还是渲染本身的非确定性（先测底噪，和 stills-ab 同一个思路）
 *
 * 两条成片长度不同时按较短的比，并明确报出来。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface FrameDiff {
  frame: number;
  sec: number;
  /** 平均绝对差 0..255 */
  mean: number;
  /** 单格最大差 0..255 */
  max: number;
}

export interface CompareReport {
  ok: boolean;
  fps: number;
  comparedFrames: number;
  /** 两条片的帧数（不同时按较短的比） */
  framesA: number;
  framesB: number;
  /** 有差异的帧（按平均差降序） */
  changed: FrameDiff[];
  /** 全片平均差 */
  overallMean: number;
  /** 差异最大的一帧 */
  worst?: FrameDiff;
  /** 拼好的对比图（差异最大那一帧的 A|B 并排） */
  contactSheet?: string;
  reason?: string;
}

/** 认为「变了」的门限：平均差超过它才记一笔 */
const CHANGED_MEAN = 0.5;
/** 分析网格 */
const GW = 64;
const GH = 36;

export function compareRenders(
  fileA: string,
  fileB: string,
  options: { fps?: number; outDir?: string; maxChanged?: number } = {}
): CompareReport {
  const fps = options.fps ?? 30;
  const empty = (reason: string): CompareReport => ({
    ok: false, fps, comparedFrames: 0, framesA: 0, framesB: 0,
    changed: [], overallMean: 0, reason,
  });

  if (!fs.existsSync(fileA)) return empty(`旧片不存在: ${fileA}`);
  if (!fs.existsSync(fileB)) return empty(`新片不存在: ${fileB}`);

  const grab = (f: string): Buffer | null => {
    try {
      return execFileSync(
        'ffmpeg',
        ['-v', 'error', '-i', f, '-vf', `fps=${fps},scale=${GW}:${GH},format=gray`,
          '-f', 'rawvideo', '-'],
        { maxBuffer: 512 * 1024 * 1024 }
      );
    } catch {
      return null;
    }
  };

  const a = grab(fileA);
  const b = grab(fileB);
  if (!a || !b) return empty('ffmpeg 解帧失败');

  const cell = GW * GH;
  const framesA = Math.floor(a.length / cell);
  const framesB = Math.floor(b.length / cell);
  const n = Math.min(framesA, framesB);
  if (n === 0) return empty('没有可比的帧');

  const changed: FrameDiff[] = [];
  let sumMean = 0;

  for (let f = 0; f < n; f++) {
    const off = f * cell;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < cell; i++) {
      const d = Math.abs(a[off + i] - b[off + i]);
      sum += d;
      if (d > max) max = d;
    }
    const mean = sum / cell;
    sumMean += mean;
    if (mean >= CHANGED_MEAN) {
      changed.push({
        frame: f,
        sec: Math.round((f / fps) * 1000) / 1000,
        mean: Math.round(mean * 100) / 100,
        max,
      });
    }
  }

  changed.sort((x, y) => y.mean - x.mean);
  const worst = changed[0];
  const limit = options.maxChanged ?? 40;

  // 差异最大那一帧拼一张 A|B 对比图
  let contactSheet: string | undefined;
  if (worst) {
    const outDir = options.outDir ?? path.join(process.cwd(), 'out', 'compare');
    fs.mkdirSync(outDir, { recursive: true });
    contactSheet = path.join(outDir, `worst-${worst.frame}.png`);
    try {
      execFileSync(
        'ffmpeg',
        ['-v', 'error', '-y',
          '-ss', String(worst.sec), '-i', fileA,
          '-ss', String(worst.sec), '-i', fileB,
          '-filter_complex',
          '[0:v]scale=960:-1,drawtext=text=OLD:x=20:y=20:fontsize=28:fontcolor=white@0.8[a];' +
          '[1:v]scale=960:-1,drawtext=text=NEW:x=20:y=20:fontsize=28:fontcolor=white@0.8[b];' +
          '[a][b]hstack=inputs=2',
          '-frames:v', '1', contactSheet],
        { stdio: 'pipe' }
      );
    } catch {
      // drawtext 需要 libfreetype，没有就退回不带标注的并排
      try {
        execFileSync(
          'ffmpeg',
          ['-v', 'error', '-y',
            '-ss', String(worst.sec), '-i', fileA,
            '-ss', String(worst.sec), '-i', fileB,
            '-filter_complex', '[0:v]scale=960:-1[a];[1:v]scale=960:-1[b];[a][b]hstack=inputs=2',
            '-frames:v', '1', contactSheet],
          { stdio: 'pipe' }
        );
      } catch {
        contactSheet = undefined;
      }
    }
  }

  return {
    ok: true,
    fps,
    comparedFrames: n,
    framesA,
    framesB,
    changed: changed.slice(0, limit),
    overallMean: Math.round((sumMean / n) * 1000) / 1000,
    worst,
    contactSheet,
    reason:
      framesA !== framesB
        ? `两条片帧数不同（旧 ${framesA} / 新 ${framesB}），只比了前 ${n} 帧`
        : undefined,
  };
}
