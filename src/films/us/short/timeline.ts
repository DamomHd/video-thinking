/**
 * Us 短片时间轴 (对标 architecture.html §6.5 的短片)
 * 短片按**小节**走：bar(m) = DROP + m · BAR。
 * 画面全部新做，只借基础设施（anim / ssaa / CameraRig / theme）。
 */

import { makeBeatGrid, resolveShots, ShotSpec } from '../../../shared/beatgrid';
import musicSpec from './music.json' with { type: 'json' };

/**
 * 短片的配乐是离线产出的（`vw music short us`：优先从源曲剪，剪不出来就作曲引擎生成）。
 * 不走 Remotion 的 startFrom —— 它按帧量化，接缝会错 16–33ms。
 *
 * bpm 与 drop 都是**实测值**，由 scripts/music/short-music.ts 写进 music.json；
 * 画面的小节网格读它。顺序是「先有配乐、再排画面」，不是先定一个秒数再逼配乐对上。
 */
export const SHORT_MUSIC = musicSpec.file;
export const SHORT_BPM = musicSpec.bpm;
export const SHORT_DROP = musicSpec.dropSec;
export const SHORT_MUSIC_DUR = musicSpec.durSec;

export const GRID = makeBeatGrid({ dropSec: SHORT_DROP, bpm: SHORT_BPM });
export const { beat, bar } = GRID;

export interface ShortSegment extends ShotSpec {
  /** 这一段在织造进度上的区间 [起, 止]，0..1 */
  weave: [number, number];
}

/** 9 段，按小节切 */
export const SEGMENTS: ShortSegment[] = [
  { id: 's1', label: '01 起经',   fromSec: bar(-4), toSec: bar(-3), weave: [0.00, 0.08], enterSec: 0 },
  { id: 's2', label: '02 投纬',   fromSec: bar(-3), toSec: bar(-2), weave: [0.08, 0.22], enterSec: 0.3 },
  { id: 's3', label: '03 成面',   fromSec: bar(-2), toSec: bar(-1), weave: [0.22, 0.40], enterSec: 0.3 },
  { id: 's4', label: '04 收束',   fromSec: bar(-1), toSec: bar(0),  weave: [0.40, 0.55], enterSec: 0.3 },
  { id: 's5', label: '05 高潮',   fromSec: bar(0),  toSec: bar(1),  weave: [0.55, 0.72], enterSec: 0 },
  { id: 's6', label: '06 金线',   fromSec: bar(1),  toSec: bar(2),  weave: [0.72, 0.84], enterSec: 0.25 },
  { id: 's7', label: '07 展开',   fromSec: bar(2),  toSec: bar(3),  weave: [0.84, 0.93], enterSec: 0.25 },
  { id: 's8', label: '08 定影',   fromSec: bar(3),  toSec: bar(4),  weave: [0.93, 0.99], enterSec: 0.25 },
  { id: 's9', label: '09 落版',   fromSec: bar(4),  toSec: bar(6),  weave: [0.99, 1.00], enterSec: 0.3 },
];

export const SHORT = resolveShots(SEGMENTS);
export const SHORT_START = bar(-4);
export const SHORT_STOP = bar(6);
export const SHORT_LENGTH = Math.round((SHORT_STOP - SHORT_START) * 10000) / 10000;

export const localOf = (absSec: number) =>
  Math.round((absSec - SHORT_START) * 10000) / 10000;

/** 片内秒 → 织造进度 0..1（段内线性，段间连续） */
export function weaveAt(localSec: number): number {
  const abs = localSec + SHORT_START;
  for (const s of SEGMENTS) {
    if (abs >= s.fromSec && abs <= s.toSec) {
      const p = (abs - s.fromSec) / Math.max(1e-6, s.toSec - s.fromSec);
      return s.weave[0] + (s.weave[1] - s.weave[0]) * p;
    }
  }
  return abs < SHORT_START ? 0 : 1;
}
