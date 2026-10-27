/**
 * 工业级磨砂玻璃卡片 (GlassCard)
 * 严格遵循 LoomCare §7 DOM 2.5D 规范：
 * 1. 物理弹簧卡片弹入 (cardIn 动画函数)
 * 2. 精致玻璃态高光质感 (Backdrop Filter + Rim Highlight)
 */

import React from 'react';
import { cardIn } from '../../shared/anim';

export interface GlassCardProps {
  progress?: number;
  theme?: 'dark' | 'light';
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  progress = 1.0,
  theme = 'dark',
  children,
  width,
  height,
  className,
  style,
}) => {
  const isDark = theme === 'dark';
  const anim = cardIn(progress);

  const bg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.75)';
  const border = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: 16,
        padding: 24,
        backgroundColor: bg,
        border: `1px solid ${border}`,
        boxShadow: isDark
          ? '0 16px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
          : '0 16px 40px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(20px)',
        opacity: anim.opacity,
        transform: `translate3d(0px, ${anim.translateY.toFixed(2)}px, 0px) scale(${anim.scale.toFixed(4)})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
