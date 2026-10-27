/**
 * 影片用的 three 画布（architecture.html §7 / §9.4 的 WebGL 部分）
 *
 * 把散在各片里的三条约定收成一个外壳：
 *   1. 超采样两种处理（§9.4「画布的三种处理」里的两种 WebGL 情况）
 *      · 'pixelated'：dpr=1 + image-rendering: pixelated。出片 --scale=2 时 4K 截帧把每个像素放大成 2×2，
 *        编码前面积缩回 1080p 后和 1× 渲染逐像素相同 —— 后期的颗粒、景深观感不变（机身、序幕用这个）
 *      · 'super'：dpr = 超采样倍数，真超采样（细线多、要锐的世界用这个）
 *   2. dpr 只在挂载时定一次，之后绝不切换 —— 切 dpr 会让 EffectComposer 重建并丢失 WebGL 上下文
 *   3. 预览 / 出片分流：Studio 里可以降档（useRenderQuality() === 'preview'），渲染时恒走全量；
 *      降档只能动「效果开关和采样」，不能动 dpr
 *
 * 时间不靠时钟：t 由幕组件算好当 prop 传进世界，相机用 CameraRig / PoseCamera 在 useLayoutEffect 里摆位。
 */

import React, { useLayoutEffect, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { getRemotionEnvironment } from 'remotion';
import { getSsaaScale } from '../../shared/ssaa';
import { applyCameraPose, CameraPose } from './CameraRig';

export type CanvasSsaaMode = 'pixelated' | 'super';
export type RenderQuality = 'full' | 'preview';

/** 出片恒为 full；只有 Studio 交互预览才是 preview */
export function useRenderQuality(): RenderQuality {
  const env = getRemotionEnvironment();
  return env.isRendering || !env.isStudio ? 'full' : 'preview';
}

export interface FilmCanvasProps {
  width: number;
  height: number;
  ssaa?: CanvasSsaaMode;
  /**
   * 正交相机（轴测 / 等距视角）：没有透视近大远小，适合场景剖面、等距插画、结构图。
   * 画面大小由 PoseCamera 的 zoom 控制（世界单位 → 像素的倍数）
   */
  orthographic?: boolean;
  camera?: { fov?: number; near?: number; far?: number; position?: [number, number, number] };
  background?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const FilmCanvas: React.FC<FilmCanvasProps> = ({
  width,
  height,
  ssaa = 'pixelated',
  orthographic = false,
  camera,
  background,
  style,
  children,
}) => {
  // 挂载时定一次，之后不变（见文件头第 2 条）
  const [dpr] = useState(() => (ssaa === 'super' ? getSsaaScale() : 1));
  return (
    <ThreeCanvas
      width={width}
      height={height}
      dpr={dpr}
      gl={{ antialias: false, preserveDrawingBuffer: true }}
      orthographic={orthographic}
      camera={orthographic ? { near: 0.1, far: 1000, ...camera, fov: undefined } : { fov: 30, near: 0.1, far: 1000, ...camera }}
      style={{ imageRendering: ssaa === 'pixelated' ? 'pixelated' : 'auto', ...style }}
    >
      {background && <color attach="background" args={[background]} />}
      {children}
    </ThreeCanvas>
  );
};

/**
 * 用画布自带的默认相机按姿态摆位（不想自己管 camera 对象时用）。
 * 正交画布时 zoom 生效（世界 1 单位 = zoom 像素），fov 被忽略。
 */
export const PoseCamera: React.FC<{ pose: CameraPose; zoom?: number }> = ({ pose, zoom }) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
      const c = camera as THREE.OrthographicCamera;
      c.position.set(...pose.pos);
      c.lookAt(new THREE.Vector3(...pose.look));
      if (zoom !== undefined && c.zoom !== zoom) {
        c.zoom = zoom;
        c.updateProjectionMatrix();
      }
      c.updateMatrixWorld();
      return;
    }
    applyCameraPose(camera as THREE.PerspectiveCamera, pose, size.width / size.height);
  }, [camera, pose, zoom, size.width, size.height]);
  return null;
};

/**
 * 轴测机位：从 target 出发，按方位角 / 仰角退 dist 远看回来。
 * 缺省是标准等距视角（方位 45°、仰角 35.264° = atan(1/√2)），三个轴的投影长度相等。
 */
export function isoPose(
  target: [number, number, number],
  dist: number,
  options: { azimuthDeg?: number; elevationDeg?: number } = {}
): CameraPose {
  const az = ((options.azimuthDeg ?? 45) * Math.PI) / 180;
  const el = ((options.elevationDeg ?? (Math.atan(1 / Math.SQRT2) * 180) / Math.PI) * Math.PI) / 180;
  return {
    pos: [
      target[0] + dist * Math.cos(el) * Math.sin(az),
      target[1] + dist * Math.sin(el),
      target[2] + dist * Math.cos(el) * Math.cos(az),
    ],
    look: target,
  };
}
