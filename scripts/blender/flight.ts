import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { FlightPlan, flightPose, flightSig, flightTrack, Vec3 } from '../../src/shared/flight.js';
import { findBlender } from './assets.js';

/**
 * 漫游路线 → Blender（vw blender flight）
 *
 *   vw blender flight --module=src/films/<片>/flight.ts --export=PLAN [--fps=60] [--blend=scene.blend] [--out=…]
 *
 * 1. 动态 import 片里导出的 FlightPlan（路线写在片里，这里不规定放在哪 —— 不新增片级配置）
 * 2. 按 fps 采样成轨迹 JSON，附签名和参考点投影（three 侧算的屏幕坐标）
 * 3. Blender 给相机逐帧打关键帧，并用参考点比对投影（偏差 > 0.5px 退出），存成 .blend
 *
 * 渲染本身不在这里做：在 M 系列上打开 .blend 用 Cycles 渲；Intel 上只做到导出（见 vw hw）。
 */

export interface FlightExportOptions {
  plan: FlightPlan;
  fps?: number;
  size?: [number, number];
  /** 参考点：缺省取途经点（它们一定在视野附近） */
  probePoints?: Vec3[];
}

/** three 侧投影（与 FlightCamera 摆位完全一致：lookAt 后绕自身 z 轴 roll） */
export function projectWithThree(pose: ReturnType<typeof flightPose>, p: Vec3, size: [number, number]): [number, number, number] {
  const cam = new THREE.PerspectiveCamera(pose.fov, size[0] / size[1], 0.1, 100000);
  cam.position.set(...pose.pos);
  cam.up.set(0, 1, 0);
  cam.lookAt(new THREE.Vector3(...pose.look));
  if (pose.roll) cam.rotateZ(pose.roll);
  cam.updateMatrixWorld();
  cam.updateProjectionMatrix();
  const v = new THREE.Vector3(...p);
  const inFront = v.clone().applyMatrix4(cam.matrixWorldInverse).z < 0 ? 1 : 0;
  v.project(cam);
  return [((v.x + 1) / 2) * size[0], ((1 - v.y) / 2) * size[1], inFront];
}

export function buildFlightTrackJson(o: FlightExportOptions) {
  const fps = o.fps ?? 60;
  const size = o.size ?? [1920, 1080];
  const frames = flightTrack(o.plan, fps);
  const points = o.probePoints ?? o.plan.waypoints.map((w) => w.pos);
  // 抽 8 帧做投影比对（均匀分布，含首尾）
  const sampleKs = Array.from({ length: 8 }, (_, i) => Math.round((i / 7) * (frames.length - 1)));
  const probeFrames = sampleKs.map((k) => {
    const f = frames[k];
    const screen = points.map((p) => projectWithThree(f, p, size));
    return { k, screen };
  });
  return {
    fps,
    size,
    sig: flightSig(frames),
    frames,
    probes: {
      points,
      // 在相机背后的点记 null，Blender 侧跳过
      frames: probeFrames.map((pf) => ({ k: pf.k, screen: pf.screen.map(([x, y, front]) => (front ? [x, y] : null)) })),
    },
  };
}

export async function runFlightExport(options: {
  module: string;
  exportName: string;
  fps?: number;
  blend?: string;
  out?: string;
}): Promise<{ trackPath: string; blendPath: string | null; sig: string }> {
  const root = process.cwd();
  const modPath = path.resolve(root, options.module);
  const mod = await import(pathToFileURL(modPath).href);
  const plan: FlightPlan | undefined = mod[options.exportName];
  if (!plan || !plan.spans) throw new Error(`[vw blender flight] ${options.module} 没有导出 FlightPlan「${options.exportName}」`);

  const json = buildFlightTrackJson({ plan, fps: options.fps });
  const base = path.basename(modPath).replace(/\.[^.]+$/, '') + '-' + options.exportName;
  const outDir = path.join(root, 'out', 'flight');
  fs.mkdirSync(outDir, { recursive: true });
  const trackPath = path.join(outDir, `${base}.json`);
  fs.writeFileSync(trackPath, JSON.stringify(json));
  console.log(`[vw blender flight] 轨迹 ${json.frames.length} 帧 @${json.fps}fps，签名 ${json.sig} → ${path.relative(root, trackPath)}`);

  const blender = findBlender();
  if (!blender) {
    console.log('[vw blender flight] 未检测到 Blender，只导出了轨迹 JSON');
    return { trackPath, blendPath: null, sig: json.sig };
  }
  const blendPath = path.resolve(root, options.out ?? path.join('out', 'flight', `${base}.blend`));
  const py = path.join(root, 'blender', 'fx', 'flight_cam.py');
  const scene = options.blend ? `"${path.resolve(root, options.blend)}"` : '';
  execSync(`"${blender}" -b ${scene} -Y --factory-startup -P "${py}" -- --track="${trackPath}" --out="${blendPath}"`, {
    stdio: 'inherit',
  });
  if (!fs.existsSync(blendPath)) throw new Error('[vw blender flight] Blender 没有写出 .blend（投影比对失败时会退出）');
  return { trackPath, blendPath, sig: json.sig };
}
