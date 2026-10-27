/**
 * 预告片声音 (对标 architecture.html §17.4 的 TrailerAudio)
 *
 * 关键点：复用镜头里的音效时刻**不手写**。
 * 正片的拍点是幕内秒（比如 K.logoDrop 在 finale 幕内 1.8s），
 * 而预告片把那一幕做了时间重映射，所以要用 outerOf 二分反解 knotMap：
 *   给定「幕内 1.8s」，求出它落在预告片镜头内的第几秒。
 * 镜头常量一改，音效自动跟着挪。
 */

import { outerOf } from '../../../shared/warp';
import { Cue } from '../../../components/CueAudio';
import { UsAdapter } from '../audio/adapter';
import { FILM_PLAN } from '../timeline';
import { SHOTS, TRAILER_MUSIC, TRAILER_START, TRAILER_LENGTH, localOf, beat, GRID } from './timeline';
import { shotMap } from './shots/Reuse';

const adapter = new UsAdapter();

/**
 * 把正片的一个拍点反解到预告片内秒。
 * hitId 是 adapter.K 的键；找到承载它的复用镜头，再二分反解。
 * 该拍点没有被任何复用镜头覆盖时返回 null（调用方据此跳过，不编造时刻）。
 */
export function trailerTimeOfHit(hitKey: string): number | null {
  const absSec = adapter.K[hitKey];
  if (absSec === undefined) return null;

  for (const shot of SHOTS) {
    if (shot.kind !== 'reuse' || !shot.sceneId || !shot.knots) continue;
    const scene = FILM_PLAN.byId[shot.sceneId];
    if (!scene) continue;

    // 拍点在这一幕的幕内秒
    const innerTarget = absSec - scene.start;
    const shotDur = shot.toSec - shot.fromSec;

    // 镜头实际覆盖到的幕内区间
    const map = shotMap(shot);
    const innerLo = map(0);
    const innerHi = map(shotDur);
    if (innerTarget < Math.min(innerLo, innerHi) || innerTarget > Math.max(innerLo, innerHi)) {
      continue;
    }

    const shotLocal = outerOf(map, innerTarget, [0, shotDur]);
    return Math.round((localOf(shot.fromSec) + shotLocal) * 10000) / 10000;
  }
  return null;
}

/** 某个镜头的入点（预告片内秒） */
const shotIn = (id: string) => {
  const s = SHOTS.find((x) => x.id === id);
  return s ? localOf(s.fromSec) : 0;
};

/**
 * cue 表。时刻有三种来源，全都不是手填的秒数：
 *   ① 拍网格 beat(n) —— 预告片自己的节奏点
 *   ② 镜头入点 shotIn(id) —— 跟着镜头表走
 *   ③ trailerTimeOfHit() —— 从正片拍点反解出来
 */
export function buildTrailerCues(): Cue[] {
  const cues: Cue[] = [];

  // 底噪：整条片的深空氛围
  cues.push({
    slot: 'usAtmosphere',
    at: 0,
    vol: 0.32,
    layer: 'BG',
    loop: true,
    durSec: TRAILER_LENGTH,
    fadeIn: 1.2,
    fadeOut: 2.0,
    note: '深空底噪',
  });

  // 开场星尘：落在第一个镜头的入点
  cues.push({
    slot: 'usGalaxyChime',
    at: shotIn('void') + 0.35,
    vol: 0.42,
    layer: 'TEX',
    rate: 0.92,
    note: '星域浮出',
  });

  // ③ 星轨展开：从正片 K.galaxyOrbit 反解
  const galaxyAt = trailerTimeOfHit('galaxyOrbit');
  if (galaxyAt !== null) {
    cues.push({
      slot: 'usGalaxyChime',
      at: galaxyAt,
      vol: 0.62,
      layer: 'TEX',
      note: '星轨展开（由正片 K.galaxyOrbit 反解）',
    });
  }

  // ③ 加密锁定：从正片 K.privacyLock 反解
  const lockAt = trailerTimeOfHit('privacyLock');
  if (lockAt !== null) {
    cues.push({
      slot: 'usLockClick',
      at: lockAt,
      vol: 0.72,
      layer: 'UI',
      note: '加密锁定（由正片 K.privacyLock 反解）',
    });
  }

  // ① 起势：素材峰正好落在 DROP 上
  cues.push({
    slot: 'usRiserSweep',
    at: localOf(beat(0)),
    vol: 0.78,
    layer: 'RISER',
    align: 'peak',
    note: '起势峰对 DROP',
  });

  // ③ 落版绽放：从正片 K.logoDrop 反解（应当正好等于 DROP）
  const dropAt = trailerTimeOfHit('logoDrop');
  cues.push({
    slot: 'usLogoHit',
    at: dropAt ?? localOf(beat(0)),
    vol: 0.9,
    layer: 'IMPACT',
    note: '落版绽放（由正片 K.logoDrop 反解）',
  });

  // ① 收尾卡板的轻点：落在第 16 拍
  cues.push({
    slot: 'usLockClick',
    at: localOf(beat(16)),
    vol: 0.4,
    layer: 'UI',
    rate: 1.18,
    note: '卡板落位',
  });

  return cues.sort((a, b) => a.at - b.at);
}

/** 固定配乐：正片原曲整首，从预告片起点那一秒开始取 */
export const TRAILER_MUSIC_SPEC = {
  file: TRAILER_MUSIC,
  vol: 0.6,
  startFromSec: TRAILER_START,
  fadeInSec: 1.5,
  fadeOutSec: 2.5,
  durSec: TRAILER_LENGTH,
};

/** 调试用：把反解结果和拍号一起打出来 */
export function describeCues(): string[] {
  return buildTrailerCues().map(
    (c) =>
      `${c.at.toFixed(3)}s (拍 ${GRID.beatOf(c.at + TRAILER_START).toFixed(2)})  ` +
      `${(c.layer ?? 'UI').padEnd(6)} ${c.slot.padEnd(14)} vol ${c.vol}` +
      (c.align === 'peak' ? ' [峰对齐]' : '') +
      (c.note ? `  — ${c.note}` : '')
  );
}
