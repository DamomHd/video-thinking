/**
 * 笔刷手绘画面（ClaudeAnimationBase：p5.js + p5.brush）的 Remotion 组件
 *
 *   <PaintCanvas t={秒} project={{ duration: 12, bpm: 117 }} draw={(t) => { const { paint, clawd, … } = cab(); … }} />
 *   <PaintCanvas t={秒} project={…} scenes={['vendor/claude-animation-base/src/scenes/demo.js']} />   上游写法的镜头脚本
 *   <PaintCanvas t={秒} project={…} loop="emotions" />                                                上游的 LOOPS（设定图）
 *
 * 三种来源任选一种：draw（TS 绘制函数，推荐，片子代码放在 src/films 里）、scenes（上游 shots([...]) 脚本，路径相对 public/）、loop。
 * 画面是 t 的纯函数：上游引擎本来就按「帧可乱序、可并发」设计（boil 由时间换种子，见指南「Frames are pure functions of time」）。
 *
 * 每一帧都是异步画完的（p5.brush 先把笔触攒在遮罩层，redraw 结束才合成），所以每次 t 变化都挂一把渲染锁，
 * 画完、拷到本组件的画布上才放行。同一渲染页只有一份引擎和一张 p5 画布，多个 PaintCanvas 的绘制排队进行。
 * 画布固定 1920×1080（上游写死），用 style 缩放。
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { continueRender, delayRender, cancelRender } from 'remotion';
import { loadEngine, loadScene, PaintProject } from './load';

export interface PaintCanvasProps {
  /** 画面时间（秒）：传给上游的 T，boil、pulse、表情都按它算 */
  t: number;
  project: PaintProject;
  draw?: (t: number) => void;
  scenes?: string[];
  loop?: string;
  style?: React.CSSProperties;
}

/** 所有绘制排成一队：p5 全局模式只有一张画布，两次 redraw 交错会画坏 */
let queue: Promise<unknown> = Promise.resolve();

/** 本文件唯一的一对渲染锁：job 完成才放行，出错直接中止渲染 */
function hold(label: string, job: () => Promise<void>) {
  const handle = delayRender(label);
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  run.then(() => continueRender(handle), (e) => cancelRender(e));
}

export const PaintCanvas: React.FC<PaintCanvasProps> = ({ t, project, draw, scenes, loop, style }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const sceneKey = (scenes ?? []).join('|');
  const props = useRef({ t, draw, loop });
  props.current = { t, draw, loop };

  /** 画当前 props 的这一帧，拷到本组件的画布上 */
  const paintNow = async () => {
    const api = await loadEngine(project);
    const { t: tt, draw: d, loop: l } = props.current;
    const w = window as unknown as { LOOP: unknown };
    if (d) w.LOOP = d;
    else if (l) {
      if (!api.LOOPS[l]) throw new Error(`没有这个 loop：${l}（有：${Object.keys(api.LOOPS).join(', ')}）`);
      w.LOOP = api.LOOPS[l];
    } else w.LOOP = null;
    const out: HTMLCanvasElement = await api.render(tt);
    const cv = ref.current;
    if (!cv) return;
    const c = cv.getContext('2d')!;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(out, 0, 0, cv.width, cv.height);
  };

  // 首帧：加载引擎和镜头脚本，并在同一把锁里画好当前帧（免得两把锁之间有空隙被截图）
  useEffect(() => {
    let alive = true;
    hold('ClaudeAnimationBase 引擎', async () => {
      await loadEngine(project);
      for (const s of scenes ?? []) await loadScene(s);
      await paintNow();
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
    // project 只在首次加载时生效（见 load.ts），这里不跟着它重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneKey]);

  // 之后每次 t / 绘制来源变化
  const first = useRef(true);
  useLayoutEffect(() => {
    if (!ready) return;
    if (first.current) {
      first.current = false;
      return;
    }
    hold(`笔刷画面 t=${t.toFixed(3)}`, paintNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, t, draw, loop]);

  return <canvas ref={ref} width={1920} height={1080} style={{ width: '100%', height: '100%', display: 'block', ...style }} />;
};
