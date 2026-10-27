/**
 * 产品棚环境光（给金属 / 玻璃材质用的反射环境）
 *
 * three 的金属材质没有环境贴图时只反射黑色，机身、glb 资产会渲成一块黑。
 * 这里用 three 自带的 RoomEnvironment 过一遍 PMREM 生成环境贴图：
 * 纯程序生成、不加载外部 HDR，所以不需要 delayRender，逐帧结果确定。
 */

import React, { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const StudioEnv: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
};
