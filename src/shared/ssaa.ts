/**
 * 超采样抗锯齿 (SSAA)
 * 对标 architecture.html §9.4「三个开关缺一不可」中的第三个：
 *   ① LOOMCARE_SSAA / VW_SSAA=2 → remotion.config.ts 的 overrideFfmpegCommand（Node 侧）
 *   ② --scale=2                 → Remotion 按 4K 截帧
 *   ③ --props '{"ssaa":2}'      → 组件侧按超采样倍数处理画布（就是这里）
 * 三者缺一不可：少了 ③，Canvas 2D 的斜细线仍然是 1× 采样，缩回 1080p 后台阶照旧。
 */

import { getInputProps } from 'remotion';

export interface SsaaOptions {
  /** 调用点显式指定的倍数（优先级最高） */
  scale?: number;
}

/** 读渲染参数里的 ssaa（没有就是 1） */
export function inputSsaa(): number {
  try {
    const props = getInputProps() as { ssaa?: number | string } | undefined;
    const v = Number(props?.ssaa);
    return Number.isFinite(v) && v > 0 ? Math.max(1, Math.min(4, v)) : 1;
  } catch {
    // Studio 之外的环境（Node 脚本、测试）没有 input props
    return 1;
  }
}

/**
 * 当前画布应该用的超采样倍数 = max(调用点要求, 渲染参数 ssaa)。
 * 取 max 而不是覆盖：调用点声明的是「这块画布至少要几倍」（斜细线多的幕平时就要 2×），
 * 出片时 --props '{"ssaa":2}' 再把全片一起抬上去，两者都不会被对方吃掉。
 */
export function getSsaaScale(options?: SsaaOptions): number {
  const local = options?.scale !== undefined ? Math.max(1, Math.min(4, options.scale)) : 1;
  return Math.max(local, inputSsaa());
}

/**
 * 给 Canvas 2D 上下文套上超采样变换：
 * 之后所有绘图命令仍按 1× 逻辑像素写，内部物理像素是 K 倍。
 */
export function applySsaaTransform(ctx: CanvasRenderingContext2D, scale: number): void {
  if (scale <= 1) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
