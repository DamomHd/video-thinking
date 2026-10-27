import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage } from '../components/Stage';
import { FocusText, FocusSwap } from '../components/shot';
import { evalCamera } from '../shared/camera';
import { compileShots, Shot } from '../shared/grammar';
import { BLUEPRINT } from '../styles';

/**
 * 镜头清单验收探针（内容中性）：四种过渡（arc / whip / cut / glide）、三种停留（push / still / drift）
 */
const R = (x: number) => ({ x, y: 0, w: 1920, h: 1080 });
/**
 * 一份「模型写的」镜头清单：四种过渡、三种停留都用到。
 * A 缓推 → 弧线到 B → B 原地停（舞台式，内容在原位换）→ 甩镜到 D → D 慢漂 → 硬切到 E → 直推拉远看全
 */
const SHOTS: Shot[] = [
  { id: 'A', frame: R(0), at: 0, hold: { kind: 'push', amount: 0.97 }, out: { kind: 'arc', start: 4.2 } },
  { id: 'B', frame: R(2400), at: 5.6, hold: { kind: 'still' }, out: { kind: 'whip', start: 14.6 } },
  { id: 'D', frame: R(4800), at: 15.0, hold: { kind: 'drift', dx: 120, dy: 0 }, out: { kind: 'cut', start: 17.5 } },
  { id: 'E', frame: R(7200), at: 17.5, hold: { kind: 'push', amount: 0.97 }, out: { kind: 'glide', start: 18.3 } },
  { id: '全景', frame: { x: -200, y: -1500, w: 9600, h: 4000 }, margin: 0.02, at: 19.6 },
];
const CAM = compileShots(SHOTS);
const moveAt = (t: number) => CAM.moves.find((m) => t >= m.from && t <= m.to)?.kind ?? (CAM.cuts.some((c) => Math.abs(c - t) < 0.05) ? 'cut' : '停留');
const C = BLUEPRINT.colors;
const box = (x: number, label: string, t: number, from: number) => (
  <div style={{ position: 'absolute', left: x + 160, top: 300, font: `700 96px ${BLUEPRINT.fonts.display}`, color: C.text, whiteSpace: 'nowrap' }}>
    <FocusText text={label} t={t} from={from} />
  </div>
);

export const GRAMMAR_PROBE_SEC = 20;

export const GrammarProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Stage camera={evalCamera(CAM.keys, t)} backgroundColor={C.paper}>
        <div style={{ position: 'absolute', left: -2000, top: -2000, width: 11000, height: 5000, backgroundImage: `radial-gradient(circle, ${C.gridDot} 1.4px, transparent 1.6px)`, backgroundSize: '40px 40px' }} />
        <div style={{ position: 'absolute', left: 0, top: 860, width: 9120, height: 6, background: C.accent }} />
        {box(0, 'A · 缓推，弧线离开', t, 0.3)}
        <div style={{ position: 'absolute', left: 2400 + 160, top: 300, font: `700 96px ${BLUEPRINT.fonts.display}`, color: C.text, whiteSpace: 'nowrap' }}>
          {t < 9.8 ? <FocusText text="舞台 · 第一段" t={t} from={5.8} /> : <FocusSwap before="舞台 · 第一段" after="舞台 · 原位换成第二段" t={t} at={10} />}
        </div>
        {box(4800, 'D · 甩镜进来，慢漂', t, 15.1)}
        {box(7200, 'E · 硬切进来', t, 17.6)}
      </Stage>
      <div style={{ position: 'absolute', left: 40, bottom: 30, font: `600 24px ui-monospace, monospace`, color: '#FF5028' }}>
        GrammarProbe t={t.toFixed(2)}s · 镜头 {moveAt(t)}
      </div>
    </AbsoluteFill>
  );
};
