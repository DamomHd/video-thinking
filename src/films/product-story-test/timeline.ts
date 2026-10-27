import { buildPlan } from '../../shared/types';

/**
 * product-story（暖纸产品叙事）风格样片 · 29.5 秒，虚构的「售后工单助手」，数据都是假的。
 * 一个世界组件按全片秒画到底；幕只给声音 / 对拍 / 单幕合成分段（overlap 0、enter none）。
 */
export const FILM_PLAN = buildPlan([
  { id: 'open',    label: '1 一张单子',       dur: 7.0, overlap: 0, enter: 'none' },
  { id: 'ui',      label: '2 一句话走完流程', dur: 8.0, overlap: 0, enter: 'none' },
  { id: 'stage',   label: '3 暗场一亮',       dur: 5.5, overlap: 0, enter: 'none' },
  { id: 'numbers', label: '4 数字墙',         dur: 9.0, overlap: 0, enter: 'none' },
]);
