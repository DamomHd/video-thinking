/**
 * 本地字体验收探针（内容中性）：FontProbe —— --props 传 { slugs, families }，每个字体写一行拉丁字母 + 数字标点，
 * 下面一行用系统字体对照；字体没加载上时两行一样。用完删掉 public/fonts 里的测试字体（public 会整份打进渲染包）。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { useLocalFonts } from '../components/fonts';

export const FontProbe: React.FC<{ slugs?: string[]; families?: string[] }> = ({ slugs = [], families = [] }) => {
  const ready = useLocalFonts(slugs);
  return (
    <AbsoluteFill style={{ background: '#F4F1EA', color: '#1A1A1A', padding: 80, gap: 36, display: 'flex', flexDirection: 'column' }}>
      <div style={{ font: '500 22px Menlo, monospace', color: '#888' }}>{ready ? 'ready' : 'loading'}</div>
      {families.map((f) => (
        <div key={f}>
          <div style={{ font: `600 72px "${f}", serif` }}>Aa Gg Qq 0123456789，。%</div>
          <div style={{ font: '600 72px serif', color: '#999' }}>Aa Gg Qq 0123456789，。%</div>
          <div style={{ font: '400 20px Menlo, monospace', color: '#888' }}>{f}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
