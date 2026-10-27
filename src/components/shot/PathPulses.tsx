import React from 'react';
import { getLength, getPointAtLength } from '@remotion/paths';
import { pulses } from '../../shared/flow';

/**
 * 沿一条 SVG 路径循环跑的光点（参考片轨道上的黄色光点）。
 * 每个光点 = 一个亮核 + 身后几个渐小渐淡的拖尾点，读起来是「在跑」而不是「在闪」。
 * 放进和路径同一个坐标系的 <svg> 里用。
 */
export const PathPulses: React.FC<{
  d: string;
  t: number;
  color: string;
  count?: number;
  periodSec?: number;
  startSec?: number;
  radius?: number;
  /** 拖尾长度（px，沿路径） */
  tailPx?: number;
}> = ({ d, t, color, count = 3, periodSec = 4, startSec = 0, radius = 7, tailPx = 90 }) => {
  const len = React.useMemo(() => getLength(d), [d]);
  const TAIL = 6;
  return (
    <g>
      {pulses(t, { count, periodSec, startSec }).map((p, k) => {
        const head = p.u * len;
        return (
          <g key={k} opacity={p.alpha}>
            {Array.from({ length: TAIL }, (_, j) => {
              const s = head - (tailPx * j) / TAIL;
              if (s < 0) return null;
              const pt = getPointAtLength(d, s);
              if (!pt) return null;
              const f = 1 - j / TAIL;
              return <circle key={j} cx={pt.x} cy={pt.y} r={radius * (0.35 + 0.65 * f)} fill={color} opacity={0.15 + 0.6 * f * f} />;
            })}
            {(() => {
              const pt = getPointAtLength(d, head);
              if (!pt) return null;
              return <circle cx={pt.x} cy={pt.y} r={radius * 2.4} fill={color} opacity={0.18} />;
            })()}
          </g>
        );
      })}
    </g>
  );
};
