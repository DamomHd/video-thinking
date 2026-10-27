/**
 * 闪帧扫描 (scan-flicker)
 * 对标 architecture.html §10：把成片降到 8×5 灰度，逐帧比最大差；差值 > 60 判为硬切。
 * 幕表里本来就有的转场会被识别出来，所以报告里会标出「落在转场上」还是「意外硬切」。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { buildTimeWarp } from '../../src/shared/timewarp.js';
import { FilmTimelinePlan } from '../../src/shared/types.js';

export interface FlickerHit {
  sec: number;
  maxDelta: number;
  expected: boolean;
  nearScene?: string;
}

export interface FlickerReport {
  ran: boolean;
  fps: number;
  frames: number;
  hits: FlickerHit[];
  unexpected: FlickerHit[];
  reason?: string;
}

const W = 8;
const H = 5;
const THRESHOLD = 60;

export function scanFlicker(
  videoFile: string,
  timeline?: FilmTimelinePlan,
  options: {
    fps?: number;
    /**
     * 乐谱秒 → 放映秒。成片是按放映时间渲的，幕边界要先映射过去再比。
     * 不映射的话，对拍把边界推后 1–2 秒的片子，每个转场都会被报成「意外硬切」
     * （实测 anlan-report 暗场进出两处，边界分别被推后 1.29s / 1.75s）。
     */
    toFilm?: (scoreSec: number) => number;
  } = {}
): FlickerReport {
  if (!fs.existsSync(videoFile)) {
    return { ran: false, fps: 0, frames: 0, hits: [], unexpected: [], reason: `成片不存在: ${videoFile}` };
  }
  const fps = options.fps ?? 30;

  let raw: Buffer;
  try {
    raw = execFileSync(
      'ffmpeg',
      ['-v', 'error', '-i', videoFile, '-vf', `fps=${fps},scale=${W}:${H},format=gray`,
        '-f', 'rawvideo', '-'],
      { maxBuffer: 512 * 1024 * 1024 }
    );
  } catch (e: any) {
    return { ran: false, fps, frames: 0, hits: [], unexpected: [], reason: `ffmpeg 失败: ${e.message}` };
  }

  const frameSize = W * H;
  const count = Math.floor(raw.length / frameSize);
  const hits: FlickerHit[] = [];

  for (let f = 1; f < count; f++) {
    let maxDelta = 0;
    const a = f * frameSize;
    const b = (f - 1) * frameSize;
    for (let i = 0; i < frameSize; i++) {
      const d = Math.abs(raw[a + i] - raw[b + i]);
      if (d > maxDelta) maxDelta = d;
    }
    if (maxDelta > THRESHOLD) {
      const sec = f / fps;
      const near = timeline
        ? timeline.scenes.find(
            (s) => Math.abs((options.toFilm ? options.toFilm(s.start) : s.start) - sec) <= Math.max(0.2, s.overlap + 0.2)
          )
        : undefined;
      hits.push({
        sec: Math.round(sec * 1000) / 1000,
        maxDelta,
        expected: Boolean(near),
        nearScene: near?.id,
      });
    }
  }

  return {
    ran: true,
    fps,
    frames: count,
    hits,
    unexpected: hits.filter((h) => !h.expected),
  };
}

/** 读影片的 sync.json，给出「乐谱秒 → 放映秒」；没有映射时恒等 */
export function scoreToFilmFor(filmId: string): (scoreSec: number) => number {
  const p = path.join(process.cwd(), 'src', 'films', filmId, 'audio', 'sync.json');
  if (!fs.existsSync(p)) return (s) => s;
  try {
    const warp = buildTimeWarp(JSON.parse(fs.readFileSync(p, 'utf-8')));
    return warp.IS_IDENTITY ? (s) => s : (s) => warp.toFilm(s);
  } catch {
    return (s) => s;
  }
}
