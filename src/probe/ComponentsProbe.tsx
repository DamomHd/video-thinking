import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppShell, ButtonPortal, ChapterTag, ChatStream, Cursor, Editorial, GlassCard, SnipImage } from '../components/ui';
import { ChipCanvas, FunnelSketch, RainCanvas } from '../components/sketch';
import { FilmCanvas, PoseCamera, PaperSheet, createPaperTexture } from '../components/three';
import { FocusSwap, FocusText, MorphLayer, PathPulses } from '../components/shot';
import { Stage } from '../components/Stage';
import { evalCamera } from '../shared/camera';
import { frameRect, shotRail } from '../shared/shot';
import { gridLayout } from '../shared/morph';
import { lift } from '../shared/lens';
import { tide, tideCount, thousands } from '../shared/flow';
import { clamp01, countUp } from '../shared/anim';

/**
 * 画面组件验收探针（内容中性：只有占位文字和几何）
 *
 * 之前的审计发现组件库大部分从没被渲过 —— 「文件在」不等于「能用」。
 * 这里每个组件一格，带名字标签，按时间推进：
 *   帧 0–89    界面组件：AppShell / GlassCard / ChatStream / Cursor / ChapterTag / Editorial / ButtonPortal / SnipImage
 *   帧 90–179  手稿画布 + 三维纸张 + 镜头原语：Chip / Rain / Funnel / PaperSheet / 拉焦 / 形变 / 光点 / 潮水计数 / 镜头轨
 *
 * 跑法：npx remotion still src/probe/index.ts ComponentsProbe out/x.png --frame=60 --gl=angle
 */
const W = 640;
const H = 360;

const Cell: React.FC<{ i: number; name: string; dark?: boolean; children: React.ReactNode }> = ({ i, name, dark, children }) => (
  <div
    style={{
      position: 'absolute',
      left: (i % 3) * W,
      top: Math.floor(i / 3) * H,
      width: W,
      height: H,
      overflow: 'hidden',
      background: dark ? '#14161A' : '#F3F0E8',
      boxShadow: 'inset 0 0 0 1px rgba(127,127,127,0.35)',
    }}
  >
    {children}
    <div style={{ position: 'absolute', left: 10, bottom: 8, font: '600 15px/1 ui-monospace, monospace', color: '#FF5028' }}>{name}</div>
  </div>
);

const SVG_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#DDE3EA"/>' +
      '<rect x="24" y="24" width="200" height="22" rx="6" fill="#9AA6B2"/><rect x="24" y="62" width="432" height="10" rx="5" fill="#B7C0C9"/>' +
      '<rect x="24" y="82" width="380" height="10" rx="5" fill="#B7C0C9"/><circle cx="400" cy="190" r="48" fill="#7C8B99"/></svg>'
  );

const UiPage: React.FC<{ t: number }> = ({ t }) => {
  const cam = { x: 0, y: 0, z: 1 - 0.1 * clamp01(t / 3) };
  return (
    <>
      <Cell i={0} name="AppShell + GlassCard">
        <div style={{ transform: 'scale(0.5)', transformOrigin: '0 0', width: W * 2, height: H * 2 }}>
          <AppShell title="示例应用" subtitle="占位" width={W * 2} height={H * 2} sidebar={<div style={{ padding: 20 }}>导航 A<br />导航 B</div>}>
            <div style={{ padding: 40 }}>
              <GlassCard progress={clamp01(t / 0.8)} width={600} height={300}>
                <div style={{ padding: 30, fontSize: 32 }}>卡片内容</div>
              </GlassCard>
            </div>
          </AppShell>
        </div>
      </Cell>
      <Cell i={1} name="ChatStream（标点成组出字）">
        <ChatStream
          theme="light"
          style={{ padding: 24 }}
          progress={clamp01(t / 2.5)}
          messages={[
            { id: 'a', sender: 'user', text: '这是一条占位消息，用来看逐字出现。' },
            { id: 'b', sender: 'assistant', text: '好的！收到——标点？成组出现；不跳行。' },
          ]}
        />
      </Cell>
      <Cell i={2} name="Cursor（速度倾斜 + 点击涟漪）">
        <Cursor x={120 + 360 * clamp01(t / 1.5)} y={140 + 200 * clamp01(t / 1.5)} vx={t < 1.5 ? 240 : 0} vy={t < 1.5 ? 130 : 0} clickProgress={clamp01((t - 1.6) / 0.5)} />
      </Cell>
      <Cell i={3} name="ChapterTag">
        <div style={{ padding: 60 }}>
          <ChapterTag number="03" label="示例章节" theme="light" />
        </div>
      </Cell>
      <Cell i={4} name="Editorial" dark>
        <div style={{ padding: 30 }}>
          <Editorial kicker="KICKER" title="示例标题文字" subtitle="副标题占位，看入场进度" progress={clamp01(t / 1.2)} theme="dark" titleSize={56} />
        </div>
      </Cell>
      <Cell i={5} name="ButtonPortal（世界点 → 屏幕点）">
        <Stage camera={cam} width={W} height={H} backgroundColor="#E8E4DA">
          <div style={{ position: 'absolute', left: 320 - 6, top: 180 - 6, width: 12, height: 12, borderRadius: 6, background: '#FF5028' }} />
        </Stage>
        <ButtonPortal worldX={0} worldY={0} camera={cam} stageSize={[W, H]} label="按钮" />
      </Cell>
      <Cell i={6} name="SnipImage">
        <div style={{ padding: 30 }}>
          <SnipImage src={SVG_IMG} fingerprint="v1" width={420} height={236} />
        </div>
      </Cell>
    </>
  );
};

