/**
 * 短片摄影机 (Hermite 关键帧)
 * 对标 §6.5 短片的 camera.ts：相机轨迹是关键帧 + 单调三次 Hermite 插值的纯函数，
 * 不读时钟、不用 useFrame —— 相机由 CameraRig 在 useLayoutEffect 里摆位。
 */

import { getInputProps } from 'remotion';
import { knotMap } from '../../../shared/warp';
import { bar } from './timeline';

export interface CamKey {
  /** 片内秒 */
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
}

const localBar = (m: number) => bar(m) - bar(-4);

/** 关键帧：从远处俯视，推进到缠绕核心，再拉开落版 */
export const CAM_KEYS: CamKey[] = [
  { t: 0,            pos: [0, 3.6, 15.5], look: [0, 0, 0],     fov: 32 },
  { t: localBar(-2), pos: [-2.2, 2.2, 13.0], look: [0, 0, 0],   fov: 31 },
  { t: localBar(0),  pos: [0, 0.9, 10.2], look: [0, 0, 0],      fov: 34 },
  { t: localBar(1),  pos: [2.0, -0.6, 11.0], look: [0, 0.2, 0], fov: 33 },
  { t: localBar(3),  pos: [0, 1.6, 13.5], look: [0, 0, 0],      fov: 32 },
  { t: localBar(6),  pos: [0, 0.2, 17.0], look: [0, 0, 0],      fov: 30 },
];

/** 每个分量各插一条单调曲线 */
const axis = (pick: (k: CamKey) => number) =>
  knotMap(CAM_KEYS.map((k) => ({ outer: k.t, inner: pick(k) })));

const MAPS = {
  px: axis((k) => k.pos[0]),
  py: axis((k) => k.pos[1]),
  pz: axis((k) => k.pos[2]),
  lx: axis((k) => k.look[0]),
  ly: axis((k) => k.look[1]),
  lz: axis((k) => k.look[2]),
  fov: axis((k) => k.fov),
};

/**
 * 看样机位（附录 B 的 cam）：--props '{"cam":"wide"}' 临时把相机钉死在一个位置，
 * 不跟轨迹走。用来反复看同一个角度下的画面改动，排除机位变化的干扰。
 * 只影响看样，正式出片不传这个 prop。
 */
export const PREVIEW_CAMS: Record<string, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
  wide:  { pos: [0, 3.6, 18.0], look: [0, 0, 0], fov: 32 },
  close: { pos: [0, 0.4, 7.5],  look: [0, 0, 0], fov: 36 },
  top:   { pos: [0, 14.0, 0.6], look: [0, 0, 0], fov: 30 },
  side:  { pos: [13.5, 0.8, 0], look: [0, 0, 0], fov: 32 },
};

function previewCam(): { pos: [number, number, number]; look: [number, number, number]; fov: number } | null {
  let name = '';
  try {
    name = String((getInputProps() as Record<string, unknown>)?.cam ?? '');
  } catch {
    name = '';
  }
  return name ? (PREVIEW_CAMS[name] ?? null) : null;
}

export function cameraAt(localSec: number): {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
} {
  const fixed = previewCam();
  if (fixed) return fixed;
  return {
    pos: [MAPS.px(localSec), MAPS.py(localSec), MAPS.pz(localSec)],
    look: [MAPS.lx(localSec), MAPS.ly(localSec), MAPS.lz(localSec)],
    fov: MAPS.fov(localSec),
  };
}
