import { buildPlan } from '../../shared/types';

/**
 * 视频工作台宣传大片 (vw-promo) · 时间模型（秒 + 幕表）
 *
 * 工业化四幕递进：
 *   S1 痛点工单 (8.0s)  → 传统手工剪辑的轨道漂移与改版返工
 *   S2 实机界面 (10.0s) → 逐帧单源驱动，全命令流一键构建与真波形对齐
 *   S3 底座光柱 (8.0s)  → Remotion 逐帧内核与 3D 镜头桥，三大引擎贯通
 *   S4 数字交付 (10.0s) → 0 丢帧、100% 单源真值、10× 提效的工业级交付
 *
 * 各幕时长单源，总长 36.0s。
 */
export const PAIN_SECONDS = 8.0;
export const WORKBENCH_SECONDS = 10.0;
export const ENGINE_SECONDS = 8.0;
export const DELIVERY_SECONDS = 10.0;

export const FILM_PLAN = buildPlan([
  { id: 'pain',      label: '01 痛点工单 · 传统改版延误与轨道漂移', dur: PAIN_SECONDS,      overlap: 0, enter: 'none' },
  { id: 'workbench', label: '02 实机界面 · 逐帧单源驱动与波形对齐', dur: WORKBENCH_SECONDS, overlap: 0, enter: 'fade' },
  { id: 'engine',    label: '03 底座光柱 · 逐帧内核与 3D 镜头桥',   dur: ENGINE_SECONDS,    overlap: 0, enter: 'fade' },
  { id: 'delivery',  label: '04 数字交付 · 0 丢帧与 100% 单源真值', dur: DELIVERY_SECONDS,  overlap: 0, enter: 'fade' },
]);
