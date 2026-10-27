/**
 * 手绘图元 (Rough.js)
 *
 * 线条带手绘抖动的矩形 / 椭圆 / 折线 / 路径 / 多边形，出成 SVG <path>：
 *   · 确定性：Rough.js 的随机由 seed 决定，同一 seed 每个标签页画出同一笔
 *   · 描画：progress 0→1 按笔划长度画出来（pathLength + dashoffset，不量 DOM）
 *   · 抖动（boil）：手绘动画里线条每隔几帧「重描一遍」的颤动感 ——
 *     按 boilFps 换 seed（seed + floor(t × boilFps)），boilFps=0 就是静止线条
 *
 * 风格全部走参数（roughness / bowing / 填充方式 / 颜色），不绑定任何一种画风。
 */

import React, { useMemo } from 'react';
import rough from 'roughjs';
import type { Options } from 'roughjs/bin/core';

export type RoughShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; cx: number; cy: number; w: number; h: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'linear'; points: [number, number][] }
  | { kind: 'polygon'; points: [number, number][] }
  | { kind: 'path'; d: string };

export interface RoughPathOut {
  d: string;
  stroke: string;
  strokeWidth: number;
  fill?: string;
}

const generator = rough.generator();

/** 纯函数：形状 + 选项 → SVG 路径（同一 seed 结果恒定） */
export function roughPaths(shape: RoughShape, options: Options): RoughPathOut[] {
  const g = generator;
  const d =
    shape.kind === 'rect' ? g.rectangle(shape.x, shape.y, shape.w, shape.h, options)
    : shape.kind === 'ellipse' ? g.ellipse(shape.cx, shape.cy, shape.w, shape.h, options)
    : shape.kind === 'line' ? g.line(shape.x1, shape.y1, shape.x2, shape.y2, options)
    : shape.kind === 'linear' ? g.linearPath(shape.points, options)
    : shape.kind === 'polygon' ? g.polygon(shape.points, options)
    : g.path(shape.d, options);
  return g.toPaths(d).map((p) => ({
    d: p.d,
    stroke: p.stroke,
    strokeWidth: p.strokeWidth,
    fill: p.fill && p.fill !== 'none' ? p.fill : undefined,
  }));
}

/** 抖动时刻的 seed：每 1/boilFps 秒换一次；boilFps ≤ 0 不抖 */
export function boilSeed(seed: number, t: number, boilFps: number): number {
  return boilFps > 0 ? seed + Math.floor(t * boilFps + 1e-9) : seed;
}

export interface RoughProps {
  shape: RoughShape;
  /** 影片时间（秒），用于 boil */
  t?: number;
  seed?: number;
  /** 0→1 描画进度；缺省 1（直接画完） */
  progress?: number;
  /** 手绘重描频率（次/秒），0 = 静止；常用 6–12 */
  boilFps?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  /** Rough.js 原生选项：roughness、bowing、fillStyle、hachureGap … */
  options?: Options;
  opacity?: number;
}

/** 放进一个 <svg> 里用；坐标就是 svg 的用户坐标 */
export const Rough: React.FC<RoughProps> = ({
  shape,
  t = 0,
  seed = 1,
  progress = 1,
  boilFps = 0,
  stroke = '#1A1A1A',
  strokeWidth = 2,
  fill,
  options,
  opacity = 1,
}) => {
  const s = boilSeed(seed, t, boilFps);
  const paths = useMemo(
    () => roughPaths(shape, { seed: s, stroke, strokeWidth, fill, ...options }),
    // shape 是字面量对象时每帧都是新引用：按内容比较
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(shape), s, stroke, strokeWidth, fill, JSON.stringify(options ?? {})]
  );
  const p = Math.max(0, Math.min(1, progress));
  if (p <= 0) return null;
  return (
    <g opacity={opacity}>
      {paths.map((path, i) =>
        path.fill ? (
          // 填充（实心 / 阴影线以外的面）跟着进度淡入，不做描画
          <path key={i} d={path.d} fill={path.fill} stroke="none" opacity={p} />
        ) : (
          <path
            key={i}
            d={path.d}
            fill="none"
            stroke={path.stroke}
            strokeWidth={path.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={p < 1 ? 1 : undefined}
            strokeDashoffset={p < 1 ? 1 - p : undefined}
          />
        )
      )}
    </g>
  );
};
