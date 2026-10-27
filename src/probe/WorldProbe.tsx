import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { World } from '../films/us/short/world/World';

/** 把短片的 R3F 世界单独挂起来（没有后期链、没有二维层），定位问题出在世界还是外壳 */
export const WorldProbe: React.FC = () => (
  <AbsoluteFill style={{ background: '#0B0D12' }}>
    <ThreeCanvas
      width={1920}
      height={1080}
      gl={{ antialias: false }}
      camera={{ fov: 34, near: 0.1, far: 200, position: [0, 4.2, 16.5] }}
    >
      <color attach="background" args={['#050508']} />
      <World t={8.889} weave={0.55} />
    </ThreeCanvas>
  </AbsoluteFill>
);
