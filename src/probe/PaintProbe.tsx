import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { WatercolorWash, InkBleed } from '../components/sketch';
import { FilmCanvas, PoseCamera, isoPose } from '../components/three';
import { blobShape } from '../shared/watercolor';
import { stepTime, stepJitter, jitterTransform } from '../shared/stepped';
import { draw, stroke } from '../shared/motion';

/**
 * 绘画类 + 定格 + 轴测原语的验收探针（内容中性：几何色块与方块）
 *   左：三块水彩（multiply 叠色）依次晕开
 *   右上：一滴水墨扩散
 *   右下：正交轴测视角里的方块，按 12 张/秒定格节奏转动，每张拍摄帧带一点错位
 */
const W = 1920;
const H = 1080;
const PAPER = '#F3EEE3';

const IsoBlocks: React.FC<{ t: number }> = ({ t }) => {
  const ts = stepTime(t, 12);
  const pose = React.useMemo(() => isoPose([0, 0, 0], 40), []);
  return (
    <FilmCanvas width={640} height={420} orthographic background={PAPER}>
      <PoseCamera pose={pose} zoom={34} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 20, 6]} intensity={1.5} />
      {[[-2.4, 0], [0, 0], [2.4, 0], [0, -2.4], [0, 2.4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.6, z]} rotation={[0, ts * 0.8 + i, 0]}>
          <boxGeometry args={[1.4, 1.2 + (i % 3) * 0.5, 1.4]} />
          <meshStandardMaterial color={i === 1 ? '#C8553D' : '#D9CBB4'} roughness={0.9} />
        </mesh>
      ))}
    </FilmCanvas>
  );
};

export const PaintProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const j = stepJitter(t, 12, 5, { ampPx: 1.5, rotDeg: 0.4 });
  return (
    <AbsoluteFill style={{ background: PAPER }}>
      <WatercolorWash width={W} height={H} shape={blobShape([420, 420], 230, 10, 260, 200)} color="#3A6EA5" progress={draw(t, 0.2, 2.2)} seed={7} style={{ position: 'absolute', mixBlendMode: 'multiply' }} />
      <WatercolorWash width={W} height={H} shape={blobShape([640, 560], 200)} color="#D9A441" progress={draw(t, 0.9, 2.2)} seed={11} style={{ position: 'absolute', mixBlendMode: 'multiply' }} />
      <WatercolorWash width={W} height={H} shape={blobShape([480, 720], 170, 9)} color="#C8553D" progress={draw(t, 1.6, 2.2)} seed={23} variance={0.2} style={{ position: 'absolute', mixBlendMode: 'multiply' }} />
      <InkBleed width={W} height={H} center={[1430, 270]} radius={200} progress={stroke(t, 0.5, 3.0)} style={{ position: 'absolute', mixBlendMode: 'multiply' }} />
      <div style={{ position: 'absolute', left: 1140, top: 580, transform: jitterTransform(j) }}>
        <IsoBlocks t={t} />
      </div>
      <div style={{ position: 'absolute', right: 24, bottom: 20, font: '600 22px ui-monospace, monospace', color: '#FF5028' }}>
        PaintProbe t={t.toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
