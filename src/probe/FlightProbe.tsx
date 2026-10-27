import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { FilmCanvas, FlightCamera, StudioEnv, FilmPost } from '../components/three';
import { PROBE_FLIGHT } from './flightPlan';

/**
 * 3D 漫游验收探针（内容中性：立柱阵列 + 地面网格，没有任何片的内容）
 * 看四件事：匀速穿行、到停留点前减速、过弯侧倾、视线朝前。
 */
const PILLARS: [number, number][] = [];
for (let x = -30; x <= 30; x += 10) for (let z = -50; z <= 50; z += 10) if ((x + z) % 20 === 0) PILLARS.push([x, z]);

export const FLIGHT_PROBE_SEC = Math.ceil(PROBE_FLIGHT.totalSec + 0.8);

export const FlightProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: '#E9E6DF' }}>
      <FilmCanvas width={width} height={height} background="#E9E6DF" camera={{ near: 0.1, far: 500 }}>
        <FlightCamera plan={PROBE_FLIGHT} t={t} />
        <StudioEnv intensity={0.6} />
        <hemisphereLight args={['#ffffff', '#b8b2a6', 0.9]} />
        <directionalLight position={[20, 40, 10]} intensity={1.4} />
        <gridHelper args={[200, 40, '#9a9488', '#c9c3b8']} />
        {PILLARS.map(([x, z], i) => (
          <mesh key={i} position={[x, 4, z]}>
            <boxGeometry args={[2, 8, 2]} />
            <meshStandardMaterial color={i % 5 === 0 ? '#FF5028' : '#D8D2C6'} roughness={0.6} />
          </mesh>
        ))}
        {/* --props '{"noPost":true}' 关掉后期链，用来区分问题出在光照还是后期 */}
        {!(getInputProps() as { noPost?: boolean }).noPost && <FilmPost t={t} dof={false} bloom={false} noise={{ opacity: 0.08 }} vignette={{ offset: 0.3, darkness: 0.4 }} {...((getInputProps() as { post?: object }).post ?? {})} />}
      </FilmCanvas>
      <div style={{ position: 'absolute', left: 24, bottom: 20, font: '600 22px ui-monospace, monospace', color: '#FF5028' }}>
        FlightProbe t={t.toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
