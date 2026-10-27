import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { MathTex, MathMorph } from '../components/math';
import { GeoSegment, GeoCircle, GeoPoint, GeoAngle, GeoPolygon } from '../components/geo';
import { circleCircle, dist, Pt } from '../shared/geo';
import { draw, stroke } from '../shared/motion';

/**
 * 公式与几何板书验收探针（内容中性：教科书例题）
 *   左上：勾股定理逐符号聚焦出现（MathTex reveal=focus）
 *   左下：(a+b)² 展开一步的符号级变形（MathMorph）
 *   右侧：《几何原本》I.1 —— 以 AB 为半径各作一圆，交点 C 与 A、B 连成等边三角形
 */
const A: Pt = [1160, 720];
const B: Pt = [1520, 720];
const R = dist(A, B);
const C = circleCircle(A, R, B, R).sort((p, q) => p[1] - q[1])[0]; // 上方那个交点

export const MathProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: '#F6F4EF' }}>
      <div style={{ position: 'absolute', left: 120, top: 160 }}>
        <MathTex tex="a^2 + b^2 = c^2" fontSize={88} reveal="focus" progress={draw(t, 0.2, 1.4)} />
      </div>
      <div style={{ position: 'absolute', left: 120, top: 520 }}>
        <MathMorph from="(a+b)^2" to="a^2 + 2ab + b^2" p={stroke(t, 2.0, 1.4)} fontSize={80} />
      </div>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <GeoSegment a={A} b={B} progress={draw(t, 0.4, 0.6)} />
        <GeoCircle c={A} r={R} construction showCompass progress={stroke(t, 1.0, 1.2)} startAngle={0} />
        <GeoCircle c={B} r={R} construction showCompass progress={stroke(t, 1.6, 1.2)} startAngle={Math.PI} sweep={-2 * Math.PI} />
        <GeoPoint p={A} label="A" labelOffset={[-34, 34]} progress={draw(t, 0.3, 0.3)} />
        <GeoPoint p={B} label="B" labelOffset={[14, 34]} progress={draw(t, 0.5, 0.3)} />
        <GeoPoint p={C} label="C" labelOffset={[-10, -20]} progress={draw(t, 2.9, 0.3)} color="#FF5028" />
        <GeoPolygon pts={[A, B, C]} progress={stroke(t, 3.2, 1.0)} stroke="#FF5028" />
        <GeoAngle v={A} a={B} b={C} label="60°" progress={draw(t, 4.2, 0.4)} stroke="#FF5028" />
      </svg>
      <div style={{ position: 'absolute', right: 24, bottom: 20, font: '600 22px ui-monospace, monospace', color: '#FF5028' }}>
        MathProbe t={t.toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
