/**
 * 工业级拟真交互光标 (Cinema-grade Deterministic Cursor)
 * 严格遵循 LoomCare §7 交互规范：
 * 1. 速度感知动力学：高速平移时自动计算运动方向并施加轻微顺角倾斜 (Velocity Tilt) 与微挤压
 * 2. 拟真触觉反馈扩散环 (Click Ripple Ring)：点击瞬间伴随物理弹簧扩散和透明度衰减
 * 3. 逐帧纯数学驱动，零事件监听，确保渲染完全确定性
 */

import React from 'react';
import { clamp01, spring } from '../../shared/anim';

export interface CursorProps {
  x: number;
  y: number;
  /**
   * 上一帧或当前速度矢量（可选），用于计算动力学倾斜
   */
  vx?: number;
  vy?: number;
  /**
   * 点击进度 0..1 (0 代表未点击或已结束，0->1 代表点击波纹扩散全周期)
   */
  clickProgress?: number;
  /**
   * 光标指针颜色主题
   */
  color?: string;
  borderColor?: string;
  scale?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const Cursor: React.FC<CursorProps> = ({
  x,
  y,
  vx = 0,
  vy = 0,
  clickProgress = 0,
  color = '#000000',
  borderColor = '#FFFFFF',
  scale = 1.0,
  className,
  style,
}) => {
  // 1. 速度感知动力学计算 (Velocity-driven tilt)
  const speed = Math.sqrt(vx * vx + vy * vy);
  let tiltDeg = 0;
  if (speed > 5) {
    const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
    // 限制倾斜角在 -15deg 到 15deg 之间，营造微妙的惯性，不过分夸张
    tiltDeg = Math.max(-15, Math.min(15, (angle - 45) * 0.25));
  }

  // 2. 点击波纹计算 (Click Ripple Ring)
  const cp = clamp01(clickProgress);
  const rippleRadius = cp > 0 ? cp * 36 : 0;
  const rippleAlpha = cp > 0 ? (1 - cp) * 0.75 : 0;

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        transform: `translate3d(${x}px, ${y}px, 0px) scale(${scale})`,
        pointerEvents: 'none',
        zIndex: 9999,
        ...style,
      }}
    >
      {/* 点击扩散光环 (Click Ripple) */}
      {cp > 0 && (
        <div
          style={{
            position: 'absolute',
            top: -rippleRadius,
            left: -rippleRadius,
            width: rippleRadius * 2,
            height: rippleRadius * 2,
            borderRadius: '50%',
            border: `2px solid ${borderColor}`,
            opacity: rippleAlpha,
            boxShadow: `0 0 12px ${borderColor}`,
            transformOrigin: 'center center',
          }}
        />
      )}

      {/* 拟真 macOS 矢量光标指针 */}
      <div
        style={{
          transform: `rotate(${tiltDeg}deg)`,
          transformOrigin: '0 0',
          filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.35))',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 3L10.5 21L13.8 13.8L21 10.5L3 3Z"
            fill={color}
            stroke={borderColor}
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};
