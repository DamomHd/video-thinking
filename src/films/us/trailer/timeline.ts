/**
 * Us 预告片时间轴 (对标 architecture.html §6.5)
 * 不走幕表，走配乐的拍网格：DROP / BEAT / beat(n) / STOP = beat(32)。
 * 换配乐时只改 TRAILER_BPM 和 DROP_SEC，下面所有镜头按拍号自动挪位。
 */

import { makeBeatGrid, resolveShots, ShotSpec } from '../../../shared/beatgrid';

/** 预告片用的配乐（正片原曲整首，不改编） */
export const TRAILER_MUSIC = 'music/us-theme-main.wav';
export const TRAILER_BPM = 108;
/** 主高潮在配乐里的落点（秒） */
export const DROP_SEC = 10.0;

export const GRID = makeBeatGrid({ dropSec: DROP_SEC, bpm: TRAILER_BPM });
export const { beat, bar } = GRID;

/** 停表：第 32 拍收尾 */
export const STOP = beat(32);

/**
 * 镜头表。两类：
 *   new   —— 预告片自己的新镜头
 *   reuse —— 复用正片的幕，用 WarpProvider(knotMap) 把关键事件钉到强拍上
 */
export interface TrailerShot extends ShotSpec {
  kind: 'new' | 'reuse';
  /** reuse：复用哪一幕 */
  sceneId?: string;
  /**
   * reuse：时间重映射节点 [[预告片内秒, 正片幕内秒], …]
   * 第一项和最后一项定住首尾，中间项就是「把这个正片事件钉到这一拍」。
   */
  knots?: [number, number][];
  /** reuse：外层 Reframe 的慢推与取景 */
  reframe?: { fromScale: number; toScale: number; panX?: number; panY?: number };
}

export const SHOTS: TrailerShot[] = [
  // 1. 新镜头：星域开场，从黑场里浮出（4 拍）
  {
    id: 'void',
    label: '01 星域开场',
    kind: 'new',
    fromSec: beat(-16),
    toSec: beat(-12),
    enterSec: 0,
  },
  // 2. 复用：序幕双星呼吸压成 2 拍，「呼吸到顶」落在出点
  {
    id: 'prologue',
    label: '02 序幕 · 双星呼吸',
    kind: 'reuse',
    sceneId: 'prologue',
    fromSec: beat(-12),
    toSec: beat(-10),
    enterSec: 0.25,
    knots: [
      [0, 1.0],
      [beat(-10) - beat(-12), 4.6],
    ],
    reframe: { fromScale: 1.18, toScale: 1.05 },
  },
  // 3. 复用：星系轨道，把 K.galaxyOrbit（幕内 1.0s）钉到本镜头第 2 拍
  {
    id: 'galaxy',
    label: '03 星系轨道',
    kind: 'reuse',
    sceneId: 'galaxy',
    fromSec: beat(-10),
    toSec: beat(-6),
    enterSec: 0.3,
    knots: [
      [0, 0.2],
      [beat(-8) - beat(-10), 1.0],
      [beat(-6) - beat(-10), 6.4],
    ],
    reframe: { fromScale: 1.0, toScale: 1.12 },
  },
  // 4. 复用：本地加密，把 K.privacyLock（幕内 1.2s）钉到本镜头第 1 拍
  {
    id: 'privacy',
    label: '04 本地加密',
    kind: 'reuse',
    sceneId: 'privacy',
    fromSec: beat(-6),
    toSec: beat(-4),
    enterSec: 0.25,
    knots: [
      [0, 0.0],
      [beat(-5) - beat(-6), 1.2],
      [beat(-4) - beat(-6), 6.8],
    ],
    reframe: { fromScale: 1.12, toScale: 1.0 },
  },
  // 5. 新镜头：织字 —— 在 Canvas 上把 "US" 一笔笔织出来，收在 DROP 上（4 拍）
  {
    id: 'woven',
    label: '05 织字 US',
    kind: 'new',
    fromSec: beat(-4),
    toSec: beat(0),
    enterSec: 0.25,
  },
  // 6. 复用：终幕落版，K.logoDrop（幕内 1.8s）正对 DROP
  {
    id: 'finale',
    label: '06 落版绽放',
    kind: 'reuse',
    sceneId: 'finale',
    fromSec: beat(0),
    toSec: beat(16),
    enterSec: 0, // DROP 是硬切：落版要砸在拍上，不能淡进来
    knots: [
      [0, 1.8],
      [beat(8) - beat(0), 5.2],
      [beat(16) - beat(0), 9.4],
    ],
    reframe: { fromScale: 1.06, toScale: 1.0 },
  },
  // 7. 新镜头：收尾卡板
  {
    id: 'endcard',
    label: '07 收尾卡板',
    kind: 'new',
    fromSec: beat(16),
    toSec: STOP,
    enterSec: 0.4,
  },
];

export const TRAILER = resolveShots(SHOTS);
/** 预告片从 beat(-32) 开始，所以全片秒数要整体平移 */
export const TRAILER_START = beat(-16);
export const TRAILER_LENGTH = Math.round((STOP - TRAILER_START) * 10000) / 10000;

/** 镜头入点换算成预告片内秒（0 起） */
export const localOf = (absSec: number) =>
  Math.round((absSec - TRAILER_START) * 10000) / 10000;

/** 预告片自己的一套字幕（和正片的 Editorial 无关） */
export interface Super {
  atSec: number;
  durSec: number;
  text: string;
  sub?: string;
}

export const SUPERS: Super[] = [
  { atSec: beat(-15), durSec: 2.0, text: '最真实的亲密', sub: 'THE QUANTUM BOND' },
  { atSec: beat(-9), durSec: 1.6, text: '时间会记得', sub: 'TIME REMEMBERS' },
  { atSec: beat(-5), durSec: 1.4, text: '只留在你们之间', sub: 'ZERO-KNOWLEDGE' },
  { atSec: beat(18), durSec: 4.0, text: 'Us', sub: 'ALWAYS CONNECTED' },
];
