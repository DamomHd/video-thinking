import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { PhoneShot } from '../components/PhoneShot';
import { FilmCanvas, PoseCamera } from '../components/three/FilmCanvas';
import { FilmPost } from '../components/three/FilmPost';
import { StudioEnv } from '../components/three/StudioEnv';
import { GlbAsset } from '../components/three/GlbAsset';
import { carePhonePose, careCameraPose, careScreenQuad, careTrackSig } from '../films/loomcare-demo/scenes/careRig';
import { PHONE_SPECS } from '../films/loomcare-demo/three/phoneGeo';

/**
 * 3D 实时层验收探针（内容中性：屏幕是一张对齐用的网格）
 *   帧 0–29：PhoneShot 的降级路径 —— 清单不齐时退回 three.js 机身，DOM 屏幕按同一组四角贴合
 *   帧 30–59：FilmCanvas + StudioEnv + FilmPost 整条后期链，挂 glb 机身
 */
const GRID: React.CSSProperties = {
  width: '100%',
  height: '100%',
  background:
    'repeating-linear-gradient(0deg, transparent 0 39px, rgba(255,80,40,0.9) 39px 41px), ' +
    'repeating-linear-gradient(90deg, transparent 0 39px, rgba(255,80,40,0.9) 39px 41px), #F4F2EE',
  boxShadow: 'inset 0 0 0 4px #FF5028',
};

export const PhoneFallbackProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < 30) {
    const t = 2 + frame / fps;
    return (
      <AbsoluteFill style={{ background: '#D9D6CF' }}>
        <PhoneShot
          t={t}
          screenQuad={careScreenQuad(t)}
          currentSig={careTrackSig()}
          phoneBodyManifest={{ complete: false, sig: 'none', frames: 0 }}
          body3d={{ specs: PHONE_SPECS, phone: carePhonePose(t), camera: careCameraPose(t) }}
        >
          <div style={GRID} />
        </PhoneShot>
      </AbsoluteFill>
    );
  }
  const t = (frame - 30) / fps;
  return (
    <AbsoluteFill style={{ background: '#101215' }}>
      <FilmCanvas width={1920} height={1080} background="#101215" camera={{ fov: 30, near: 1, far: 5000 }}>
        <PoseCamera pose={{ pos: [0, 0, 300], look: [0, 0, 0], fov: 30 }} />
        <StudioEnv />
        <GlbAsset src="models/phone.glb" rotation={[0.1, -0.6 + t * 0.4, 0.05]} />
        {/* --props '{"post":{"noise":false}}' 可逐个关掉效果，定位确定性问题 */}
        <FilmPost t={t} dof={{ focusDistance: 0.02 }} bloom={{ intensity: 0.6 }} {...((getInputProps() as { post?: object }).post ?? {})} />
      </FilmCanvas>
    </AbsoluteFill>
  );
};
