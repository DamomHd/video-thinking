/**
 * 3D 漫游运镜 (Flight Path)
 *
 * 「从哪出发 → 经过哪 → 停在哪」：给一串途经点，相机沿平滑曲线飞过去。
 * 只给途经点、不给逐帧机位，是为了让编排停留在「路线」这一层 —— 和 2D 的 shotRail 同一个思路。
 *
 * 几个让漫游「像真机位」而不是「像插值」的细节：
 *   1. 匀速：按弧长参数化（不是按曲线参数 t）。控制点密的地方不会突然变慢、稀的地方不会突然变快
 *   2. 加减速：每段移动是梯形速度曲线 —— 起步加速、中途匀速、到站减速；不是从头到尾一条 easeInOut
 *   3. 停留：途经点可以设 hold 秒，相机在那里停住（缓慢推近一点，不冻帧）
 *   4. 看向前方：视线点是路径上前方 lookAhead 的位置；到终点时沿切线外推，不会突然低头
 *   5. 侧倾：按水平面上的转弯速率侧倾（像无人机过弯），有上限
 *
 * 纯函数：给时间出姿态，Node 里也能跑；同一份采样可以导出给 Blender（flightTrack + flightSig）。
 * 坐标、单位由使用方决定（three 世界坐标，y 朝上）。
 */

import * as THREE from 'three';
import { clamp01 } from './anim';

export type Vec3 = [number, number, number];

export interface FlightWaypoint {
  pos: Vec3;
  /** 在这个点停留多少秒（首尾点也可以停） */
  hold?: number;
  /** 到这个点时的竖直视角；缺省沿用上一个 */
  fov?: number;
}

export interface FlightOptions {
  /** 移动总时长（不含停留），秒 */
  moveSec: number;
  /** 起飞时刻，秒 */
  start?: number;
  /** 视线看向前方多远（占全程弧长的比例），缺省 0.06 */
  lookAhead?: number;
  /** 加速 / 减速各占每段移动时长的比例，缺省 0.25 */
  accel?: number;
  /** 侧倾强度：每 10% 全程转过 1 弧度时侧倾多少度，缺省 18；0 关闭 */
  bank?: number;
  /** 侧倾上限（度），缺省 12 */
  maxBankDeg?: number;
  /** 停留时的缓推（沿视线前进的距离占当前到视线点距离的比例），缺省 0.02 */
  holdDrift?: number;
  /** 曲线张力：centripetal 不打结，缺省 */
  curve?: 'centripetal' | 'chordal' | 'catmullrom';
  defaultFov?: number;
}

export interface FlightPose {
  pos: Vec3;
  look: Vec3;
  fov: number;
  /** 侧倾（弧度，绕视线轴） */
  roll: number;
}

export interface FlightPlan {
  curve: THREE.CatmullRomCurve3;
  /** 每个途经点在弧长上的位置 0..1 */
  stopsU: number[];
  /** 时间表：每段 [t0, t1, u0, u1, kind] */
  spans: { t0: number; t1: number; u0: number; u1: number; kind: 'move' | 'hold'; wp: number }[];
  totalSec: number;
  waypoints: FlightWaypoint[];
  options: Required<Omit<FlightOptions, 'start'>> & { start: number };
}

/** 梯形速度曲线：位置进度（0..1），加速段 a、减速段 a、中间匀速 */
export function trapezoid(p: number, a = 0.25): number {
  const x = clamp01(p);
  const acc = Math.max(1e-6, Math.min(0.5, a));
  const vmax = 1 / (1 - acc); // 面积 = 1
  if (x < acc) return (0.5 * vmax * x * x) / acc;
  if (x > 1 - acc) {
    const r = 1 - x;
    return 1 - (0.5 * vmax * r * r) / acc;
  }
  return 0.5 * vmax * acc + vmax * (x - acc);
}

/**
 * 曲线参数 t（第 i 个控制点在 i/(n-1)）→ 弧长比例 u。
 * 在 three 自己的 u→t 映射上二分反查，而不是另起一张表：getPointAt(u) 用的就是这张映射，
 * 反查出来的 u 再代回去正好落在控制点上（误差在弧长表精度内）。
 */
function paramToU(curve: THREE.CatmullRomCurve3, t: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (curve.getUtoTmapping(mid, 0) < t) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function planFlight(waypoints: FlightWaypoint[], options: FlightOptions): FlightPlan {
  if (waypoints.length < 2) throw new Error('planFlight: 至少两个途经点');
  const o = {
    start: options.start ?? 0,
    moveSec: options.moveSec,
    lookAhead: options.lookAhead ?? 0.06,
    accel: options.accel ?? 0.25,
    bank: options.bank ?? 18,
    maxBankDeg: options.maxBankDeg ?? 12,
    holdDrift: options.holdDrift ?? 0.02,
    curve: options.curve ?? 'centripetal',
    defaultFov: options.defaultFov ?? 35,
  };
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map((w) => new THREE.Vector3(...w.pos)),
    false,
    o.curve,
    0.5
  );
  // 弧长表加密：缺省 200 段在长路线上有可见的速度起伏
  curve.arcLengthDivisions = 2000;
  const n = waypoints.length;
  const stopsU = waypoints.map((_, i) => (i === 0 ? 0 : i === n - 1 ? 1 : paramToU(curve, i / (n - 1))));

  // 停站：首、尾、以及 hold > 0 的中间点；两个停站之间是一段完整的加速—匀速—减速
  const stopIdx = waypoints.map((w, i) => (i === 0 || i === n - 1 || (w.hold ?? 0) > 0 ? i : -1)).filter((i) => i >= 0);
  const spans: FlightPlan['spans'] = [];
  let t = o.start;
  for (let k = 0; k < stopIdx.length; k++) {
    const i = stopIdx[k];
    const hold = waypoints[i].hold ?? 0;
    if (hold > 0) {
      spans.push({ t0: t, t1: t + hold, u0: stopsU[i], u1: stopsU[i], kind: 'hold', wp: i });
      t += hold;
    }
    const next = stopIdx[k + 1];
    if (next === undefined) break;
    const dur = o.moveSec * (stopsU[next] - stopsU[i]); // 按弧长分配：全程同一个巡航速度
    spans.push({ t0: t, t1: t + dur, u0: stopsU[i], u1: stopsU[next], kind: 'move', wp: i });
    t += dur;
  }
  return { curve, stopsU, spans, totalSec: t - o.start, waypoints, options: o };
}

