/**
 * 工业级微纳芯片拓扑手稿组件 (ChipCanvas)
 * 严格遵循 LoomCare §7 确定性手稿规范：
 * 绘制高精密晶圆电路走线、逻辑焊盘与流动光脉冲数据包
 */

import React from 'react';
import { SketchCanvas } from '../SketchCanvas';

export interface ChipCanvasProps {
  width?: number;
  height?: number;
  time: number;
  ssaa?: number;
  coreColor?: string;
  busColor?: string;
  pulseColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const ChipCanvas: React.FC<ChipCanvasProps> = ({
  width = 600,
  height = 600,
  time,
  ssaa = 2,
  coreColor = '#38BDF8',
  busColor = 'rgba(56, 189, 248, 0.35)',
  pulseColor = '#FFFFFF',
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
      glowBlurPx={18}
      glowAlpha={0.6}
      className={className}
      style={style}
      draw={(ctx, w, h) => {
        const cx = w / 2;
        const cy = h / 2;

        // 1. 中心芯片核心 (Die Package)
        const coreSize = 90;
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - coreSize / 2, cy - coreSize / 2, coreSize, coreSize);

        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
        ctx.fillRect(cx - coreSize / 2, cy - coreSize / 2, coreSize, coreSize);

        // 内部晶体网格微纹理
        ctx.lineWidth = 0.75;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        for (let i = -coreSize / 2 + 15; i < coreSize / 2; i += 15) {
          ctx.beginPath();
          ctx.moveTo(cx + i, cy - coreSize / 2);
          ctx.lineTo(cx + i, cy + coreSize / 2);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(cx - coreSize / 2, cy + i);
          ctx.lineTo(cx + coreSize / 2, cy + i);
          ctx.stroke();
        }

        // 2. 四向折线总线 (Buses)
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = busColor;

        const buses = [
          // 上部引出
          [-30, -coreSize / 2, -30, -coreSize / 2 - 40, -80, -coreSize / 2 - 120],
          [0, -coreSize / 2, 0, -coreSize / 2 - 60, 0, -coreSize / 2 - 140],
          [30, -coreSize / 2, 30, -coreSize / 2 - 40, 80, -coreSize / 2 - 120],
          // 下部引出
          [-30, coreSize / 2, -30, coreSize / 2 + 40, -80, coreSize / 2 + 120],
          [0, coreSize / 2, 0, coreSize / 2 + 60, 0, coreSize / 2 + 140],
          [30, coreSize / 2, 30, coreSize / 2 + 40, 80, coreSize / 2 + 120],
          // 左右引出
          [-coreSize / 2, -20, -coreSize / 2 - 50, -20, -coreSize / 2 - 120, -60],
          [-coreSize / 2, 20, -coreSize / 2 - 50, 20, -coreSize / 2 - 120, 60],
          [coreSize / 2, -20, coreSize / 2 + 50, -20, coreSize / 2 + 120, -60],
          [coreSize / 2, 20, coreSize / 2 + 50, 20, coreSize / 2 + 120, 60],
        ];

        buses.forEach(b => {
          ctx.beginPath();
          ctx.moveTo(cx + b[0], cy + b[1]);
          ctx.lineTo(cx + b[2], cy + b[3]);
          ctx.lineTo(cx + b[4], cy + b[5]);
          ctx.stroke();

          // 焊盘小圆点 (Pad)
          ctx.fillStyle = coreColor;
          ctx.beginPath();
          ctx.arc(cx + b[4], cy + b[5], 2.5, 0, Math.PI * 2);
          ctx.fill();
        });

        // 3. 沿总线流动的光脉冲粒子 (Traveling Packets)
        ctx.fillStyle = pulseColor;
        buses.forEach((b, idx) => {
          // 每个总线相位错开
          const packetPhase = ((time * 1.5 + idx * 0.3) % 1);
          let px = 0, py = 0;
          if (packetPhase < 0.5) {
            const p = packetPhase / 0.5;
            px = cx + b[0] + (b[2] - b[0]) * p;
            py = cy + b[1] + (b[3] - b[1]) * p;
          } else {
            const p = (packetPhase - 0.5) / 0.5;
            px = cx + b[2] + (b[4] - b[2]) * p;
            py = cy + b[3] + (b[5] - b[3]) * p;
          }

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }}
    />
  );
};
