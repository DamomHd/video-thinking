import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BridgeStage, ProjectedHtml, StudioEnv } from '../components/three';
import { cameraFromStage, moveFrom, V3 } from '../shared/bridge';
import { camInOut, clamp01, easeOutCubic } from '../shared/anim';
import { BLUEPRINT } from '../styles';

/**
 * 2D ↔ 3D 镜头桥验收探针（内容中性：四个方块）
 *   0–2s   普通 2D 图纸（Stage + CSS 镜头）
 *   2.0s   交接：由 2D 镜头算出等价的 3D 相机，这一帧画面不变
 *   2–4.2s 镜头往下压、推近、略微环绕；四个方块依次从纸面立起来；编号从纸面转到立方体正面（DOM 文字贴 3D 平面）
 */
const C = BLUEPRINT.colors;
const HANDOFF = 2.0;
const CAM2D = { x: 0, y: 0, z: 1 };
const BASE = cameraFromStage(CAM2D, { fov: 30 });
const BLOCKS = [0, 1, 2, 3].map((i) => ({ cx: 600 + i * 240, cy: 560, s: 150, hMax: 120 + i * 40 }));

export const BRIDGE_PROBE_SEC = 5;

const Paper: React.FC<{ labelsOnPaper: number }> = ({ labelsOnPaper }) => (
  <>
    <div style={{ position: 'absolute', left: -800, top: -800, width: 3600, height: 2700, backgroundImage: `radial-gradient(circle, ${C.gridDot} 1.4px, transparent 1.6px)`, backgroundSize: '40px 40px' }} />
    <div style={{ position: 'absolute', left: 300, top: 720, width: 1320, height: 6, background: C.accent }} />
    <div style={{ position: 'absolute', left: 300, top: 190, font: `700 64px ${BLUEPRINT.fonts.display}`, color: C.text }}>纸面上的四个方块</div>
    {BLOCKS.map((b, i) => (
      <div key={i} style={{ position: 'absolute', left: b.cx - b.s / 2, top: b.cy - b.s / 2, width: b.s, height: b.s, border: `2px solid ${C.lineMid}`, borderRadius: 6, background: C.paperDeep, boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 48px ${BLUEPRINT.fonts.mono}`, color: C.text }}>
        <span style={{ opacity: labelsOnPaper }}>0{i + 1}</span>
      </div>
    ))}
  </>
);

export const BridgeProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  if (t < HANDOFF) {
    return (
      <AbsoluteFill>
        <BridgeStage view={{ kind: '2d', camera: CAM2D }} backgroundColor={C.paper}>
          <Paper labelsOnPaper={1} />
        </BridgeStage>
      </AbsoluteFill>
    );
  }
  const e = camInOut(clamp01((t - HANDOFF) / 2.2));
  const pose = moveFrom(BASE, { tiltDeg: 55 * e, dolly: 1 - 0.22 * e, orbitDeg: -18 * e, pan: [0, -60 * e] });
  const hs = BLOCKS.map((b, i) => b.hMax * easeOutCubic(clamp01((t - HANDOFF - 0.3 - i * 0.15) / 0.7)));
  return (
    <AbsoluteFill>
      <BridgeStage
        view={{ kind: '3d', pose }}
        backgroundColor={C.paper}
        three={
          <>
            <StudioEnv intensity={0.5} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[300, -900, 1200]} intensity={1.4} />
            {BLOCKS.map((b, i) =>
              hs[i] > 0.5 ? (
                <mesh key={i} position={[b.cx, -b.cy, hs[i] / 2]}>
                  <boxGeometry args={[b.s, b.s, hs[i]]} />
                  <meshStandardMaterial color={i === 2 ? C.accent : C.paperDeep} roughness={0.8} />
                </mesh>
              ) : null
            )}
          </>
        }
        overlay={BLOCKS.map((b, i) => {
          const h = hs[i];
          if (h < 40) return null;
          // 立方体正面（朝 −Y，即纸面「南」侧，镜头压下来后正对着它）
          const y = -(b.cy + b.s / 2) - 0.5;
          const corners: [V3, V3, V3, V3] = [
            [b.cx - b.s / 2, y, h], [b.cx + b.s / 2, y, h], [b.cx + b.s / 2, y, 0], [b.cx - b.s / 2, y, 0],
          ];
          return (
            <ProjectedHtml key={i} pose={pose} corners={corners} w={300} h={Math.round((300 * h) / b.s)}>
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 96px ${BLUEPRINT.fonts.mono}`, color: i === 2 ? '#fff' : C.text, opacity: clamp01((h - 40) / 40) }}>
                0{i + 1}
              </div>
            </ProjectedHtml>
          );
        })}
      >
        <Paper labelsOnPaper={1 - clamp01((t - HANDOFF - 0.3) / 0.4)} />
      </BridgeStage>
    </AbsoluteFill>
  );
};
