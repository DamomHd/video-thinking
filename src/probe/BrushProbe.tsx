/**
 * 笔刷手绘（ClaudeAnimationBase）验收探针：BrushProbe-<模式>
 *   · demo      上游示例镜头脚本（src/scenes/demo.js，11 秒），验证 scenes 写法与上游一致
 *   · emotions  上游设定图 loop：31 种情绪
 *   · views     上游设定图 loop：转身角度、动作、帽子
 *   · ts        用 TS 绘制函数 + cab() 写的一小段（内容中性：纸上一片山坡，角色睡着 → 惊醒 → 开心，光点亮起，刷子擦除收尾），
 *               验证类型化入口和「每帧确定」
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { PaintCanvas, cab } from '../components/paint';

export type BrushProbeMode = 'demo' | 'emotions' | 'views' | 'ts';
export const BRUSH_PROBE_SEC: Record<BrushProbeMode, number> = { demo: 11, emotions: 4, views: 4, ts: 4 };

const tsDraw = (t: number) => {
  const { paint, inkLine, glow, clawd, emotions, jump, brushWipe, iris, ellPts, rectPts, boilSeed, camBegin, camEnd, toScreen, PAL, W, H, ease, seg } = cab();
  camBegin(960 + 30 * Math.sin(t * 0.5), 560, 1 + 0.03 * t);
  boilSeed('sky');
  paint(rectPts(-200, -200, W + 400, H + 400), { wash: PAL.night, ink: null });
  boilSeed('hill');
  paint(ellPts(960, 1180, 1300, 420, 44, 4), { fill: PAL.indigo, fillOp: 200, bleed: 0.18, tex: 0.6, ink: null });
  boilSeed('grass');
  inkLine([[380, 840], [700, 800], [960, 790], [1260, 800], [1560, 850]], 0.8, PAL.cream, 'dry', 0.6);
  const lamp = ease(seg(t, 1.4, 1.9));
  if (lamp > 0) glow(1380, 520, 260 * lamp, '#FFC766', lamp);
  boilSeed('lamp');
  paint(ellPts(1380, 520, 26, 26, 20, 1.5), { wash: PAL.ochre, ink: PAL.ink, sw: 0.8 });
  const mood = emotions(t, [[0, 'sleepy'], [1.5, 'surprised', { lookX: 0.8 }], [2.4, 'happy']]);
  const hop = jump(t, 2.5, 3.0, 2.5);
  clawd(960, 800, 26, { ...mood, dy: (mood.dy ?? 0) + hop.dy, sq: (mood.sq ?? 0) + hop.sq });
  const at = toScreen(960, 800 - 4 * 26);
  camEnd();
  if (t < 0.5) iris(at[0], at[1], 1500 * ease(t / 0.5));
  if (t > 3.5) brushWipe((t - 3.5) / 1.0);
};

export const BrushProbe: React.FC<{ mode: BrushProbeMode }> = ({ mode }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const project = { duration: BRUSH_PROBE_SEC[mode], bpm: 120 };
  return (
    <AbsoluteFill>
      {mode === 'demo' && <PaintCanvas t={t} project={project} scenes={['vendor/claude-animation-base/src/scenes/demo.js']} />}
      {(mode === 'emotions' || mode === 'views') && <PaintCanvas t={t} project={project} loop={mode} />}
      {mode === 'ts' && <PaintCanvas t={t} project={project} draw={tsDraw} />}
    </AbsoluteFill>
  );
};
