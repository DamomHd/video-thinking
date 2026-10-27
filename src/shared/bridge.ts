/**
 * 2D ↔ 3D 镜头桥
 *
 * 2D 世界（Stage + CSS 镜头）和 3D 世界（three.js 透视相机）原本是两套相机，只能硬切或拉焦切换。
 * 这里把它们接成同一个镜头：
 *
 *   1. 交接：cameraFromStage 由 2D 镜头算出一台从正上方看纸面的透视相机，视野高度 = 2D 镜头框住的高度 ——
 *      交接那一帧两边看到的纸面逐像素一致。
 *   2. 交接之后：3D 相机自由运动（俯仰、推拉、环绕）。DOM 纸面不进 3D：把纸面四个角按 3D 相机投影到屏幕，
 *      用单应变换（matrix3d）把整张纸贴回去 —— 平面在透视投影下就是单应变换，所以是精确的。
 *      3D 物体由 three.js 用同一台相机画，自然对齐。
 *   3. 3D 里的文字：给 DOM 文字指定任意 3D 平面（四个角），同样投影后贴上去（ProjectedHtml），仍是清晰的 DOM 文字。
 *
 * 坐标约定：2D 世界像素 (px, py)，y 朝下；3D 世界 X = px，Y = −py，Z 朝向观众（纸面是 Z = 0）。
 * 局限：纸面上的 DOM 和 3D 物体之间没有遮挡关系（DOM 纸面永远在 3D 物体下面）；相机不能转到纸面背后。
 */

import * as THREE from 'three';
import { CameraState } from './camera';
import { Quad } from './homography';

export type V3 = [number, number, number];

export interface Pose3D {
  pos: V3;
  look: V3;
  /** 竖直视角（度） */
  fov: number;
  /** 相机上方向，缺省 (0,1,0) */
  up?: V3;
}

/** 2D 世界像素 → 3D 世界坐标（纸面 Z = 0） */
export const toWorld3 = (px: number, py: number, z = 0): V3 => [px, -py, z];

/**
 * 由 2D 镜头算出等价的 3D 相机：从正上方看纸面、视野高度等于 2D 框住的高度。
 * 2D 镜头 (x, y) 是取景中心相对画面中心的偏移，z 是缩放的倒数（画面看到的世界高度 = H · z）。
 */
export function cameraFromStage(cam: CameraState, options: { fov?: number; stage?: [number, number] } = {}): Pose3D {
  const [W, H] = options.stage ?? [1920, 1080];
  const fov = options.fov ?? 30;
  const cx = W / 2 + cam.x;
  const cy = H / 2 + cam.y;
  const d = (H * cam.z) / 2 / Math.tan(((fov / 2) * Math.PI) / 180);
  return { pos: [cx, -cy, d], look: [cx, -cy, 0], fov, up: [0, 1, 0] };
}

function threeCam(pose: Pose3D, size: [number, number]): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(pose.fov, size[0] / size[1], 0.1, 1e7);
  c.position.set(...pose.pos);
  c.up.set(...(pose.up ?? [0, 1, 0]));
  c.lookAt(new THREE.Vector3(...pose.look));
  c.updateMatrixWorld();
  c.updateProjectionMatrix();
  return c;
}

/** 3D 世界点 → 屏幕像素（左上原点） */
export function projectPoint(pose: Pose3D, p: V3, size: [number, number] = [1920, 1080]): [number, number] {
  const v = new THREE.Vector3(...p).project(threeCam(pose, size));
  return [((v.x + 1) / 2) * size[0], ((1 - v.y) / 2) * size[1]];
}

/** 一个 3D 四边形（左上、右上、右下、左下）投影到屏幕 */
export function projectQuad(pose: Pose3D, corners: [V3, V3, V3, V3], size: [number, number] = [1920, 1080]): Quad {
  const cam = threeCam(pose, size);
  return corners.map((c) => {
    const v = new THREE.Vector3(...c).project(cam);
    return [((v.x + 1) / 2) * size[0], ((1 - v.y) / 2) * size[1]];
  }) as Quad;
}

