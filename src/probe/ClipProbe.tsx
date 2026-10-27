import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ClipCanvas } from '../components/clip';
import type { ClipGrammar, ClipSpec } from '../shared/clip';
import t1 from './clip-specs/t1_3b1b.json';
import t2 from './clip-specs/t2_keynote_ui.json';
import t3 from './clip-specs/t3_finance_chart.json';
import y1 from './clip-specs/y1_kurzgesagt.json';
import y2 from './clip-specs/y2_vox.json';
import y3 from './clip-specs/y3_whiteboard.json';
import y5 from './clip-specs/y5_kinetic_type.json';

/**
 * huashu-clip 画法验收探针：每个画法用上游模板自带的示例数据渲一遍（2026-10-26 从 huashu-motion 模板的 index.html 取出，占位变量按上游规则填了默认值）。
 * 示例数据是上游的演示内容，不是哪部片的素材。发布会卡片 / 拼贴论证要的截图换成了内容中性的示意图（data: 地址嵌在数据里，不进 public/）。
 */
export const CLIP_PROBE_SPECS: Partial<Record<ClipGrammar, ClipSpec>> = {
  t1_3b1b: t1 as ClipSpec,
  t2_keynote_ui: t2 as ClipSpec,
  t3_finance_chart: t3 as ClipSpec,
  y1_kurzgesagt: y1 as ClipSpec,
  y2_vox: y2 as ClipSpec,
  y3_whiteboard: y3 as ClipSpec,
  y5_kinetic_type: y5 as ClipSpec,
};

export const clipProbeFrames = (g: ClipGrammar) => {
  const s = CLIP_PROBE_SPECS[g]!;
  return Math.round(s.duration * (s.pace ?? 1) * 30);
};

export const ClipProbe: React.FC<{ grammar: ClipGrammar }> = ({ grammar }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <ClipCanvas spec={CLIP_PROBE_SPECS[grammar]!} t={frame / fps} />
    </AbsoluteFill>
  );
};
