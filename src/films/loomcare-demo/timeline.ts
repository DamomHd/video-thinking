import { buildPlan } from '../../shared/types';

// 各幕时长（秒）定义
export const PROLOGUE_SECONDS = 12.0;
export const TITLE_SECONDS = 8.2;
export const CONNECT_SECONDS = 5.6;
export const DIALOG_A_SECONDS = 4.1;
export const CHIP_SECONDS = 8.2;
export const DIALOG_B_SECONDS = 25.9;
export const UNDERSTAND_SECONDS = 23.8;
export const HUMAN_SECONDS = 14.2;
export const CARE_SECONDS = 24.0;
export const WEAVE_SECONDS = 11.6;
export const LEARN_SECONDS = 54.25;
export const FINALE_SECONDS = 13.75;

/**
 * LoomCare 第二代时间模型：秒 + 幕表
 * 各幕时长单源，buildPlan 自动累加 start = prev.end - overlap
 */
export const FILM_PLAN = buildPlan([
  { id: 'prologue',   label: '序幕（3D 纸）',       dur: PROLOGUE_SECONDS,   overlap: 0,    enter: 'none' },
  { id: 'title',      label: '片名',               dur: TITLE_SECONDS,      overlap: 0.6,  enter: 'blur-scale' },
  { id: 'connect',    label: '01 接入',            dur: CONNECT_SECONDS,    overlap: 0.5,  enter: 'fade' },
  { id: 'dialogA',    label: '02 对话 A',          dur: DIALOG_A_SECONDS,   overlap: 0.35, enter: 'push-up' },
  { id: 'chip',       label: '入口芯片（过场）',    dur: CHIP_SECONDS,       overlap: 0.2,  enter: 'fade' },
  { id: 'dialogB',    label: '02 对话 B',          dur: DIALOG_B_SECONDS,   overlap: 0.25, enter: 'fade' },
  { id: 'understand', label: '03 读懂',            dur: UNDERSTAND_SECONDS, overlap: 0.5,  enter: 'fade' },
  { id: 'human',      label: '04 有人负责',        dur: HUMAN_SECONDS,      overlap: 0.5,  enter: 'blur-scale' },
  { id: 'care',       label: '05 有温度（3D 手机）', dur: CARE_SECONDS,       overlap: 0.5,  enter: 'blur-scale' },
  { id: 'weave',      label: '织（过场）',          dur: WEAVE_SECONDS,      overlap: 0.5,  enter: 'fade' },
  { id: 'learn',      label: '06 越用越懂',        dur: LEARN_SECONDS,      overlap: 0.55, enter: 'fade' },
  { id: 'finale',     label: '07 底座 / 落版',     dur: FINALE_SECONDS,     overlap: 0.6,  enter: 'blur-scale' },
]);