/**
 * 纸面（2D 世界层那个 W×H 的 div）在 3D 相机下的 CSS 变换。
 * 用法：世界层 div 设 transformOrigin '0 0'、transform 为返回值（替代 Stage 的 2D 镜头变换）。
 * 世界层里 left / top 超出 W×H 的内容同样被这个射影变换带走（射影变换对整个平面成立）。
 *
 * 直接由相机矩阵构造（纸面 (x, y) → 世界 (x, −y, 0) → 裁剪空间 → 屏幕像素），不借助参考四边形：
 * 相机离纸面原点很远时（长卷世界的后段），原点那块 W×H 可能在相机身后，用它的四个角反推会得到错的矩阵。
 */
export function paperTransform(pose: Pose3D, options: { stage?: [number, number] } = {}): string {
  const [W, H] = options.stage ?? [1920, 1080];
  const cam = threeCam(pose, [W, H]);
  const e = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse).elements; // 列主序
  const col = (j: number) => [e[j * 4], e[j * 4 + 1], e[j * 4 + 2], e[j * 4 + 3]];
  // 裁剪空间 (cx, cy, cw) → 屏幕齐次 (X, Y, w)：X = W/2·(cx + cw)，Y = H/2·(cw − cy)
  const screen = (v: number[]) => [(W / 2) * (v[0] + v[3]), (H / 2) * (v[3] - v[1]), v[3]];
  const cx = screen(col(0));
  const cy = screen(col(1).map((v) => -v)); // 纸面 y 向下 = 世界 −Y
  const c1 = screen(col(3));
  // 归一化：让视线点的 w = 1（视线点一定在相机前方；纸面原点可能在相机身后，w 为负，不能拿它归一化）
  const [lx, ly] = [pose.look[0], -pose.look[1]];
  const k = 1 / (cx[2] * lx + cy[2] * ly + c1[2]);
  const m = [
    cx[0] * k, cx[1] * k, 0, cx[2] * k,
    cy[0] * k, cy[1] * k, 0, cy[2] * k,
    0, 0, 1, 0,
    c1[0] * k, c1[1] * k, 0, c1[2] * k,
  ];
  return `matrix3d(${m.map((v) => +v.toFixed(10)).join(', ')})`;
}

/** 两个 3D 机位之间插值（位置 / 视线点线性，视角线性） */
export function lerpPose(a: Pose3D, b: Pose3D, p: number): Pose3D {
  const l = (x: V3, y: V3): V3 => [x[0] + (y[0] - x[0]) * p, x[1] + (y[1] - x[1]) * p, x[2] + (y[2] - x[2]) * p];
  return { pos: l(a.pos, b.pos), look: l(a.look, b.look), fov: a.fov + (b.fov - a.fov) * p, up: a.up ?? [0, 1, 0] };
}

/**
 * 从交接机位出发的常用运镜：俯仰 tilt（度，正 = 镜头往下压、看得更斜）、推近 dolly（距离比例）、
 * 环绕 orbit（度，绕视线点在水平面内转）。都相对交接机位，便于镜头清单里描述。
 */
export function moveFrom(base: Pose3D, m: { tiltDeg?: number; dolly?: number; orbitDeg?: number; pan?: [number, number] }): Pose3D {
  const look = new THREE.Vector3(...base.look).add(new THREE.Vector3(m.pan?.[0] ?? 0, m.pan?.[1] ?? 0, 0));
  const off = new THREE.Vector3(...base.pos).sub(new THREE.Vector3(...base.look));
  const dist = off.length() * (m.dolly ?? 1);
  // 从正上方（+Z）出发：先往下压 tilt（绕 X 轴，镜头移到纸面「南」侧），再绕 Z 轴环绕
  const tilt = ((m.tiltDeg ?? 0) * Math.PI) / 180;
  const orbit = ((m.orbitDeg ?? 0) * Math.PI) / 180;
  const dir = new THREE.Vector3(0, -Math.sin(tilt), Math.cos(tilt)).applyAxisAngle(new THREE.Vector3(0, 0, 1), orbit);
  const pos = look.clone().add(dir.multiplyScalar(dist));
  // 镜头压得越斜，上方向越接近 +Z
  const up = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)).applyAxisAngle(new THREE.Vector3(0, 0, 1), orbit);
  return { pos: [pos.x, pos.y, pos.z], look: [look.x, look.y, look.z], fov: base.fov, up: [up.x, up.y, up.z] };
}
