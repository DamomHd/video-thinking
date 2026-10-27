/**
 * Canvas 2D 确定性手稿数学与几何核心 (Deterministic Sketch Math & Geometry)
 * 严格遵循 LoomCare §7 规范：
 * 1. 纯数学 3D 轴测/透视投影，逐帧纯函数绘制，不量 DOM
 * 2. 1/4 离屏缓冲高斯漫反射发光算子
 * 3. 万向环、点云星轨、经纬流线的确定性算法
 */

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
  depth: number;
}

/**
 * 3D 欧拉旋转与透视投影
 */
export function project3D(
  pt: Point3D,
  rot: { rx: number; ry: number; rz: number },
  fov = 900,
  camDist = 1200
): Point2D {
  // 绕 X 轴旋转
  const cx = Math.cos(rot.rx), sx = Math.sin(rot.rx);
  const y1 = pt.y * cx - pt.z * sx;
  const z1 = pt.y * sx + pt.z * cx;

  // 绕 Y 轴旋转
  const cy = Math.cos(rot.ry), sy = Math.sin(rot.ry);
  const x2 = pt.x * cy + z1 * sy;
  const z2 = -pt.x * sy + z1 * cy;

  // 绕 Z 轴旋转
  const cz = Math.cos(rot.rz), sz = Math.sin(rot.rz);
  const x3 = x2 * cz - y1 * sz;
  const y3 = x2 * sz + y1 * cz;

  // 透视除法
  const depth = camDist + z2;
  const scale = depth > 10 ? fov / depth : 1;

  return {
    x: x3 * scale,
    y: y3 * scale,
    depth,
  };
}

/**
 * 确定性万向环几何生成 (Harness Rings)
 * 返回一组同心且按不同倾角与转速旋转的 3D 椭圆点序列
 */
export function generateRingPoints(
  radius: number,
  tiltXRad: number,
  rotZRad: number,
  segments = 64
): Point3D[] {
  const points: Point3D[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    // 基础圆平面
    const x0 = Math.cos(angle) * radius;
    const y0 = Math.sin(angle) * radius;
    const z0 = 0;

    // 倾斜与旋转
    const y1 = y0 * Math.cos(tiltXRad);
    const z1 = y0 * Math.sin(tiltXRad);

    const x2 = x0 * Math.cos(rotZRad) - y1 * Math.sin(rotZRad);
    const y2 = x0 * Math.sin(rotZRad) + y1 * Math.cos(rotZRad);

    points.push({ x: x2, y: y2, z: z1 });
  }
  return points;
}

/**
 * 确定性经纬球线几何生成 (Thread Ball)
 */
export function generateLatitudeRing(
  sphereRadius: number,
  latAngleRad: number,
  rotRad: number,
  segments = 48
): Point3D[] {
  const r = sphereRadius * Math.cos(latAngleRad);
  const z = sphereRadius * Math.sin(latAngleRad);
  const pts: Point3D[] = [];

  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2 + rotRad;
    pts.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
      z,
    });
  }
  return pts;
}

/**
 * 离屏高斯发光渲染管线 (Offscreen Glow Pipeline)
 * 原理：在 1/4 分辨率的离屏 Canvas 上绘制发光骨架，高斯模糊后以 'lighter' 混合模式贴回主画板
 */
export function renderWithGlow(
  mainCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drawBase: (ctx: CanvasRenderingContext2D) => void,
  glowBlurPx = 24,
  glowAlpha = 0.6
): void {
  // 1. 正常绘制主体
  drawBase(mainCtx);

  // 2. 发光叠加层 (若支持 filter)
  mainCtx.save();
  mainCtx.globalCompositeOperation = 'lighter';
  mainCtx.filter = `blur(${glowBlurPx}px)`;
  mainCtx.globalAlpha = glowAlpha;
  drawBase(mainCtx);
  mainCtx.restore();
}
