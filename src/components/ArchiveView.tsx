/**
 * 封存版本的播放与对比（architecture.html §4「备份（只读对比）」的出口）
 *
 * 封存件是成片 mp4，用 OffthreadVideo 逐帧取（不是 <Video>：后者在渲染时按播放器时钟取帧，不保证帧准）。
 * 对比合成里旧版是封存的 mp4，新版是当前代码现渲 —— 两边同一个帧号，差异一眼可见。
 */

import React from 'react';
import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

export const ArchivePlayer: React.FC<{ file: string; muted?: boolean }> = ({ file, muted = false }) => (
  <AbsoluteFill style={{ background: '#000' }}>
    <OffthreadVideo src={staticFile(file)} muted={muted} style={{ width: '100%', height: '100%' }} />
  </AbsoluteFill>
);

const Tag: React.FC<{ text: string; side: 'left' | 'right' }> = ({ text, side }) => (
  <div
    style={{
      position: 'absolute',
      top: 24,
      [side]: 24,
      padding: '6px 14px',
      borderRadius: 6,
      background: 'rgba(0,0,0,0.72)',
      zIndex: 3,
      color: '#fff',
      font: '600 22px/1.2 system-ui, sans-serif',
      letterSpacing: 0.5,
    }}
  >
    {text}
  </div>
);

/**
 * 左旧右新。mode：
 *   'split'（缺省）两边各缩到一半并排，看整体；
 *   'wipe' 全尺寸叠放，竖线左边是旧版、右边是新版，线位置随帧往返扫，看像素级差异。
 */
export const ArchiveCompare: React.FC<{
  file: string;
  label: string;
  current: React.ReactNode;
  mode?: 'split' | 'wipe';
}> = ({ file, label, current, mode = 'split' }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  if (mode === 'wipe') {
    // 8 秒一个来回，线停在两端各 1 秒
    const u = (frame / fps / 8) % 1;
    const tri = u < 0.5 ? u * 2 : 2 - u * 2;
    const x = Math.round(width * (0.08 + 0.84 * Math.min(1, Math.max(0, (tri - 0.125) / 0.75))));
    return (
      <AbsoluteFill style={{ background: '#000' }}>
        {/* 两层各自隔离层叠上下文：片子内部带 z-index 的层不能跑到封存层上面 */}
        <AbsoluteFill style={{ isolation: 'isolate', zIndex: 0 }}>{current}</AbsoluteFill>
        <AbsoluteFill style={{ clipPath: `inset(0 ${width - x}px 0 0)`, isolation: 'isolate', zIndex: 1 }}>
          <OffthreadVideo src={staticFile(file)} muted style={{ width: '100%', height: '100%' }} />
        </AbsoluteFill>
        <div style={{ position: 'absolute', left: x - 1, top: 0, width: 2, height, background: '#FF5028', zIndex: 2 }} />
        <Tag text={`封存 ${label}`} side="left" />
        <Tag text="当前" side="right" />
      </AbsoluteFill>
    );
  }

  const half: React.CSSProperties = {
    position: 'absolute',
    top: height / 4,
    width,
    height,
    transform: 'scale(0.5)',
    transformOrigin: '0 0',
    overflow: 'hidden',
  };
  return (
    <AbsoluteFill style={{ background: '#16181B' }}>
      <div style={{ ...half, left: 0, isolation: 'isolate' }}>
        <OffthreadVideo src={staticFile(file)} muted style={{ width: '100%', height: '100%' }} />
      </div>
      <div style={{ ...half, left: width / 2, isolation: 'isolate' }}>{current}</div>
      <Tag text={`封存 ${label}`} side="left" />
      <Tag text="当前" side="right" />
    </AbsoluteFill>
  );
};
