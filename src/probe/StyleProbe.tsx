import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { Rough } from '../components/sketch';
import { VideoInsert } from '../components/VideoInsert';
import { draw } from '../shared/motion';

/**
 * 风格无关原语的验收探针（内容中性）
 *   左半：Rough 手绘图元 —— 描画进度 + 8fps 重描抖动（boil）+ 阴影线填充
 *   全画面：VideoInsert —— 1.0s 起 iris 软遮罩张开插入外部片段（测试彩条），4.0s 前 wipe 退出
 *
 * 片段经 --props '{"clip":"inserts/<片>/<标签>.mp4"}' 传入（public/ 下、vw insert add 规整过的）；不传就只验手绘部分。
 * 测试片段不常驻 public/：那里每次渲染都会整份进 bundle。
 */
export const StyleProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const clip = (getInputProps() as { clip?: string }).clip;
  return (
    <AbsoluteFill style={{ background: '#F4F2EE' }}>
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <Rough shape={{ kind: 'rect', x: 120, y: 140, w: 520, h: 300 }} t={t} seed={3} boilFps={8} progress={draw(t, 0.1, 0.8)} strokeWidth={3} />
        <Rough shape={{ kind: 'ellipse', cx: 380, cy: 700, w: 420, h: 260 }} t={t} seed={9} boilFps={8} progress={draw(t, 0.5, 0.8)} stroke="#2B5BD7" strokeWidth={3} />
        <Rough shape={{ kind: 'polygon', points: [[760, 160], [1000, 460], [700, 460]] }} t={t} seed={5} boilFps={8} fill="#FF5028" options={{ fillStyle: 'hachure', hachureGap: 10, roughness: 1.6 }} progress={draw(t, 0.8, 0.6)} />
        <Rough shape={{ kind: 'path', d: 'M 120 950 C 400 820, 700 1060, 1000 920' }} t={t} seed={11} boilFps={0} progress={draw(t, 1.0, 1.2)} strokeWidth={4} />
      </svg>
      {clip && <VideoInsert
        src={clip}
        at={1.0}
        durSec={3.0}
        transitionIn={{ kind: 'iris', durSec: 0.8, cx: 0.75, cy: 0.5, feather: 0.08 }}
        transitionOut={{ kind: 'wipe', durSec: 0.6, angleDeg: 0 }}
      />}
      <div style={{ position: 'absolute', right: 24, bottom: 20, font: '600 22px ui-monospace, monospace', color: '#FF5028' }}>
        StyleProbe t={t.toFixed(2)}s
      </div>
    </AbsoluteFill>
  );
};
