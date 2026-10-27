/**
 * 衍生片守门（预告片 / 短片）
 * 正片走九张真值 + 适配器，有完整守门；衍生片是拍网格 + 手写 cue 表，
 * 没有工作台也没有真值校验，所以这里补三件事：
 *   1. 镜头 / 段表：入点递增、时长为正、id 不重复、不超出配乐长度
 *   2. cue 表：引用的槽必须已采购（manifest 里有，且 WAV 真的在盘上）
 *   3. 拍网格：所有镜头入点必须落在整拍上（偏差 < 半帧），否则就是手填了秒数
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { BeatGrid, ResolvedShot, ShotSpec } from '../../src/shared/beatgrid.js';
import { Cue } from '../../src/components/CueAudio.js';
import { readManifest } from '../spot/plan.js';

export interface VariantGuardReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  shotCount: number;
  cueCount: number;
  musicDurSec?: number;
}

export interface VariantGuardInput {
  filmId: string;
  variant: 'trailer' | 'short';
  grid: BeatGrid;
  shots: ResolvedShot<ShotSpec>[];
  /** 镜头入点相对片头的换算 */
  localOf: (absSec: number) => number;
  totalSec: number;
  cues: Cue[];
  musicFile: string;
  fps?: number;
}

export function checkVariant(input: VariantGuardInput): VariantGuardReport {
  const { grid, shots, localOf, totalSec, cues, musicFile, fps = 60 } = input;
  const errors: string[] = [];
  const warnings: string[] = [];
  const halfFrame = 0.5 / fps;

  // 1. 镜头 / 段表
  const seen = new Set<string>();
  let prevFrom = -Infinity;
  for (const s of shots) {
    if (seen.has(s.id)) errors.push(`镜头 id 重复: '${s.id}'`);
    seen.add(s.id);
    if (s.durSec <= 0) errors.push(`镜头 '${s.id}' 时长非正: ${s.durSec}`);
    if (s.fromSec < prevFrom) errors.push(`镜头 '${s.id}' 入点倒退`);
    prevFrom = s.fromSec;

    const local = localOf(s.toSec);
    if (local > totalSec + 1e-6) {
      errors.push(`镜头 '${s.id}' 出点 ${local.toFixed(3)}s 超出全片 ${totalSec}s`);
    }

    // 3. 入点必须落在整拍上
    const beatNo = grid.beatOf(s.fromSec);
    const snapped = grid.beat(Math.round(beatNo));
    if (Math.abs(snapped - s.fromSec) > halfFrame) {
      errors.push(
        `镜头 '${s.id}' 入点 ${s.fromSec.toFixed(4)}s 不在整拍上` +
          `（最近的第 ${Math.round(beatNo)} 拍是 ${snapped.toFixed(4)}s）—— 入点要写成 beat(n) / bar(m)，不要手填秒数`
      );
    }
  }

  // 2. cue 表引用的槽必须已采购
  const manifest = readManifest(input.filmId);
  const pub = path.join(process.cwd(), 'public');
  for (const c of cues) {
    const entry = manifest[c.slot]?.[0];
    const rel = entry?.file ?? `sfx-lib/epidemic/${c.slot}.wav`;
    if (!fs.existsSync(path.join(pub, rel))) {
      errors.push(`cue 引用的槽 '${c.slot}' 没有素材（${rel} 不存在）`);
      continue;
    }
    if (c.align === 'peak' && entry?.peakAtSec === undefined) {
      warnings.push(
        `cue '${c.slot}' 用了 align:'peak'，但 manifest 里没有实测峰位 —— 会按 0 处理。先跑 vw sfx pick`
      );
    }
    if (c.at < -1e-6 || c.at > totalSec + 1e-6) {
      errors.push(`cue '${c.slot}' 落点 ${c.at}s 越出全片 [0, ${totalSec}]`);
    }
  }

  // 配乐长度
  let musicDurSec: number | undefined;
  const musicAbs = path.join(pub, musicFile.replace(/^public\//, ''));
  if (!fs.existsSync(musicAbs)) {
    errors.push(`配乐不存在: ${musicFile}`);
  } else {
    musicDurSec = probeDur(musicAbs);
    if (musicDurSec !== undefined && musicDurSec + 0.05 < totalSec) {
      errors.push(
        `配乐只有 ${musicDurSec.toFixed(2)}s，铺不满全片 ${totalSec}s（片尾会静音）`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    shotCount: shots.length,
    cueCount: cues.length,
    musicDurSec,
  };
}

function probeDur(file: string): number | undefined {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file],
      { encoding: 'utf-8' }
    ).trim();
    const v = Number(out);
    return Number.isFinite(v) ? v : undefined;
  } catch {
    return undefined;
  }
}
