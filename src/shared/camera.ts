/**
 * 工业级摄影机控制底座 (LoomCare Camera Pipeline)
 * 严格遵循 LoomCare 架构第 7 节规范：
 * 1. CamKey 对数 Z 轴插值 (lerpLog)，防止大范围推拉出现近端飞快/远端停滞的失真
 * 2. 纯 2D 与 3D 智能降级输出：无倾斜时输出纯 2D 变换，且像素平移取整消除文字 ±1px 抖动
 * 3. 屏幕投影视口计算 camProject，实现 2.5D 世界坐标向 Stage 视口像素的精准映射
 */

import { clamp01, lerp, lerpLog, camOut } from './anim';

export interface CamKey {
  t: number;      // 关键帧时间（秒）
  x: number;      // 相机聚焦中心 X (px)
  y: number;      // 相机聚焦中心 Y (px)
  z: number;      // 相机视距/距离 (scale = 1 / z)
  rx?: number;    // 俯仰角 pitch (deg)
  ry?: number;    // 偏航角 yaw (deg)
  rz?: number;    // 翻滚角 roll (deg)
  ease?: (p: number) => number; // 插值曲线，默认 camOut
}

export interface CameraState {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

export const DEFAULT_CAMERA: CameraState = {
  x: 0,
  y: 0,
  z: 1,
  rx: 0,
  ry: 0,
  rz: 0,
};

/**
 * 逐帧求值相机状态 (纯函数，零时钟依赖)
 */
export function evalCamera(keys: CamKey[], t: number): CameraState {
  if (!keys || keys.length === 0) return { ...DEFAULT_CAMERA };
  if (keys.length === 1 || t <= keys[0].t) {
    const k = keys[0];
    return {
      x: k.x,
      y: k.y,
      z: k.z,
      rx: k.rx ?? 0,
      ry: k.ry ?? 0,
      rz: k.rz ?? 0,
    };
  }
  const lastKey = keys[keys.length - 1];
  if (t >= lastKey.t) {
    return {
      x: lastKey.x,
      y: lastKey.y,
      z: lastKey.z,
      rx: lastKey.rx ?? 0,
      ry: lastKey.ry ?? 0,
      rz: lastKey.rz ?? 0,
    };
  }

  // 寻找所在区间
  let idx = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i].t && t <= keys[i + 1].t) {
      idx = i;
      break;
    }
  }

  const k0 = keys[idx];
  const k1 = keys[idx + 1];
  const dt = k1.t - k0.t;
  const rawP = dt > 0 ? clamp01((t - k0.t) / dt) : 1;
  const easeFn = k0.ease ?? camOut;
  const p = easeFn(rawP);

  // 对数 Z 轴插值，平移与旋转线性插值
  return {
    x: lerp(k0.x, k1.x, p),
    y: lerp(k0.y, k1.y, p),
    z: lerpLog(k0.z, k1.z, p),
    rx: lerp(k0.rx ?? 0, k1.rx ?? 0, p),
    ry: lerp(k0.ry ?? 0, k1.ry ?? 0, p),
    rz: lerp(k0.rz ?? 0, k1.rz ?? 0, p),
  };
}

export interface CamTransformOptions {
  integerPixels?: boolean; // 是否对平移像素取整（防文字抗锯齿抖动）
  perspective?: number;    // 透视深度，默认 1000px
}

/**
 * 将相机状态转化为 CSS transform 字符串
 * 包含 LoomCare 架构规范第 7.2 节的避坑实现：
 * - 无倾斜角度时，输出纯 2D 变换，杜绝 3D 上下文下 GPU 内存暴涨及字体模糊
 * - 纯平移时取整，消除亚像素文字振颤
 */
export function camTransform(cam: CameraState, options: CamTransformOptions = {}): string {
  const integerPixels = options.integerPixels ?? true;
  const scale = 1 / Math.max(0.0001, cam.z);

  const rx = cam.rx ?? 0;
  const ry = cam.ry ?? 0;
  const rz = cam.rz ?? 0;

  const hasRotation =
    Math.abs(rx) > 0.001 ||
    Math.abs(ry) > 0.001 ||
    Math.abs(rz) > 0.001;

  if (!hasRotation) {
    // 纯 2D 输出
    const tx = -cam.x * scale;
    const ty = -cam.y * scale;
    const finalTx = integerPixels ? Math.round(tx) : Number(tx.toFixed(3));
    const finalTy = integerPixels ? Math.round(ty) : Number(ty.toFixed(3));
    const finalScale = Number(scale.toFixed(5));
    return `translate(${finalTx}px, ${finalTy}px) scale(${finalScale})`;
  }

  // 3D 变换
  const tx = (-cam.x * scale).toFixed(3);
  const ty = (-cam.y * scale).toFixed(3);
  const rxStr = rx.toFixed(3);
  const ryStr = ry.toFixed(3);
  const rzStr = rz.toFixed(3);
  const s = scale.toFixed(5);

  return `translate3d(${tx}px, ${ty}px, 0px) scale3d(${s}, ${s}, 1) rotateX(${rxStr}deg) rotateY(${ryStr}deg) rotateZ(${rzStr}deg)`;
}

/**
 * 屏幕投影视口计算 (World Point -> Screen Pixel)
 * 将世界坐标系下的点映射到 Stage 画布中心为基准的屏幕像素坐标
 */
export function camProject(
  cam: CameraState,
  worldPoint: [number, number, number?],
  stageSize: [number, number] = [1920, 1080]
): [number, number] {
  const scale = 1 / Math.max(0.0001, cam.z);
  const halfW = stageSize[0] / 2;
  const halfH = stageSize[1] / 2;

  const dx = (worldPoint[0] - cam.x) * scale;
  const dy = (worldPoint[1] - cam.y) * scale;

  const rx = cam.rx ?? 0;
  const ry = cam.ry ?? 0;
  const rz = cam.rz ?? 0;

  const hasRotation =
    Math.abs(rx) > 0.001 ||
    Math.abs(ry) > 0.001 ||
    Math.abs(rz) > 0.001;

  if (!hasRotation) {
    return [halfW + dx, halfH + dy];
  }

  // 包含 3D 旋转的投影 (小角度近似或透视投影)
  const deg2rad = Math.PI / 180;
  const radX = rx * deg2rad;
  const radY = ry * deg2rad;
  const radZ = rz * deg2rad;

  // 绕 Z 轴
  let x1 = dx * Math.cos(radZ) - dy * Math.sin(radZ);
  let y1 = dx * Math.sin(radZ) + dy * Math.cos(radZ);
  let z1 = (worldPoint[2] ?? 0) * scale;

  // 绕 X 轴
  let y2 = y1 * Math.cos(radX) - z1 * Math.sin(radX);
  let z2 = y1 * Math.sin(radX) + z1 * Math.cos(radX);

  // 绕 Y 轴
  let x3 = x1 * Math.cos(radY) + z2 * Math.sin(radY);
  let z3 = -x1 * Math.sin(radY) + z2 * Math.cos(radY);

  const focal = 1000;
  const persp = focal / Math.max(1, focal + z3);

  return [halfW + x3 * persp, halfH + y2 * persp];
}