const TRACK = 'M 20 200 C 160 80, 300 320, 440 200 S 600 100, 620 160';
const CARDS = Array.from({ length: 9 }, (_, i) => `k${i}`);
const KEEP = ['k1', 'k4', 'k7'];
const A = gridLayout(CARDS, { x: 40, y: 20, cols: 3, w: 170, h: 80, gap: 12 });
const B = gridLayout(KEEP, { x: 40, y: 120, cols: 3, w: 170, h: 110, gap: 12 });
const RAIL = shotRail(
  [
    { frame: frameRect({ x: 0, y: 0, w: 640, h: 360 }, { stage: [W, H], margin: 0 }), arrive: 0, leave: 0.6 },
    { frame: frameRect({ x: 1400, y: 30, w: 400, h: 225 }, { stage: [W, H], margin: 0 }), arrive: 2.4 },
  ],
  {}
);

const ShotPage: React.FC<{ t: number }> = ({ t }) => {
  const paper = React.useMemo(() => createPaperTexture(512, 512, 7), []);
  return (
    <>
      <Cell i={0} name="ChipCanvas" dark>
        <ChipCanvas width={W} height={H} time={t} />
      </Cell>
      <Cell i={1} name="RainCanvas" dark>
        <RainCanvas width={W} height={H} time={t} />
      </Cell>
      <Cell i={2} name="FunnelSketch">
        <FunnelSketch width={W} height={H} time={t} />
      </Cell>
      <Cell i={3} name="PaperSheet（three）">
        <FilmCanvas width={W} height={H} background="#DCD8CF" camera={{ fov: 30, near: 1, far: 5000 }}>
          <PoseCamera pose={{ pos: [0, -300, 1800], look: [0, 0, 0], fov: 30 }} />
          <ambientLight intensity={0.8} />
          <directionalLight position={[300, 500, 800]} intensity={1.6} />
          <PaperSheet width={600} height={760} unfoldProgress={clamp01(t / 2)} texture={paper} />
        </FilmCanvas>
      </Cell>
      <Cell i={4} name="FocusText / FocusSwap（拉焦）">
        <div style={{ position: 'absolute', left: 40, top: 150, font: '600 52px/1.3 system-ui', color: '#181614' }}>
          <FocusText text="逐字从模糊聚焦" t={t} from={0.2} />
          <br />
          <FocusSwap before="旧内容在原位" after="新内容聚焦出来" t={t} at={1.6} />
        </div>
      </Cell>
      <Cell i={5} name="MorphLayer + lift（9 → 3 形变）">
        <MorphLayer a={A} b={B} p={clamp01((t - 0.5) / 1.8)} options={{ stagger: 0.3 }}>
          {(item) => {
            const l = lift(item.role === 'stay' ? item.p : 0);
            return (
              <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', borderRadius: 8, background: '#fff', border: '1.5px solid rgba(24,22,20,0.35)', boxShadow: l.boxShadow, transform: `translateY(${l.dy}px)`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: '500 22px system-ui' }}>
                {item.id}
              </div>
            );
          }}
        </MorphLayer>
      </Cell>
      <Cell i={6} name="PathPulses（沿路径光点）">
        <svg width={W} height={H}>
          <path d={TRACK} fill="none" stroke="#E3AA3C" strokeWidth={5} />
          <PathPulses d={TRACK} t={t} color="#E3AA3C" count={3} periodSec={2.5} startSec={0} />
        </svg>
      </Cell>
      <Cell i={7} name="tide + tideCount + countUp">
        <svg width={W} height={H}>
          {Array.from({ length: 600 }, (_, i) => {
            const v = tide(i, 600, t, 0.3, 2.2);
            return v > 0 ? <circle key={i} cx={40 + (i % 40) * 14} cy={110 + Math.floor(i / 40) * 14} r={2.5 + 2 * v} fill="#E3AA3C" opacity={v} /> : null;
          })}
        </svg>
        <div style={{ position: 'absolute', left: 40, top: 50, font: '600 40px system-ui', fontVariantNumeric: 'tabular-nums' }}>
          {thousands(tideCount(600, t, 0.3, 2.2))} 点 · {thousands(countUp(t, 0, 652445, 2.5))}
        </div>
      </Cell>
      <Cell i={8} name="Stage + shotRail（弧线移动）">
        <Stage camera={evalCamera(RAIL, t)} width={W} height={H} backgroundColor="#EFEBE2">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: i * 160, top: 60 + (i % 3) * 100, width: 120, height: 80, borderRadius: 8, background: i === 9 ? '#FF5028' : '#C9C2B4', font: '600 28px system-ui', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {i}
            </div>
          ))}
        </Stage>
      </Cell>
    </>
  );
};

export const ComponentsProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {frame < 90 ? <UiPage t={frame / fps} /> : <ShotPage t={(frame - 90) / fps} />}
    </AbsoluteFill>
  );
};
