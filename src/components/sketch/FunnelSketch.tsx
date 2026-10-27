/**
 * 工业级数据漏斗流向手稿组件 (FunnelSketch)
 * 严格遵循 LoomCare §7 手稿规范：
 * 绘制上方宽口汇聚、下方收敛提炼的双曲线漏斗光锥与连续粒子流
 */

import React from 'react';
import { SketchCanvas } from '../SketchCanvas';

export interface FunnelSketchProps {
  width?: number;
  height?: number;
  time: number;
  ssaa?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const FunnelSketch: React.FC<FunnelSketchProps> = ({
  width = 500,
  height = 500,
  time,
  ssaa = 2,
  color = '#A855F7',
  className,
  style,
}) => {
  return (
    <SketchCanvas
      width={width}
      height={height}
      time={time}
      ssaa={ssaa}
      enableGlow={true}
      glowBlurPx={20}
      glowAlpha={0.65}
      className={className}
      style={style}
      draw={(ctx, w, h) => {
        const cx = w / 2;
        const cy = h / 2;

        // 1. 漏斗双曲轮廓光锥
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;

        // 顶部宽口椭圆
        ctx.beginPath();
        ctx.ellipse(cx, cy - 140, 160, 30, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 底部窄口椭圆
        ctx.beginPath();
        ctx.ellipse(cx, cy + 120, 35, 10, 0, 0, Math.PI * 2);
        ctx.stroke();

        // 两侧双曲收束线
        ctx.beginPath();
        ctx.moveTo(cx - 160, cy - 140);
        ctx.bezierCurveTo(cx - 120, cy - 20, cx - 60, cy + 60, cx - 35, cy + 120);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx + 160, cy - 140);
        ctx.bezierCurveTo(cx + 120, cy - 20, cx + 60, cy + 60, cx + 35, cy + 120);
        ctx.stroke();

        // 2. 纵向汇聚粒子流
        const particleCount = 36;
        for (let i = 0; i < particleCount; i++) {
          const progress = ((time * 0.8 + i / particleCount) % 1);
          const y = (cy - 140) + progress * 260;

          // 根据高度计算水平收敛半宽
          const tNorm = progress;
          const currentWidth = 160 * (1 - tNorm * 0.8);

          // 粒子横向分布
          const angle = (i * 137.5 * Math.PI) / 180;
          const x = cx + Math.cos(angle) * currentWidth * (0.3 + 0.7 * (1 - tNorm));

          const alpha = Math.sin(progress * Math.PI);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
          ctx.beginPath();
          ctx.arc(x, y, 2.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }}
    />
  );
};
