/**
 * 数据叙事画布：一张 1920×1080 的 Canvas 2D，每帧把 2D 上下文交给 draw(g) 重画一遍。
 * 配合收录的 opuscar-dataviz 引擎（src/vendor/opuscar-dataviz/engine.js）用：纸、相机、铅笔、手写、数据点都在那里。
 * 画之前等字体就绪（canvas 上的字不会自己等 web font），用渲染锁挡住第一帧。
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import { beginCanvasTexts } from '../canvasTexts';

export const DataCanvas: React.FC<{
  /** 每帧调用一次；g 已经清空，变换为单位矩阵 */
  draw: (g: CanvasRenderingContext2D) => void;
  /** 要等的字体（CSS font 简写，如 '500 30px "Long Cang"'） */
  fonts?: string[];
  width?: number;
  height?: number;
}> = ({ draw, fonts = [], width = 1920, height = 1080 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender('DataCanvas 字体'));
  const [ready, setReady] = useState(false);
  const key = fonts.join('|');
  useLayoutEffect(() => {
    let alive = true;
    Promise.all(fonts.map((f) => document.fonts.load(f))).finally(() => {
      if (!alive) return;
      setReady(true);
      continueRender(handle);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(() => {
    const g = ref.current?.getContext('2d');
    if (!g || !ready) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, width, height);
    beginCanvasTexts(); // 画字的地方用 registerCanvasText 登记，读字检查才查得到
    draw(g);
  });
  return <canvas ref={ref} width={width} height={height} style={{ position: 'absolute', left: 0, top: 0, width, height }} />;
};
