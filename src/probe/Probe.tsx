import React from 'react';
import { AbsoluteFill, continueRender, delayRender } from 'remotion';
import { ThreeCanvas } from '@remotion/three';

/**
 * GPU 探针 (对标 architecture.html §4)
 * 独立入口、1 帧、1600×400：把这台机器上 WebGPU / WebGL2 / ANGLE 的真实情况画出来，
 * 并用一个最小 R3F 场景验证 three 链路本身能不能出图。
 *
 * 跑法：npx remotion still src/probe/index.ts GpuProbe out/probe.png --gl=angle
 */

interface Caps {
  webgl2: boolean;
  webgpu: boolean;
  vendor: string;
  renderer: string;
  glVersion: string;
  maxTextureSize: number;
  maxSamples: number;
  angle: boolean;
}

function detect(): Caps {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl?.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'n/a';
  const vendor = dbg ? String(gl?.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : 'n/a';
  return {
    webgl2: Boolean(gl),
    webgpu: typeof (navigator as never as { gpu?: unknown }).gpu !== 'undefined',
    vendor,
    renderer,
    glVersion: gl ? String(gl.getParameter(gl.VERSION)) : 'n/a',
    maxTextureSize: gl ? Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) : 0,
    maxSamples: gl ? Number(gl.getParameter(gl.MAX_SAMPLES)) : 0,
    angle: /ANGLE/i.test(renderer),
  };
}

export const GpuProbe: React.FC = () => {
  const [caps, setCaps] = React.useState<Caps | null>(null);
  const [handle] = React.useState(() => delayRender('GpuProbe detect'));

  React.useEffect(() => {
    try {
      setCaps(detect());
    } catch (e) {
      setCaps({
        webgl2: false, webgpu: false, vendor: 'error',
        renderer: String(e), glVersion: 'n/a', maxTextureSize: 0, maxSamples: 0, angle: false,
      });
    }
    continueRender(handle);
  }, [handle]);

  const row = (k: string, v: string | number | boolean) => (
    <div key={k} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: '22px' }}>
      <span style={{ color: '#9AA7AC', width: 150 }}>{k}</span>
      <span style={{ color: typeof v === 'boolean' ? (v ? '#2DD4BF' : '#EF4444') : '#F3F4F6' }}>
        {String(v)}
      </span>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: '#0B0D12', flexDirection: 'row', fontFamily: 'monospace' }}>
      <div style={{ flex: 1, padding: '24px 28px' }}>
        <div style={{ color: '#FFB800', fontSize: 13, letterSpacing: '0.2em', marginBottom: 12 }}>
          GPU PROBE
        </div>
        {caps ? (
          <>
            {row('WebGL2', caps.webgl2)}
            {row('WebGPU', caps.webgpu)}
            {row('ANGLE', caps.angle)}
            {row('vendor', caps.vendor)}
            {row('renderer', caps.renderer.slice(0, 54))}
            {row('version', caps.glVersion.slice(0, 54))}
            {row('maxTexture', caps.maxTextureSize)}
            {row('maxSamples', caps.maxSamples)}
          </>
        ) : (
          <div style={{ color: '#9AA7AC' }}>detecting…</div>
        )}
      </div>

      {/* 右半边：最小 R3F 场景。这块是黑的就说明 three 链路本身没出图 */}
      <div style={{ width: 520, position: 'relative', borderLeft: '1px solid #262E3D' }}>
        <ThreeCanvas
          width={520}
          height={400}
          gl={{ antialias: false }}
          camera={{ fov: 50, position: [0, 0, 5] }}
        >
          <color attach="background" args={['#101620']} />
          <ambientLight intensity={1.2} />
          <mesh rotation={[0.5, 0.8, 0]}>
            <boxGeometry args={[2, 2, 2]} />
            <meshBasicMaterial color="#FFB800" wireframe />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.9, 24, 24]} />
            <meshBasicMaterial color="#2DD4BF" />
          </mesh>
        </ThreeCanvas>
        <div
          style={{
            position: 'absolute', bottom: 8, left: 12,
            color: '#6B7A80', fontSize: 11,
          }}
        >
          R3F / ThreeCanvas 自检：这里是黑的就说明 three 链路没出图
        </div>
      </div>
    </AbsoluteFill>
  );
};
