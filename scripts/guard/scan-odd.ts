/**
 * 孤帧扫描 (scan-odd)
 * 对标 architecture.html §10：
 *   "只看对话列区域，抓「孤帧」。结论是偶发的渲染问题，报孤帧就重渲，不改代码。"
 *
 * 什么是孤帧：某一帧和它**前后两帧都不一样**，而前后两帧彼此相似 —— 也就是
 * 时间上孤立的一帧。逐字出字、并发渲染抢排版、WebGL 偶发丢上下文都会留下这种痕迹。
 * 和 scan-flicker 的区别：flicker 找的是硬切（相邻两帧差很大），
 * odd 找的是「只有这一帧不一样」，所以必须看三帧窗口。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export interface OddFrame {
  frame: number;
  sec: number;
  /** 与前一帧的差 */
  diffPrev: number;
  /** 与后一帧的差 */
  diffNext: number;
  /** 前后两帧彼此的差（小说明这一帧是孤立的） */
  diffAcross: number;
  /** 孤立度 = min(diffPrev, diffNext) − diffAcross */
  oddness: number;
}

export interface OddReport {
  ran: boolean;
  fps: number;
  frames: number;
  /** 只看这块区域（归一化 [x, y, w, h]）；缺省看整幅 */
  region?: [number, number, number, number];
  odds: OddFrame[];
  reason?: string;
}

/** 孤立度门限：前后都不像、而前后彼此很像，差到这个程度才算孤帧 */
const ODDNESS_THRESHOLD = 10;

export function scanOdd(
  videoFile: string,
  options: {
    fps?: number;
    /** 只看画面的某一块（归一化 [x, y, w, h]）—— 原版只看对话列 */
    region?: [number, number, number, number];
    /** 分析网格宽高 */
    grid?: [number, number];
  } = {}
): OddReport {
  if (!fs.existsSync(videoFile)) {
    return { ran: false, fps: 0, frames: 0, odds: [], reason: `文件不存在: ${videoFile}` };
  }
  const fps = options.fps ?? 30;
  const [gw, gh] = options.grid ?? [24, 24];

  const filters: string[] = [`fps=${fps}`];
  if (options.region) {
    const [x, y, w, h] = options.region;
    // crop 用 iw/ih 的比例表达，避免写死分辨率
    filters.push(`crop=iw*${w}:ih*${h}:iw*${x}:ih*${y}`);
  }
  filters.push(`scale=${gw}:${gh}`, 'format=gray');

  let raw: Buffer;
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', videoFile, '-vf', filters.join(','), '-f', 'rawvideo', '-'],
      { maxBuffer: 512 * 1024 * 1024 }
    );
  } catch (e: any) {
    return { ran: false, fps, frames: 0, odds: [], reason: `ffmpeg 失败: ${e.message}` };
  }

  const cell = gw * gh;
  const frames = Math.floor(raw.length / cell);
  const odds: OddFrame[] = [];

  const meanAbsDiff = (a: number, b: number): number => {
    let acc = 0;
    for (let i = 0; i < cell; i++) acc += Math.abs(raw[a + i] - raw[b + i]);
    return acc / cell;
  };

  for (let f = 1; f < frames - 1; f++) {
    const prev = (f - 1) * cell;
    const cur = f * cell;
    const next = (f + 1) * cell;

    const dPrev = meanAbsDiff(cur, prev);
    const dNext = meanAbsDiff(cur, next);
    const dAcross = meanAbsDiff(prev, next);

    // 孤立：和前后都不像，但前后彼此很像
    const oddness = Math.min(dPrev, dNext) - dAcross;
    if (oddness >= ODDNESS_THRESHOLD) {
      odds.push({
        frame: f,
        sec: Math.round((f / fps) * 1000) / 1000,
        diffPrev: r1(dPrev),
        diffNext: r1(dNext),
        diffAcross: r1(dAcross),
        oddness: r1(oddness),
      });
    }
  }

  return { ran: true, fps, frames, region: options.region, odds };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
