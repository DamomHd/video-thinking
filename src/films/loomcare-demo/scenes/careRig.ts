/**
 * 第五幕机位单源 (careRig)
 * 对标 architecture.html §8「单源 + 签名 + 降级」第 1 步：
 *   姿态、相机、屏幕几何都是幕内秒的纯函数；只依赖 three，Node 里也能跑。
 *   careTrackSig() 用 FNV-1a 对每帧采样做哈希（精度 1e-6），机位一改签名就变，
 *   Blender 帧序列对不上签名时渲染端自动降级回程序化机身。
 */

import { CARE_SECONDS } from '../timeline';
import {
  PhonePose,
  CameraPose,
  PHONE_SPECS,
  projectScreenCorners,
  projectBodyCorners,
  fnv1a,
} from '../three/phoneGeo';

/** 轨迹采样网格：1/60s（30fps 片取偶数 k，60fps 片逐帧取） */
export const CARE_TRACK_FPS = 60;
export const CARE_TRACK_FRAMES = Math.round(CARE_SECONDS * CARE_TRACK_FPS);

/** 幕内节拍（秒）：机身亮起、心跳、推进到位 */
export const CARE_T = {
  wake: 1.2,
  heartBeat: 3.2,
  settle: 8.0,
  handoff: 18.4,
} as const;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** 对数插值的推进缓动（镜头曲线，与 shared/camera 的 camOut 同族） */
const camOut = (p: number) => 1 - Math.pow(1 - clamp01(p), 3.5);

/** 幕内秒 → 机身姿态（纯函数） */
export function carePhonePose(t: number): PhonePose {
  const p = camOut(t / CARE_SECONDS);
  // 微小偏航 + 末段轻微回正，模拟手持微动
  const yaw = Math.sin(p * Math.PI) * 0.15;
  const roll = 0.05 * p;
  // 心跳时刻一次极轻的纵向呼吸（±0.4mm）
  const breath = Math.exp(-Math.pow((t - CARE_T.heartBeat) / 0.35, 2)) * 0.4;
  return {
    pos: [0, breath, 0],
    rot: [0, yaw, roll],
    scale: [1, 1, 1],
  };
}

/** 幕内秒 → 相机（纯函数）：320mm 推至 280mm */
export function careCameraPose(t: number): CameraPose {
  const p = camOut(t / CARE_SECONDS);
  return {
    pos: [0, 0, 320 - p * 40],
    look: [0, 0, 0],
    fov: 28.0,
  };
}

/** 幕内秒 → 屏幕四角像素坐标（DOM 屏幕按这四个角用 matrix3d 贴合） */
export function careScreenQuad(
  t: number,
  viewWidth = 1920,
  viewHeight = 1080
): [number, number][] {
  return projectScreenCorners(carePhonePose(t), careCameraPose(t), viewWidth, viewHeight);
}

/** 幕内秒 → 机身外轮廓四角像素坐标（程序化降级机身用这四个角贴合） */
export function careBodyQuad(
  t: number,
  viewWidth = 1920,
  viewHeight = 1080
): [number, number][] {
  return projectBodyCorners(carePhonePose(t), careCameraPose(t), viewWidth, viewHeight);
}

/** 机身设计尺寸（mm），降级机身按这个比例画圆角与边框 */
export const CARE_BODY_SPECS = PHONE_SPECS;

export interface CareTrackFrame {
  k: number;
  t: number;
  phone: PhonePose;
  camera: CameraPose;
  screenQuad: [number, number][];
}

/** 全量采样轨迹（Blender 导出与签名共用同一份采样） */
export function careTrackFrames(
  viewWidth = 1920,
  viewHeight = 1080
): CareTrackFrame[] {
  const out: CareTrackFrame[] = [];
  for (let k = 0; k <= CARE_TRACK_FRAMES; k++) {
    const t = k / CARE_TRACK_FPS;
    out.push({
      k,
      t: Math.round(t * 1000) / 1000,
      phone: carePhonePose(t),
      camera: careCameraPose(t),
      screenQuad: careScreenQuad(t, viewWidth, viewHeight),
    });
  }
  return out;
}

/**
 * 机位签名：对每帧的姿态、相机、屏幕四角采样做 FNV-1a，精度 1e-6。
 * 这是「签名兜底」的唯一依据 —— 机位改了而帧序列没重渲，渲染端自动降级。
 */
export function careTrackSig(viewWidth = 1920, viewHeight = 1080): string {
  const parts: string[] = [];
  for (const f of careTrackFrames(viewWidth, viewHeight)) {
    const nums = [
      ...f.phone.pos, ...f.phone.rot, ...f.phone.scale,
      ...f.camera.pos, ...f.camera.look, f.camera.fov,
      ...f.screenQuad.flat(),
    ];
    parts.push(`${f.k}:${nums.map((n) => n.toFixed(6)).join(',')}`);
  }
  return fnv1a(parts.join(';'));
}
