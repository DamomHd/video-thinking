/**
 * 工业级二次取景与镜头重构图容器 (Reframe)
 * 严格遵循 LoomCare §6.5 预告片与短片镜头复用规范：
 * 将原本的正片幕组件无损包装在 Reframe 视窗内，按预告片真实时间独立执行特写缩放 (Zoom) 与位移取景 (Pan)
 */

import React from 'react';
import { clamp01, camOut } from '../shared/anim';

export interface ReframeProps {
  width?: number;
  height?: number;
  /**
   * 缩放倍率 (例如 1.25 代表局部放大特写)
   */
  scale?: number;
  /**
   * 视口平移像素 (px)
   */
  panX?: number;
  panY?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Reframe: React.FC<ReframeProps> = ({
  width = 1920,
  height = 1080,
  scale = 1.0,
  panX = 0,
  panY = 0,
  children,
  className,
  style,
}) => {
  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          width,
          height,
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '50% 50%',
          transform: `translate3d(${-panX.toFixed(2)}px, ${-panY.toFixed(2)}px, 0px) scale3d(${scale.toFixed(4)}, ${scale.toFixed(4)}, 1)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
