/**
 * 工业级确定性 Canvas 2D 手稿画板 (Deterministic SketchCanvas)
 * 严格遵循 LoomCare 架构第 7 节视觉四层规范：
 * 1. 逐帧确定性绘制，严禁 requestAnimationFrame 与非种子随机
 * 2. K 倍 SSAA 超采样内部物理分辨率，CSS 尺寸保持逻辑像素，消除微小线条的阶梯状锯齿
 * 3. 内置离屏高斯漫反射发光算子 (1/4 模糊后 lighter 叠回)
 */

import React, { useEffect, useRef } from 'react';
import { getSsaaScale, applySsaaTransform } from '../shared/ssaa';
import { renderWithGlow } from '../shared/sketch';

export interface SketchCanvasProps {
  width: number;
  height: number;
  /**
   * 触发重绘的帧或时间标记（纯函数确定性驱动）
   */
  time?: number;
  frame?: number;
  /**
   * SSAA 超采样倍率（默认自动检测，推荐 2）
   */
  ssaa?: number;
  /**
   * 核心逐帧绘制回调：坐标系已由 SSAA 矩阵归一化为逻辑像素 (0..width, 0..height)
   */
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number, ssaa: number) => void;
  /**
   * 是否开启柔和漫反射发光
   */
  enableGlow?: boolean;
  glowBlurPx?: number;
  glowAlpha?: number;
  className?: string;
  style?: React.CSSProperties;
}

export const SketchCanvas: React.FC<SketchCanvasProps> = ({
  width,
  height,
  time,
  frame,
  ssaa,
  draw,
  enableGlow = false,
  glowBlurPx = 20,
  glowAlpha = 0.5,
  className,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ssaaFactor = getSsaaScale({ scale: ssaa });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画板并重置变换矩阵
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 应用 SSAA 超采样变换，使后续绘图命令可以直接使用 1x 逻辑像素坐标
    applySsaaTransform(ctx, ssaaFactor);

    if (enableGlow) {
      renderWithGlow(
        ctx,
        width,
        height,
        (currentCtx) => {
          draw(currentCtx, width, height, ssaaFactor);
        },
        glowBlurPx,
        glowAlpha
      );
    } else {
      draw(ctx, width, height, ssaaFactor);
    }
  }, [time, frame, width, height, ssaaFactor, draw, enableGlow, glowBlurPx, glowAlpha]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={Math.round(width * ssaaFactor)}
      height={Math.round(height * ssaaFactor)}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
};
