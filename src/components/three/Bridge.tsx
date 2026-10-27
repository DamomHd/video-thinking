/**
 * 2D ↔ 3D 镜头桥的组件（原理见 shared/bridge.ts）
 *
 *   <BridgeStage view={{ kind: '2d', camera }} … />            交接前：普通 2D 舞台（CSS 镜头）
 *   <BridgeStage view={{ kind: '3d', pose }} three={…} … />    交接后：纸面按 3D 相机射影贴合 + three 画布叠在上面
 *   <ProjectedHtml pose corners={…} w h>文字</ProjectedHtml>   DOM 文字贴在任意 3D 平面上
 *
 * 交接帧用 cameraFromStage(2D 镜头) 得到 3D 机位，两种模式在那一帧画面一致；之后 3D 相机自由运动。
 * 3D 物体在交接时应当是「平的」（贴在纸面 Z = 0），之后再立起来 —— 否则交接那一帧会凭空冒出东西。
 */

import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { Stage } from '../Stage';
import { CameraState } from '../../shared/camera';
import { Pose3D, V3, paperTransform, projectQuad } from '../../shared/bridge';
import { quadMatrix3d } from '../../shared/homography';
import { FilmCanvas } from './FilmCanvas';

export type BridgeView = { kind: '2d'; camera: CameraState } | { kind: '3d'; pose: Pose3D };

/** three 画布的相机按 Pose3D 摆位（含 up 与 fov） */
export const Pose3DCamera: React.FC<{ pose: Pose3D }> = ({ pose }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    camera.position.set(...pose.pos);
    camera.up.set(...(pose.up ?? [0, 1, 0]));
    camera.lookAt(new THREE.Vector3(...pose.look));
    camera.fov = pose.fov;
    camera.aspect = size.width / size.height;
    camera.near = 1;
    camera.far = 1e6;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }, [camera, pose, size.width, size.height]);
  return null;
};

export const BridgeStage: React.FC<{
  view: BridgeView;
  width?: number;
  height?: number;
  backgroundColor?: string;
  /** 不随镜头动的前景（HUD） */
  foreground?: React.ReactNode;
  /** 3D 模式下叠在纸面上方的 three 内容（灯光、网格体……） */
  three?: React.ReactNode;
  /** 3D 模式下叠在 three 画布上方的 DOM（ProjectedHtml 文字等） */
  overlay?: React.ReactNode;
  children: React.ReactNode;
}> = ({ view, width = 1920, height = 1080, backgroundColor = '#F3F0E8', foreground, three, overlay, children }) => {
  if (view.kind === '2d') {
    return (
      <Stage camera={view.camera} width={width} height={height} backgroundColor={backgroundColor} foreground={foreground}>
        {children}
      </Stage>
    );
  }
  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden', backgroundColor }}>
      {/* 纸面：整张 2D 世界按 3D 相机做射影贴合 */}
      <div style={{ position: 'absolute', left: 0, top: 0, width, height, transformOrigin: '0 0', transform: paperTransform(view.pose, { stage: [width, height] }) }}>
        {children}
      </div>
      {/* 3D 物体：同一台相机，透明底叠在纸面上方 */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <FilmCanvas width={width} height={height} ssaa="super" camera={{ fov: view.pose.fov, near: 1, far: 1e6 }}>
          <Pose3DCamera pose={view.pose} />
          {three}
        </FilmCanvas>
      </div>
      {overlay && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{overlay}</div>}
      {foreground && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{foreground}</div>}
    </div>
  );
};

/**
 * DOM 内容贴在 3D 平面上：corners = 平面四个角的 3D 坐标（左上、右上、右下、左下），
 * 内容按 w × h 排版，再射影到屏幕上那四个点。中文字仍是 DOM 渲染，清晰、可用任何字体。
 * 放在 BridgeStage 的 overlay 里（屏幕坐标系）。
 */
export const ProjectedHtml: React.FC<{
  pose: Pose3D;
  corners: [V3, V3, V3, V3];
  w: number;
  h: number;
  size?: [number, number];
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ pose, corners, w, h, size = [1920, 1080], style, children }) => {
  const quad = projectQuad(pose, corners, size);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: w, height: h, transformOrigin: '0 0', transform: quadMatrix3d(w, h, quad), ...style }}>
      {children}
    </div>
  );
};
