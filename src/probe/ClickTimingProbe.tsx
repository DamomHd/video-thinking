import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CueAudio } from '../components/CueAudio';

/** 音效落点精度探针：第 1.000s 放一声咔哒，量渲出来的起音时刻（30 / 60fps 各注册一个） */
export const ClickTimingProbe: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <CueAudio cues={[{ slot: 'probeClick', at: 1.0, vol: 1, layer: 'UI' }]} manifest={{ probeClick: [{ file: '_probe/click.wav' }] }} includeMusic={false} />
  </AbsoluteFill>
);
