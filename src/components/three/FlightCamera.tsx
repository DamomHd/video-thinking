/**
 * 漫游相机：把 flightPose 算出的机位摆到画布相机上（零时钟：t 当 prop 传入，useLayoutEffect 摆位）
 *
 *   <FilmCanvas …>
 *     <FlightCamera plan={plan} t={t} />
 *     …场景…
 *   </FilmCanvas>
 *
 * plan 用 planFlight 在模块顶层建一次（不要每帧建：曲线弧长表要算 400 段）。
 */

import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { FlightPlan, flightPose } from '../../shared/flight';

export const FlightCamera: React.FC<{ plan: FlightPlan; t: number }> = ({ plan, t }) => {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    const p = flightPose(plan, t);
    camera.position.set(...p.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(new THREE.Vector3(...p.look));
    if (p.roll) camera.rotateZ(p.roll);
    const aspect = size.width / size.height;
    if (camera.fov !== p.fov || camera.aspect !== aspect) {
      camera.fov = p.fov;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }, [camera, plan, t, size.width, size.height]);
  return null;
};
