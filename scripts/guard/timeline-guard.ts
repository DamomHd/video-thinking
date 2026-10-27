import fs from 'node:fs';
import path from 'node:path';
import {
  FilmAdapter,
  FilmTimelinePlan,
  MusicFile,
  SyncFile,
} from '../../src/shared/types.js';
import { resolveRef } from '../spot/sync-choreo.js';

export interface TimelineReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Adapt 接口的段长上限（§16.3 实测边界） */
export const MAX_CUE_SEC = 300;

/**
 * 校验幕表结构与配乐段（对标 architecture.html §19 的 check.mts）：
 *   1. 幕时长为正、交叠小于幕长、起点单调递增
 *   2. 配乐段区间合法、不越界、段之间不重叠（交叉淡化除外）
 *   3. **ref 现解析值等于存的值** —— 编舞改了而 ref 没重解析时，段边界会悄悄对不上
 *   4. **段长 ≤ 300s** —— Adapt 接口的硬上限，超了改编会直接失败
 *   5. **sync 锚点不越过所属段的曲长** —— 锚到曲子根本没有的位置上
 *   6. 曲目文件必须真的在盘上
 */
export function checkTimeline(
  timeline: FilmTimelinePlan,
  music: MusicFile,
  options: { adapter?: FilmAdapter; sync?: SyncFile } = {}
): TimelineReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── 1. 幕表
  let lastStart = -1;
  timeline.scenes.forEach((scene, i) => {
    if (scene.dur <= 0) {
      errors.push(`幕 [${scene.id}] 时长非正数: ${scene.dur}s`);
    }
    if (i > 0 && scene.overlap >= scene.dur) {
      errors.push(`幕 [${scene.id}] 重叠时长 (${scene.overlap}s) 超出幕本身时长 (${scene.dur}s)`);
    }
    if (scene.start < lastStart) {
      errors.push(`幕 [${scene.id}] 时间倒流: 当前起点 ${scene.start}s < 上一幕起点 ${lastStart}s`);
    }
    lastStart = scene.start;
  });

  const cues = music?.cues ?? [];

  // ── 2. 配乐段区间
  cues.forEach((cue) => {
    if (cue.in.sec < 0) {
      errors.push(`配乐段 [${cue.id}] 入点为负: ${cue.in.sec}s`);
    }
    if (cue.out.sec > timeline.totalSeconds + 0.1) {
      errors.push(`配乐段 [${cue.id}] 出点超出全片时长: ${cue.out.sec}s > ${timeline.totalSeconds}s`);
    }
    if (cue.in.sec >= cue.out.sec) {
      errors.push(`配乐段 [${cue.id}] 入点必须小于出点: ${cue.in.sec}s >= ${cue.out.sec}s`);
    }

    // ── 4. 段长 ≤ 300s
    const durSec = cue.out.sec - cue.in.sec;
    if (durSec > MAX_CUE_SEC) {
      errors.push(
        `配乐段 [${cue.id}] 长 ${durSec.toFixed(1)}s 超过 Adapt 接口上限 ${MAX_CUE_SEC}s —— 改编会直接失败，先拆段`
      );
    }

    // ── 6. 曲目文件存在
    if (cue.track?.file) {
      const abs = path.join(process.cwd(), 'public', cue.track.file.replace(/^public\//, ''));
      if (!fs.existsSync(abs)) {
        errors.push(`配乐段 [${cue.id}] 的曲目文件不存在: ${cue.track.file}`);
      }
    }
  });

  // ── 2b. 段之间不重叠（只有交叉淡化允许）
  const sorted = [...cues].sort((a, b) => a.in.sec - b.in.sec);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const overlap = a.out.sec - b.in.sec;
    if (overlap > 1e-4) {
      const allowed = b.join?.kind === 'crossfade' || a.join?.kind === 'crossfade';
      if (!allowed) {
        errors.push(
          `配乐段 [${a.id}] 与 [${b.id}] 重叠 ${overlap.toFixed(3)}s，但衔接不是 crossfade —— 会叠音`
        );
      } else if (b.join?.overlapSec !== undefined && Math.abs(overlap - b.join.overlapSec) > 0.05) {
        warnings.push(
          `配乐段 [${b.id}] 实际重叠 ${overlap.toFixed(3)}s 与声明的 ${b.join.overlapSec}s 不一致`
        );
      }
    }
  }

  // ── 3. ref 现解析值 == 存的值
  if (options.adapter) {
    const adapter = options.adapter;
    for (const cue of cues) {
      for (const [name, ref] of [
        ['in', cue.in],
        ['out', cue.out],
        ['climax', cue.climax],
        ['climax2', cue.climax2],
      ] as const) {
        if (!ref) continue;
        const resolved = resolveRef(adapter, ref.ref);
        if (resolved === null) {
          warnings.push(
            `配乐段 [${cue.id}] 的 ${name}.ref='${ref.ref}' 解析不出来（K / SC 里没有这个键）`
          );
          continue;
        }
        if (Math.abs(resolved - ref.sec) > 0.01) {
          errors.push(
            `配乐段 [${cue.id}] 的 ${name}.ref='${ref.ref}' 现解析为 ${resolved.toFixed(3)}s，` +
              `但存的是 ${ref.sec}s —— 编舞改过而 ref 没重解析，跑 vw spot sync-choreo`
          );
        }
      }
    }
  }

  // ── 5. sync 锚点不越过所属段的曲长
  if (options.sync?.anchors) {
    for (const a of options.sync.anchors) {
      if (a.status === 'dropped') continue;
      const cue = cues.find((c) => c.id === a.cueId) ?? cues.find((c) => a.targetSec >= c.in.sec && a.targetSec <= c.out.sec);
      if (!cue?.track) continue;
      const localMusicSec = a.musicSec - cue.in.sec;
      if (localMusicSec < -0.01 || localMusicSec > cue.track.durationSec + 0.01) {
        errors.push(
          `sync 锚点 [${a.hit}] 指向段 [${cue.id}] 的 ${localMusicSec.toFixed(3)}s，` +
            `越过了曲长 ${cue.track.durationSec}s`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
