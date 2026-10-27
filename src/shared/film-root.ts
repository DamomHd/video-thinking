/**
 * 每部片给 Remotion 的那一份（src/films/<片>/root.tsx 导出 filmRoot）。
 *
 * 片子目录的约定（引擎按目录自动发现，不再在 films.ts / Root.tsx 里逐部登记）：
 *   film.json   id / title / fps / width / height —— Node 侧（vw、工作台、测试）同步读取；Root.tsx 也用它定合成尺寸
 *   root.tsx    导出 filmRoot：幕表、画面组件、九张真值、打字表，以及这部片专有的额外合成（extra）
 *   audio/adapter.ts   声音适配器（导出一个 FilmAdapter 类）
 * 目录在就登记，不在就没有：被 .gitignore 排除的片子不影响其余部分。
 */
import type { ReactNode, FC } from 'react';
import type { FilmTimelinePlan } from './types';
import type { FilmTruth } from '../components/FilmShell';

export interface FilmRoot {
  timeline: FilmTimelinePlan;
  component: FC<{ includeAudio?: boolean }>;
  truth: FilmTruth;
  typings: { id: string; fromSec: number; durSec: number; label: string }[];
  /** 这部片专有的额外合成（预告片、方向关键帧…）：<Composition …/> 片段，会原样渲在总注册里 */
  extra?: ReactNode;
}

/** film.json */
export interface FilmMeta {
  id: string;
  title: string;
  fps: 30 | 60;
  width: number;
  height: number;
}
