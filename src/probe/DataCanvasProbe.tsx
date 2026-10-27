/**
 * 探针：DataCanvas + 收录的 dataviz 引擎（内容中性）。
 * 一条正弦样本：铅笔画轴、点逐个落、一段手写式批注（拉丁字，不依赖片子的字体）、红蓝铅笔。验收看图 + 同一帧渲两次逐字节一致。
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import * as E from '../vendor/opuscar-dataviz/engine.js';
import { DataCanvas } from '../components/dataviz';

const N = 16;
const pt = (i: number): [number, number] => [-600 + i * 80, 60 - Math.sin(i / 2.2) * 180];

export const DataCanvasProbe: React.FC = () => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  return (
    <AbsoluteFill>
      <DataCanvas
        draw={(g) => {
          const cam = { x: 0, y: 0, zoom: 1 + t * 0.05, roll: 0 };
          E.drawPaper(g, cam);
          E.applyCam(g, cam);
          E.pencilStroke(g, [[-640, 260], [640, 260]], { progress: Math.min(1, t / 0.8), width: 1.6 });
          const pts = Array.from({ length: N }, (_, i) => pt(i));
          const landed = Math.max(0, Math.min(N, Math.floor((t - 0.8) / 0.15)));
          E.inkLine(g, pts.slice(0, landed), { width: 2 });
          pts.slice(0, landed).forEach((p, i) => E.dataDot(g, p[0], p[1], 6, E.valueColor(Math.sin(i / 2.2), { center: 0, half: 1 }), { fresh: t - 0.8 - i * 0.15 }));
          E.pencilStroke(g, E.ringPath(pts[3][0], pts[3][1], 16, 2), { color: E.P.blue, progress: Math.min(1, Math.max(0, (t - 3.4) / 0.4)) });
          const r = E.handText(g, 'sample note', pts[3][0] + 30, pts[3][1] - 40, { size: 30, color: E.P.blue, progress: Math.min(1, Math.max(0, (t - 3.6) / 0.8)), font: 'cursive' });
          const tip = landed < N ? pts[Math.min(N - 1, landed)] : r.tip;
          E.drawPencil(g, { tip: E.w2s(cam, tip[0], tip[1]), s: 0.7, lift: 0.3, ang: 1.0 });
        }}
      />
    </AbsoluteFill>
  );
};
