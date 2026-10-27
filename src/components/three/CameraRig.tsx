/**
 * 工业级 Three.js 零时钟摄影机绑架器 (CameraRig)
 * 严格遵循 LoomCare §7 规范第 2 条：
 * "三维画布不靠时钟。时间 t 由幕组件算好，作为 prop 传进去；相机由 CameraRig 在 useLayoutEffect 里摆位"
 */

import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';

export interface CameraPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number; // 竖直视场角 (deg)
}

/**
 * 纯函数：将 Three.js 相机绝对定位到指定姿态
 */
export function applyCameraPose(
  camera: THREE.PerspectiveCamera,
  pose: CameraPose,
  aspect?: number
): void {
  camera.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
  camera.lookAt(new THREE.Vector3(pose.look[0], pose.look[1], pose.look[2]));

  let matrixNeedsUpdate = false;
  if (pose.fov !== undefined && camera.fov !== pose.fov) {
    camera.fov = pose.fov;
    matrixNeedsUpdate = true;
  }
  if (aspect !== undefined && camera.aspect !== aspect) {
    camera.aspect = aspect;
    matrixNeedsUpdate = true;
  }
  if (matrixNeedsUpdate) {
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld();
}

export interface CameraRigProps {
  camera: THREE.PerspectiveCamera;
  pose: CameraPose;
  aspect?: number;
}

/**
 * React 声明式摆位组件：在每一帧渲染的 DOM 提交前，同步更新 Three.js 相机位置
 */
export const CameraRig: React.FC<CameraRigProps> = ({ camera, pose, aspect }) => {
  useLayoutEffect(() => {
    if (!camera) return;
    applyCameraPose(camera, pose, aspect);
  }, [camera, pose, aspect]);

  return null;
};
