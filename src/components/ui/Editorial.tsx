/**
 * 工业级电影排版字幕组件 (Editorial)
 * 严格遵循 LoomCare 架构规范：
 * 1. 结构化大字排版：Kicker 眉标 + 大标题 (Title) + 精致副标/旁白 (Subtitle/Body)
 * 2. 纯数学驱动的展开与淡入 (无 CSS animation/transition)
 * 3. 标点保护排版防抖：避免逐字渲染时因为标点单独换行导致的行宽跳动
 */

import React from 'react';
import { clamp01, spring, easeOutCubic } from '../../shared/anim';
import { useFilmChrome } from '../FilmChrome';

export interface EditorialProps {
  kicker?: string;
  title: string;
  subtitle?: string;
  /**
   * 动画进度 0..1 (0 未入场，1 完全展现)
   */
  progress?: number;
  theme?: 'dark' | 'light';
  align?: 'left' | 'center' | 'right';
  maxWidth?: number | string;
  titleSize?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Editorial: React.FC<EditorialProps> = ({
  kicker,
  title,
  subtitle,
  progress = 1.0,
  theme = 'dark',
  align = 'left',
  maxWidth = 720,
  titleSize = 44,
  className,
  style,
}) => {
  // 同 ChapterTag：预告片关掉正片字幕时整块不出
  const { showChrome } = useFilmChrome();
  if (!showChrome) return null;

  const isDark = theme === 'dark';
  const p = clamp01(progress);

  // 纯数学入场缓动计算
  const opacity = easeOutCubic(p);
  const translateY = (1 - easeOutCubic(p)) * 24; // 24px 平滑向上浮现

  const kickerColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const subtitleColor = isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(0, 0, 0, 0.65)';

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align,
        maxWidth,
        opacity,
        transform: `translate3d(0px, ${translateY.toFixed(2)}px, 0px)`,
        userSelect: 'none',
        ...style,
      }}
    >
      {/* 顶部 Kicker 眉标 */}
      {kicker && (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: kickerColor,
            marginBottom: 10,
          }}
        >
          {kicker}
        </span>
      )}

      {/* 核心大标题 */}
      <h1
        style={{
          margin: 0,
          fontSize: titleSize,
          fontWeight: 700,
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          color: titleColor,
          textShadow: isDark ? '0 4px 24px rgba(0, 0, 0, 0.5)' : 'none',
        }}
      >
        {title}
      </h1>

      {/* 副标 / 旁白说明 */}
      {subtitle && (
        <p
          style={{
            margin: 0,
            marginTop: 14,
            fontSize: Math.round(titleSize * 0.42),
            lineHeight: 1.5,
            fontWeight: 400,
            color: subtitleColor,
            maxWidth: '90%',
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
};