/** 弧长比例 u 处的 fov：在途经点之间线性过渡 */
function fovAt(plan: FlightPlan, u: number): number {
  const { waypoints, stopsU, options } = plan;
  let last = waypoints[0].fov ?? options.defaultFov;
  const fovs = waypoints.map((w) => (last = w.fov ?? last));
  for (let i = 0; i < stopsU.length - 1; i++) {
    if (u <= stopsU[i + 1]) {
      const span = stopsU[i + 1] - stopsU[i] || 1;
      const p = clamp01((u - stopsU[i]) / span);
      return fovs[i] + (fovs[i + 1] - fovs[i]) * p;
    }
  }
  return fovs[fovs.length - 1];
}

function pointAtU(curve: THREE.CatmullRomCurve3, u: number): THREE.Vector3 {
  if (u <= 1) return curve.getPointAt(clamp01(u));
  // 过了终点：沿终点切线外推（视线点用）
  const end = curve.getPointAt(1);
  const tan = curve.getTangentAt(1);
  return end.add(tan.multiplyScalar((u - 1) * curve.getLength()));
}

/** 进度 u 处水平面内的转弯速率（每单位弧长比例的偏航角变化，弧度） */
function turnRate(curve: THREE.CatmullRomCurve3, u: number): number {
  const h = 0.01;
  const a = curve.getTangentAt(clamp01(u - h));
  const b = curve.getTangentAt(clamp01(u + h));
  const ya = Math.atan2(a.x, a.z);
  const yb = Math.atan2(b.x, b.z);
  let d = yb - ya;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d / (2 * h);
}

/** 时间 → 机位（纯函数） */
export function flightPose(plan: FlightPlan, t: number): FlightPose {
  const { spans, curve, options: o } = plan;
  let u = 0;
  let holdP = 0;
  let speedFrac = 0; // 0..1：当前速度占巡航速度的比例，侧倾按它缩放（停着不侧倾）
  if (t <= spans[0].t0) u = spans[0].u0;
  else if (t >= spans[spans.length - 1].t1) u = spans[spans.length - 1].u1;
  else {
    const s = spans.find((x) => t >= x.t0 && t <= x.t1) ?? spans[spans.length - 1];
    const p = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    if (s.kind === 'hold') {
      u = s.u0;
      holdP = p;
    } else {
      u = s.u0 + (s.u1 - s.u0) * trapezoid(p, o.accel);
      const e = 1e-3;
      speedFrac = clamp01((trapezoid(Math.min(1, p + e), o.accel) - trapezoid(Math.max(0, p - e), o.accel)) / (2 * e) * (1 - o.accel));
    }
  }

  const pos = pointAtU(curve, u);
  const look = pointAtU(curve, u + o.lookAhead);
  if (holdP > 0) {
    // 停留时沿视线极缓地推近，画面不冻
    const drift = look.clone().sub(pos).multiplyScalar(o.holdDrift * Math.sin((holdP * Math.PI) / 2));
    pos.add(drift);
  }
  const maxRoll = (o.maxBankDeg * Math.PI) / 180;
  const roll = Math.max(-maxRoll, Math.min(maxRoll, (-turnRate(curve, u) * o.bank * speedFrac * Math.PI) / 180 / 10));

  return {
    pos: [pos.x, pos.y, pos.z],
    look: [look.x, look.y, look.z],
    fov: fovAt(plan, u),
    roll,
  };
}

export interface FlightTrackFrame {
  k: number;
  t: number;
  pos: Vec3;
  look: Vec3;
  fov: number;
  roll: number;
}

/** 按 fps 采样整条漫游（给 Blender 导出 / 签名用），k 从 0 开始 */
export function flightTrack(plan: FlightPlan, fps = 60): FlightTrackFrame[] {
  const total = Math.round(plan.totalSec * fps);
  const out: FlightTrackFrame[] = [];
  for (let k = 0; k <= total; k++) {
    const t = plan.options.start + k / fps;
    const p = flightPose(plan, t);
    out.push({ k, t: Math.round(t * 1e6) / 1e6, ...p });
  }
  return out;
}

/** 漫游签名：采样精度 1e-6 的 FNV-1a。路线改了签名就变，预渲染帧对不上时自动降级（和机身同一套） */
export function flightSig(track: FlightTrackFrame[]): string {
  let h = 0x811c9dc5;
  const s = track.map((f) => [f.k, ...f.pos, ...f.look, f.fov, f.roll].map((v) => v.toFixed(6)).join(',')).join(';');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
