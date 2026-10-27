/**
 * GPU 探针的独立 Remotion 入口（对标 §4：src/probe/index.ts 是另一个入口）
 * 跑法：npx remotion still src/probe/index.ts GpuProbe out/probe.png --gl=angle
 */
import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { GpuProbe } from './Probe';
import { DataCanvasProbe } from './DataCanvasProbe';
import { WorldProbe } from './WorldProbe';
import { BlenderProbe } from './BlenderProbe';
import { PhoneFallbackProbe } from './PhoneFallbackProbe';
import { ComponentsProbe } from './ComponentsProbe';
import { FlightProbe, FLIGHT_PROBE_SEC } from './FlightProbe';
import { StyleProbe } from './StyleProbe';
import { MathProbe } from './MathProbe';
import { PaintProbe } from './PaintProbe';
import { StyleSheet } from './StyleSheet';
import { GrammarProbe, GRAMMAR_PROBE_SEC } from './GrammarProbe';
import { BeatProbe } from './BeatProbe';
import { ClickTimingProbe } from './ClickTimingProbe';
import { BridgeProbe, BRIDGE_PROBE_SEC } from './BridgeProbe';
import { ClipProbe, CLIP_PROBE_SPECS, clipProbeFrames } from './ClipProbe';
import type { ClipGrammar } from '../shared/clip';
import { BrushProbe, BRUSH_PROBE_SEC, BrushProbeMode } from './BrushProbe';
import { VoiceProbe, VOICE_PROBE_SEC } from './VoiceProbe';
import { FontProbe } from './FontProbe';

const ProbeRoot: React.FC = () =>
  React.createElement(
    React.Fragment,
    null,
    React.createElement(Composition, {
      id: 'GpuProbe',
      component: GpuProbe,
      durationInFrames: 1,
      fps: 30,
      width: 1600,
      height: 400,
    }),
    // 把短片的 R3F 世界单独挂起来，用来把「世界本身」和「短片外壳」分开定位
    React.createElement(Composition, {
      id: 'WorldProbe',
      component: WorldProbe,
      durationInFrames: 1,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // Blender 资产出口验收：glb 机身 + 可选体积光叠加（内容中性）
    React.createElement(Composition, {
      id: 'BlenderProbe',
      component: BlenderProbe,
      durationInFrames: 30,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 3D 实时层验收：three.js 降级机身对齐 + 后期链（内容中性）
    React.createElement(Composition, {
      id: 'PhoneFallbackProbe',
      component: PhoneFallbackProbe,
      durationInFrames: 60,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 画面组件验收：每个组件一格，内容中性（界面组件 0–89 帧，画布与镜头原语 90–179 帧）
    React.createElement(Composition, {
      id: 'ComponentsProbe',
      component: ComponentsProbe,
      durationInFrames: 180,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 3D 漫游验收：路径相机穿行立柱阵列（内容中性）
    React.createElement(Composition, {
      id: 'FlightProbe',
      component: FlightProbe,
      durationInFrames: FLIGHT_PROBE_SEC * 30,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 风格无关原语验收：Rough 手绘 + 外部片段插入（内容中性）
    React.createElement(Composition, {
      id: 'StyleProbe',
      component: StyleProbe,
      durationInFrames: 150,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 公式与几何板书验收（内容中性：教科书例题）
    React.createElement(Composition, {
      id: 'MathProbe',
      component: MathProbe,
      durationInFrames: 165,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 水彩 / 水墨 / 定格 / 轴测验收（内容中性）
    React.createElement(Composition, {
      id: 'PaintProbe',
      component: PaintProbe,
      durationInFrames: 135,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 风格样张：vw style sheet <id>
    React.createElement(Composition, {
      id: 'StyleSheet',
      // createElement 推不出带参数组件的泛型，这里显式收窄
      component: StyleSheet as unknown as React.FC<Record<string, unknown>>,
      durationInFrames: 1,
      fps: 30,
      width: 1920,
      height: 1080,
      defaultProps: { styleId: 'blueprint' },
    }),
    // 镜头语法验收：漫游 → 舞台 → 舞台 → 漫游（内容中性）
    React.createElement(Composition, {
      id: 'GrammarProbe',
      component: GrammarProbe,
      durationInFrames: GRAMMAR_PROBE_SEC * 30,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 节拍音效对比（内容中性；素材临时放 public/_probe/，渲完删除）
    React.createElement(Composition, {
      id: 'BeatProbe',
      component: BeatProbe,
      durationInFrames: 16 * 30,
      fps: 30,
      width: 1920,
      height: 1080,
    }),
    // 音效落点精度：第 1.000s 一声咔哒（30 / 60fps）
    React.createElement(Composition, { id: 'ClickTiming30', component: ClickTimingProbe, durationInFrames: 60, fps: 30, width: 320, height: 180 }),
    React.createElement(Composition, { id: 'ClickTiming60', component: ClickTimingProbe, durationInFrames: 120, fps: 60, width: 320, height: 180 }),
    // 2D ↔ 3D 镜头桥验收（内容中性）
    React.createElement(Composition, { id: 'BridgeProbe', component: BridgeProbe, durationInFrames: BRIDGE_PROBE_SEC * 30, fps: 30, width: 1920, height: 1080 }),
    // huashu-clip 画法（上游模板示例数据）：ClipProbe-<grammar>
    ...(Object.keys(CLIP_PROBE_SPECS) as ClipGrammar[]).map((g) =>
      React.createElement(Composition, { key: g, id: `ClipProbe-${g.replace(/_/g, '-')}`, component: ClipProbe as unknown as React.FC<Record<string, unknown>>, durationInFrames: clipProbeFrames(g), fps: 30, width: 1920, height: 1080, defaultProps: { grammar: g } })
    ),
    // 本地字体（vw font fetch）：--props 传 { slugs, families }
    React.createElement(Composition, { id: 'FontProbe', component: FontProbe as unknown as React.FC<Record<string, unknown>>, durationInFrames: 1, fps: 30, width: 1600, height: 900 }),
    // 口播层（可选 VO）：配乐 + 口播从 --props 传入
    React.createElement(Composition, { id: 'VoiceProbe', component: VoiceProbe as unknown as React.FC<Record<string, unknown>>, durationInFrames: VOICE_PROBE_SEC * 30, fps: 30, width: 320, height: 180 }),
    // 数据叙事画布（收录的 dataviz 引擎）：轴、落点、批注、铅笔
    React.createElement(Composition, { id: 'DataCanvasProbe', component: DataCanvasProbe, durationInFrames: 150, fps: 30, width: 1920, height: 1080 }),
    // 笔刷手绘（ClaudeAnimationBase：p5.js + p5.brush）：BrushProbe-<模式>
    ...(Object.keys(BRUSH_PROBE_SEC) as BrushProbeMode[]).map((m) =>
      React.createElement(Composition, { key: `brush-${m}`, id: `BrushProbe-${m}`, component: BrushProbe as unknown as React.FC<Record<string, unknown>>, durationInFrames: BRUSH_PROBE_SEC[m] * 30, fps: 30, width: 1920, height: 1080, defaultProps: { mode: m } })
    )
  );

registerRoot(ProbeRoot);
