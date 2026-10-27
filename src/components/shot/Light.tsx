/**
 * 光影与质感（第 1 档：纯 DOM / SVG，不涉及 3D）
 *
 *   LightSweep  一道光带斜着扫过元素表面（卡片落定、数字落定时用）
 *   PaperLight  全画面纸面光照：一侧亮一侧暗的柔光 + 纸纤维纹理 + 细颗粒（颗粒按帧换种子，确定性）
 *   GlowText    落定那一下发一次光，再慢慢收住
 *
 * 全部是 t 的纯函数 + 静态 SVG 滤镜（feTurbulence 的 seed 固定），同一帧每次渲出来一样。
 * 颜色与强度都走参数，不绑定画风。
 */

import React from 'react';
import { clamp01, easeInOutCubic, createRng } from '../../shared/anim';

/** 光带扫过的进度 0..1（到位前后各留一点余量，光带完整地从一边进、另一边出） */
export function sweepAt(t: number, at: number, durSec = 0.7): number {
  return easeInOutCubic(clamp01((t - at) / Math.max(0.05, durSec)));
}

/**
 * 放在一个 position: relative / absolute、带 overflow: hidden 的容器里（卡片），铺满它。
 * angleDeg：光带方向；width：光带宽度（容器宽的比例）。
 */
export const LightSweep: React.FC<{
  t: number;
  at: number;
  durSec?: number;
  angleDeg?: number;
  width?: number;
  intensity?: number;
  color?: string;
}> = ({ t, at, durSec = 0.7, angleDeg = 115, width = 0.22, intensity = 0.55, color = '255, 255, 255' }) => {
  const p = sweepAt(t, at, durSec);
  if (p <= 0 || p >= 1) return null;
  const center = -0.3 + 1.6 * p;
  const a = (center - width / 2) * 100;
  const b = center * 100;
  const c = (center + width / 2) * 100;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: 'inherit',
        mixBlendMode: 'screen',
        background: `linear-gradient(${angleDeg}deg, rgba(${color},0) ${a.toFixed(2)}%, rgba(${color},${intensity}) ${b.toFixed(2)}%, rgba(${color},0) ${c.toFixed(2)}%)`,
      }}
    />
  );
};

/**
 * 全画面纸面光照（不随镜头动 —— 光源是「拍摄现场」的，不是纸上的）。
 * 放在 Stage **外面、作为它后面的同级元素**；不要放进 Stage 的 foreground：
 * 前景层是独立的层叠上下文，混合模式只和同一上下文里的内容混合，底下透明时 multiply 会盖成一片白。
 * light：亮部位置（画面归一化）；falloff：暗部压暗多少；grain：颗粒强度；fiber：纸纤维纹理强度。
 */
export const PaperLight: React.FC<{
  frame: number;
  width?: number;
  height?: number;
  light?: [number, number];
  falloff?: number;
  warm?: string;
  grain?: number;
  fiber?: number;
}> = ({ frame, width = 1920, height = 1080, light = [0.28, 0.18], falloff = 0.16, warm = '255, 236, 205', grain = 0.05, fiber = 0.06 }) => {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  // 颗粒：每帧换一个偏移（按帧号播种），看起来是活的胶片颗粒，但同一帧恒定
  const rng = createRng(frame * 7919 + 13);
  const gx = Math.floor(rng() * 200);
  const gy = Math.floor(rng() * 200);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* 光：亮部暖、远处压暗（multiply 压暗 + soft-light 提亮，两层分开才不发灰） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'multiply',
          background: `radial-gradient(ellipse 120% 110% at ${light[0] * 100}% ${light[1] * 100}%, rgba(255,255,255,1) 0%, rgba(255,255,255,1) 35%, rgba(${Math.round(255 * (1 - falloff))},${Math.round(250 * (1 - falloff))},${Math.round(242 * (1 - falloff))},1) 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'soft-light',
          background: `radial-gradient(ellipse 60% 55% at ${light[0] * 100}% ${light[1] * 100}%, rgba(${warm},0.55) 0%, rgba(${warm},0) 100%)`,
        }}
      />
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {/* 纸纤维：低频、拉长的湍流（seed 固定） */}
          <filter id={`fiber-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.004 0.035" numOctaves={3} seed={7} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          {/* 颗粒：高频湍流 */}
          <filter id={`grain-${id}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={3} />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
        {fiber > 0 && <rect width={width} height={height} filter={`url(#fiber-${id})`} opacity={fiber} style={{ mixBlendMode: 'multiply' }} />}
        {grain > 0 && (
          <rect x={-gx} y={-gy} width={width + 200} height={height + 200} filter={`url(#grain-${id})`} opacity={grain} style={{ mixBlendMode: 'overlay' }} />
        )}
      </svg>
    </div>
  );
};

/** 落定发光：land 那一刻最亮，前 0.15s 升起、后 holdSec 慢慢收 */
export function glowAt(t: number, land: number, holdSec = 1.2): number {
  if (t < land - 0.15) return 0;
  if (t < land) return clamp01((t - (land - 0.15)) / 0.15);
  return Math.exp(-(t - land) / Math.max(0.05, holdSec / 2.5));
}

export const GlowText: React.FC<{ t: number; land: number; color: string; radius?: number; holdSec?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  t,
  land,
  color,
  radius = 26,
  holdSec,
  children,
  style,
}) => {
  const g = glowAt(t, land, holdSec);
  return (
    <span style={{ textShadow: g > 0.01 ? `0 0 ${(radius * g).toFixed(1)}px ${color}, 0 0 ${(radius * 0.35 * g).toFixed(1)}px ${color}` : 'none', ...style }}>
      {children}
    </span>
  );
};
