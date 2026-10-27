/**
 * 3 暗场一亮：纸面暗下去，金线底板画出、能力块亮起、光柱升起、顶上的光点点亮（第二高潮），两个标注先后落定；镜头缓慢绕转。
 * 只有金色的光，没有别的色相；标注钉在 3D 点上（每帧投影）。
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { AbsoluteFill } from 'remotion';
import { FilmCanvas, PoseCamera } from '../../../components/three/FilmCanvas';
import { FilmPost } from '../../../components/three/FilmPost';
import { projectPoint, Pose3D, V3 } from '../../../shared/bridge';
import { createRng, clamp01, easeInOutCubic } from '../../../shared/anim';
import { draw, drawLanding, stroke } from '../../../shared/motion';
import { PS } from '../theme';
import { K, BEATS, STAGE_LABELS } from './layout';

const C = PS.colors;
const F = PS.fonts;
const glow = (k: number) => new THREE.Color(C.gold).multiplyScalar(k);

/** 镜头：从斜上方缓慢绕转、略微推近 */
export function stagePose(t: number): Pose3D {
  const u = easeInOutCubic(clamp01((t - K.dim) / (K.out + 0.6 - K.dim)));
  const a = (52 - 14 * u) * (Math.PI / 180);
  const r = 10.6 - 0.9 * u;
  return { pos: [r * Math.cos(a), 7.6 - 0.5 * u, r * Math.sin(a)], look: [0, 0.4, 0], fov: 32 };
}

const BLOCKS: { at: V3; size: V3; lit?: boolean }[] = [
  { at: [-1.6, 0.12, -1.6], size: [1.4, 0.24, 1.4] },
  { at: [0, 0.18, -1.7], size: [1.2, 0.36, 1.1], lit: true },
  { at: [1.6, 0.1, -1.5], size: [1.3, 0.2, 1.5] },
  { at: [-1.7, 0.16, 0.1], size: [1.1, 0.32, 1.6] },
  { at: [1.7, 0.22, 0.1], size: [1.0, 0.44, 1.4], lit: true },
  { at: [-1.5, 0.1, 1.7], size: [1.5, 0.2, 1.1] },
  { at: [0.1, 0.14, 1.7], size: [1.2, 0.28, 1.2] },
  { at: [1.6, 0.12, 1.7], size: [1.3, 0.24, 1.2] },
];
const ORB_Y = 2.85;

const Box: React.FC<{ at: V3; size: V3; k: number }> = ({ at, size, k }) => {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(...size)), [size]);
  return (
    <lineSegments geometry={geo} position={at}>
      <lineBasicMaterial color={glow(k)} toneMapped={false} transparent opacity={k > 0 ? 1 : 0} />
    </lineSegments>
  );
};

const Dust: React.FC<{ t: number }> = ({ t }) => {
  const geo = useMemo(() => {
    const r = createRng(5);
    const g = new THREE.BufferGeometry();
    const a = new Float32Array(900 * 3);
    for (let i = 0; i < 900; i++) a.set([(r() - 0.5) * 14, r() * 6, (r() - 0.5) * 14], i * 3);
    g.setAttribute('position', new THREE.BufferAttribute(a, 3));
    return g;
  }, []);
  return (
    <points geometry={geo} position={[0, (t - K.dim) * 0.05, 0]}>
      <pointsMaterial color={glow(0.8)} size={0.025} sizeAttenuation transparent opacity={0.5} depthWrite={false} toneMapped={false} />
    </points>
  );
};

