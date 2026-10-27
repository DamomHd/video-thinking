import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { GlbAsset } from '../components/three/GlbAsset';
import { RaysOverlay } from '../components/three/RaysOverlay';
import phoneMeta from '../assets/models/phone.json' with { type: 'json' };

/**
 * Blender 资产出口的验收探针（内容中性：只有机身模型和一束光）
 *   - GlbAsset：vw blender glb 导出的 public/models/phone.glb，按尺寸单源 JSON 取景
 *   - RaysOverlay：--props '{"rays":{"complete":true,"frames":N,"dir":"…"}}' 时叠体积光
 *
 * 跑法：npx remotion still src/probe/index.ts BlenderProbe out/probe-blender.png --frame=10
 */
export const BlenderProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const rays = (getInputProps() as { rays?: { complete: boolean; frames: number; dir: string } }).rays;
  const h = phoneMeta.objects.Phone.size[1];
  // 竖直视角 30°，让机身高度占画面约 70%
  const dist = (h / 0.7 / 2) / Math.tan((30 / 2) * (Math.PI / 180));
  return (
    <AbsoluteFill style={{ background: '#D9D6CF' }}>
      <ThreeCanvas width={1920} height={1080} camera={{ fov: 30, near: 1, far: 5000, position: [0, 0, dist] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[-200, 300, 400]} intensity={2.2} />
        <directionalLight position={[300, -100, 200]} intensity={0.8} />
        <GlbAsset src="models/phone.glb" rotation={[0.08, -0.5 + frame * 0.01, 0.04]} />
      </ThreeCanvas>
      {rays && <RaysOverlay manifest={rays} />}
    </AbsoluteFill>
  );
};
