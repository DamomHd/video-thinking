import { buildPlan } from '../../shared/types';

/**
 * 对账台（虚构产品演示）· 时间模型（秒 + 幕表）
 *
 * product-story 风格原生四段 + 两个出口插在暗场与数字墙之间：
 *   01 一张发票 (7.0s)  纸面微距，荧光笔划过金额 → 飞成对账字段
 *   02 一句话走完流程 (9.0s)  输入差异 → 识别 → 比对 → 定位 → 生成差异报告
 *   03 暗场一亮 (5.0s)  核验引擎能力线框亮起
 *   04 两个出口 (6.0s)  后台差异卡 + 手机审批消息同时更新
 *   05 数字墙 (5.0s)  5,280 张 / 47 差异 / 0 误漏 / 38 秒 → 落版
 *
 * 各幕时长单源，总长 32.0s。沿用 product-story 风格（不拉伸对拍）。
 */
export const OPEN_SECONDS = 7.0;
export const FLOW_SECONDS = 9.0;
export const STAGE_SECONDS = 5.0;
export const TWIN_SECONDS = 6.0;
export const NUMBERS_SECONDS = 5.0;

export const FILM_PLAN = buildPlan([
  { id: 'open',     label: '01 一张发票 · 纸面微距与荧光笔', dur: OPEN_SECONDS,     overlap: 0,   enter: 'none' },
  { id: 'flow',     label: '02 一句话走完流程 · 识别到差异报告', dur: FLOW_SECONDS, overlap: 0, enter: 'fade' },
  { id: 'stage',    label: '03 暗场一亮 · 核验引擎能力',  dur: STAGE_SECONDS,    overlap: 0,   enter: 'fade' },
  { id: 'twin',     label: '04 两个出口 · 后台与手机同源', dur: TWIN_SECONDS,     overlap: 0,   enter: 'fade' },
  { id: 'numbers',  label: '05 数字墙 · 落版',             dur: NUMBERS_SECONDS,  overlap: 0,   enter: 'blur-scale' },
]);
