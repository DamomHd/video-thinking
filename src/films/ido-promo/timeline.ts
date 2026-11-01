import { buildPlan } from '../../shared/types';

/**
 * iDo Space 小红书宣传片 · 时间模型（秒 + 幕表）
 *
 * 50 秒竖屏宣传片，按「记录 → 洞察 → 隐私 → 行动」叙事：
 *   开场提问 → 记录很简单 → 数据有洞察（频率 + 时长） → 隐私有保障 → 下载
 *
 * 各幕时长单源，buildPlan 自动累加 start = prev.end − overlap。
 * 合计 54.0s − 5×0.8s 交叠 = 50.0s。
 */
export const QUESTION_SECONDS = 5.0;
export const RECORD_SECONDS = 8.0;
export const FREQUENCY_SECONDS = 8.0;
export const DURATION_SECONDS = 9.0;
export const PRIVACY_SECONDS = 15.0;
export const CTA_SECONDS = 5.0;

export const FILM_PLAN = buildPlan([
  { id: 'question',   label: 'S1 开场提问',           dur: QUESTION_SECONDS,   overlap: 0,   enter: 'none' },
  { id: 'record',     label: 'S2 记录层 · 日历',     dur: RECORD_SECONDS,     overlap: 0.8, enter: 'fade' },
  { id: 'frequency',  label: 'S3 频率图',            dur: FREQUENCY_SECONDS,  overlap: 0.8, enter: 'none' },
  { id: 'duration',   label: 'S4 时长分布',          dur: DURATION_SECONDS,   overlap: 0.8, enter: 'fade' },
  { id: 'privacy',    label: 'S5 隐私层 · 锁',       dur: PRIVACY_SECONDS,    overlap: 0.8, enter: 'fade' },
  { id: 'cta',        label: 'S6 行动召唤 · 下载',   dur: CTA_SECONDS,        overlap: 0.8, enter: 'blur-scale' },
]);
