/**
 * 几何板书图元（放进 <svg> 里用）
 *
 * 每个图元都有 progress（0→1）：线段从起点画到终点、圆从起始角转一圈（像圆规）、点「落下」、标注淡入。
 * 作图顺序用 shared/motion 的 stagger / draw 排；几何（交点等）用 shared/geo 算 —— 图元只负责画。
 * 样式全部是参数：作图辅助线（construction）缺省细、浅、虚线，结论线粗、实 —— 板书里两种线一眼分得开。
 */

import React from 'react';
import { Pt, arcPath, extendSegment, angleMarkPath, rightAnglePath, polar } from '../../shared/geo';

export interface GeoStyle {
  stroke?: string;
  strokeWidth?: number;
  /** 作图辅助线：细、浅、虚线 */
  construction?: boolean;
  opacity?: number;
}

const strokeProps = (st: GeoStyle, progress: number) => {
  const p = Math.max(0, Math.min(1, progress));
  const construction = st.construction ?? false;
  return {
    fill: 'none',
    stroke: st.stroke ?? (construction ? '#8A8F98' : '#1A1A1A'),
    strokeWidth: st.strokeWidth ?? (construction ? 1.5 : 3),
    strokeLinecap: 'round' as const,
    opacity: st.opacity ?? (construction ? 0.8 : 1),
    // 虚线和描画都要用 dasharray：辅助线用 mask 式写法 —— 先按进度裁长度，再在外层叠虚线
    pathLength: 1,
    strokeDasharray: p < 1 ? '1' : undefined,
    strokeDashoffset: p < 1 ? 1 - p : undefined,
  };
};

/** 辅助线的虚线效果：按进度画出的实线再用一层虚线遮罩挖空 */
const DashMask: React.FC<{ id: string; d: string; width: number }> = ({ id, d, width }) => (
  <mask id={id} maskUnits="userSpaceOnUse">
    <path d={d} fill="none" stroke="#fff" strokeWidth={width + 4} strokeDasharray="10 7" strokeLinecap="butt" />
  </mask>
);

// React 的 useId 在同一棵树里稳定、并发标签页一致；去掉冒号，url(#…) 里不用转义
const useMaskId = () => `geo-dash-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;

export const GeoSegment: React.FC<{ a: Pt; b: Pt; progress?: number; extend?: number } & GeoStyle> = ({ a, b, progress = 1, extend = 0, ...st }) => {
  const [p0, p1] = extend > 0 ? extendSegment(a, b, extend) : [a, b];
  const d = `M ${p0[0]} ${p0[1]} L ${p1[0]} ${p1[1]}`;
  const id = useMaskId();
  if (progress <= 0) return null;
  return (
    <g>
      {st.construction && <DashMask id={id} d={d} width={st.strokeWidth ?? 1.5} />}
      <path d={d} {...strokeProps(st, progress)} mask={st.construction ? `url(#${id})` : undefined} />
    </g>
  );
};

/** 圆 / 圆弧：像圆规一样从 startAngle 转出来；showCompass 时画出圆心到笔尖的半径线 */
export const GeoCircle: React.FC<
  { c: Pt; r: number; progress?: number; startAngle?: number; sweep?: number; showCompass?: boolean } & GeoStyle
> = ({ c, r, progress = 1, startAngle = -Math.PI / 2, sweep = 2 * Math.PI, showCompass = false, ...st }) => {
  const p = Math.max(0, Math.min(1, progress));
  const id = useMaskId();
  if (p <= 0) return null;
  const d = arcPath(c, r, startAngle, startAngle + sweep * p);
  const tip = polar(c, r, startAngle + sweep * p);
  return (
    <g>
      {st.construction && <DashMask id={id} d={d} width={st.strokeWidth ?? 1.5} />}
      {/* 进度已经体现在弧长里，这里不再用 dash 裁 */}
      <path d={d} {...strokeProps(st, 1)} mask={st.construction ? `url(#${id})` : undefined} />
      {showCompass && p < 1 && (
        <line x1={c[0]} y1={c[1]} x2={tip[0]} y2={tip[1]} stroke={st.stroke ?? '#8A8F98'} strokeWidth={1} opacity={0.6} />
      )}
    </g>
  );
};

/** 点：从放大淡入「落」到位，带可选标签 */
export const GeoPoint: React.FC<{
  p: Pt;
  progress?: number;
  label?: string;
  labelOffset?: Pt;
  r?: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
}> = ({ p, progress = 1, label, labelOffset = [12, -12], r = 5, color = '#1A1A1A', fontSize = 28, fontFamily = 'Georgia, "Times New Roman", serif' }) => {
  const q = Math.max(0, Math.min(1, progress));
  if (q <= 0) return null;
  const s = 1 + (1 - q) * 1.5;
  return (
    <g opacity={q}>
      <circle cx={p[0]} cy={p[1]} r={r * s} fill={color} />
      {label && (
        <text x={p[0] + labelOffset[0]} y={p[1] + labelOffset[1]} fill={color} fontSize={fontSize} fontStyle="italic" fontFamily={fontFamily}>
          {label}
        </text>
      )}
    </g>
  );
};

/** 角标记：小弧（或直角方块）+ 可选标签 */
export const GeoAngle: React.FC<
  { v: Pt; a: Pt; b: Pt; r?: number; progress?: number; right?: boolean; label?: string; fontSize?: number } & GeoStyle
> = ({ v, a, b, r = 28, progress = 1, right = false, label, fontSize = 24, ...st }) => {
  if (progress <= 0) return null;
  const d = right ? rightAnglePath(v, a, b, r * 0.6) : angleMarkPath(v, a, b, r);
  const ma = (Math.atan2(a[1] - v[1], a[0] - v[0]) + Math.atan2(b[1] - v[1], b[0] - v[0])) / 2;
  const lp = polar(v, r + fontSize * 0.9, ma);
  return (
    <g>
      <path d={d} {...strokeProps({ strokeWidth: 2, ...st }, progress)} />
      {label && progress >= 1 && (
        <text x={lp[0]} y={lp[1]} fill={st.stroke ?? '#1A1A1A'} fontSize={fontSize} textAnchor="middle" dominantBaseline="middle" fontStyle="italic" fontFamily="Georgia, serif">
          {label}
        </text>
      )}
    </g>
  );
};

/** 多边形面（结论区域）：描边按进度画，填充在描完后淡入 */
export const GeoPolygon: React.FC<{ pts: Pt[]; progress?: number; fill?: string; fillOpacity?: number } & GeoStyle> = ({
  pts,
  progress = 1,
  fill = '#FF5028',
  fillOpacity = 0.15,
  ...st
}) => {
  if (progress <= 0 || pts.length < 2) return null;
  const d = `M ${pts.map((p) => `${p[0]} ${p[1]}`).join(' L ')} Z`;
  const fillP = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
  return (
    <g>
      <path d={d} fill={fill} opacity={fillOpacity * fillP} stroke="none" />
      <path d={d} {...strokeProps(st, Math.min(1, progress / 0.7))} />
    </g>
  );
};
