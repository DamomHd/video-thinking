/**
 * 工业级微倾雨丝手稿组件 (RainCanvas)
 * 严格遵循 LoomCare §7 手稿规范：
 * 纯数学确定性种子生成微倾斜数据雨丝，逐帧下落流动
 */

import React from 'react';
import { SketchCanvas } from '../SketchCanvas';
import { createRng } from '../../shared/anim';

export interface RainCanvasProps {
  width?: number;
  height?: number;
  time: number;
  ssaa?: number;
  rainColor?: string;
  count?: number;
  tiltAngleDeg?: number;
  speed?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const RainCanvas: React.FC<RainCanvasProps> = ({
  width = 1920,
  height = 1080,
  time,
  ssaa = 1,
  rainColor = 'rgba(255, 255, 255, 0.25)',
  count = 90,
  tiltAngleDeg = 15,
  speed = 500,
  className,
  style,
}) => {
  const tiltRad = (tiltAngleDeg * Math.PI) / 180;
  const dx = Math.sin(tiltRad);
  const dy = Math.cos(tiltRad);

  return (
    <SketchCanvas
      width={width}
      height={height}
      time={time}
      ssaa={ssaa}
      className={className}
      style={style}
      draw={(ctx, w, h) => {
        const rng = createRng(101);
        ctx.strokeStyle = rainColor;
        ctx.lineWidth = 1.0;

        for (let i = 0; i < count; i++) {
          const initX = rng() * w;
          const initY = rng() * h;
          const length = 20 + rng() * 40;
          const individualSpeed = speed * (0.8 + rng() * 0.4);

          // 纯函数计算当前时间下的循环位置
          const traveled = (time * individualSpeed + initY) % (h + 100);
          const curY = traveled - 50;
          const curX = (initX + (curY / h) * w * 0.2) % w;

          ctx.beginPath();
          ctx.moveTo(curX, curY);
          ctx.lineTo(curX + dx * length, curY + dy * length);
          ctx.stroke();
        }
      }}
    />
  );
};
