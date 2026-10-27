/**
 * 工业级章节微胶囊 (ChapterTag)
 * 严格遵循 LoomCare UI 视觉规范：
 * 呈现高级电影质感的章节指示标牌、呼吸光斑与小字胶囊
 */

import React from 'react';
import { useFilmChrome } from '../FilmChrome';

export interface ChapterTagProps {
  number: string | number;
  label: string;
  theme?: 'dark' | 'light';
  accentColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ChapterTag: React.FC<ChapterTagProps> = ({
  number,
  label,
  theme = 'dark',
  accentColor = '#FFB800', // LoomCare 经典金色微光
  className,
  style,
}) => {
  // 预告片复用正片幕时外层会包 <FilmChrome value={false}>，这时正片的章节胶囊不出
  const { showChrome } = useFilmChrome();
  const isDark = theme === 'dark';
  const formattedNumber = typeof number === 'number' ? String(number).padStart(2, '0') : number;

  if (!showChrome) return null;

  const bg = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
  const border = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  const textColor = isDark ? '#FFFFFF' : '#111827';
  const subColor = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.45)';

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 9999,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        backdropFilter: 'blur(12px)',
        boxShadow: isDark
          ? '0 4px 20px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 4px 14px rgba(0, 0, 0, 0.06)',
        userSelect: 'none',
        ...style,
      }}
    >
      {/* 呼吸微光圆点 */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: accentColor,
          boxShadow: `0 0 8px ${accentColor}`,
        }}
      />

      {/* 章节序号 */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: 'monospace, -apple-system, sans-serif',
          color: accentColor,
          letterSpacing: '0.08em',
        }}
      >
        {formattedNumber}
      </span>

      <span style={{ color: subColor, fontSize: 10 }}>/</span>

      {/* 章节名称 */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: textColor,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  );
};