const Board: React.FC<{ t: number }> = ({ t }) => {
  const plateK = stroke(t, K.plate, 0.8);
  const plate = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(5.6, 0.06, 5.6)), []);
  const grid = useMemo(() => new THREE.GridHelper(5.6, 14, C.goldDim, C.goldDim), []);
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.35 * plateK;
  const beam = draw(t, K.ignite - 0.6, 0.6);
  const ig = draw(t, K.ignite, 0.15);
  const flash = ig * (1 - draw(t, K.ignite + 0.1, 1.2));
  const orbK = ig * (9 + 14 * flash);
  return (
    <>
      <color attach="background" args={[C.stage]} />
      <lineSegments geometry={plate} scale={[0.6 + 0.4 * plateK, 1, 0.6 + 0.4 * plateK]}>
        <lineBasicMaterial color={glow(1.6)} toneMapped={false} transparent opacity={plateK} />
      </lineSegments>
      <primitive object={grid} position={[0, 0.031, 0]} />
      {BLOCKS.map((b, i) => {
        const p = draw(t, K.blocks + i * 0.07, 0.4);
        return <Box key={i} at={[b.at[0], b.at[1] * p, b.at[2]]} size={b.size} k={p * (b.lit ? 1.3 + 1.9 * ig : 1.3)} />;
      })}
      {BLOCKS.filter((b) => b.lit).map((b, i) => (
        <mesh key={`f${i}`} position={[b.at[0], b.at[1] * 2 + 0.01, b.at[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[b.size[0] * 0.9, b.size[2] * 0.9]} />
          <meshBasicMaterial color={glow(1.2)} transparent opacity={0.35 * ig} toneMapped={false} />
        </mesh>
      ))}
      {[0.55, 0.85, 1.15].map((r, i) => {
        const p = draw(t, K.ignite + i * 0.12, 0.5);
        return (
          <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} scale={0.6 + 0.4 * p}>
            <ringGeometry args={[r, r + 0.015, 96]} />
            <meshBasicMaterial color={glow(2.4 - i * 0.6)} toneMapped={false} transparent opacity={p} />
          </mesh>
        );
      })}
      {beam > 0 && (
        <mesh position={[0, (ORB_Y * beam) / 2, 0]} scale={[1, Math.max(0.001, beam), 1]}>
          <cylinderGeometry args={[0.012, 0.012, ORB_Y, 8]} />
          <meshBasicMaterial color={glow(4)} toneMapped={false} />
        </mesh>
      )}
      {ig > 0 && (
        <mesh position={[0, ORB_Y, 0]} scale={0.6 + 0.4 * ig + 0.5 * flash}>
          <sphereGeometry args={[0.14, 32, 24]} />
          <meshBasicMaterial color={glow(orbK)} toneMapped={false} />
        </mesh>
      )}
      <pointLight position={[0, ORB_Y, 0]} color={C.gold} intensity={14 * ig + 30 * flash} distance={9} decay={1.5} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.04, 0]}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color={C.stage} roughness={0.5} metalness={0.4} />
      </mesh>
      <Dust t={t} />
    </>
  );
};

const LABELS: { at: V3; note: string; dx: number; dy: number }[] = [
  { at: [0, ORB_Y, 0], note: '一句话进来', dx: 150, dy: -40 },
  { at: [1.7, 0.45, 0.1], note: '识别到回访', dx: 190, dy: -30 },
];
export const Stage: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.dim || t > K.out + 0.7) return null;
  const on = draw(t, K.dim, 0.6) * (1 - draw(t, K.out, 0.6));
  const pose = stagePose(t);
  const flash = draw(t, K.ignite, 0.15) * (1 - draw(t, K.ignite + 0.1, 1.2));
  return (
    <AbsoluteFill style={{ background: C.stage, opacity: on }}>
      <FilmCanvas width={1920} height={1080} ssaa="super" background={C.stage} camera={{ near: 0.05, far: 200 }}>
        <PoseCamera pose={pose} />
        <Board t={t} />
        <FilmPost t={t} dof={{ focusDistance: 0.02, focalLength: 0.04, bokehScale: 2.2, target: [0, 0.4, 0], worldFocusRange: 6 }} bloom={{ intensity: 1.3 + 1.6 * flash, threshold: 0.7, smoothing: 0.25 }} vignette={{ offset: 0.2, darkness: 0.8 }} noise={{ opacity: 0.1 }} />
      </FilmCanvas>
      {LABELS.map((l, i) => {
        const p = drawLanding(t, BEATS.labels[i], 0.3);
        if (p <= 0) return null;
        const [x, y] = projectPoint(pose, l.at);
        const lx = x + l.dx;
        const ly = y + l.dy;
        const right = l.dx > 0;
        return (
          <React.Fragment key={i}>
            <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0, opacity: p }}>
              <polyline points={`${x},${y} ${x + l.dx * 0.55},${ly} ${lx},${ly}`} fill="none" stroke={C.goldDim} strokeWidth={1} />
            </svg>
            <div style={{ position: 'absolute', left: right ? lx + 10 : lx - 10, top: ly - 26, opacity: p, transform: `${right ? '' : 'translateX(-100%) '}translateY(${((1 - p) * 8).toFixed(2)}px)`, textAlign: right ? 'left' : 'right' }}>
              <div style={{ font: `600 20px ${F.text}`, color: C.gold }}>{STAGE_LABELS[i]}</div>
              <div style={{ font: `400 14px ${F.text}`, color: C.goldDim, marginTop: 4 }}>{l.note}</div>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
