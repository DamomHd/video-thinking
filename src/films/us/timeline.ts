import { buildPlan } from '../../shared/types';

/**
 * Us 30 秒社媒宣传片 · 时间模型（秒 + 幕表）
 *
 * 叙事按「用户决策顺序」排，不按功能清单排：
 *   先给一个能共情的钩子 → 再讲怎么用 → 再讲用完能看到什么
 *   → 最后才回答「我的数据安全吗」这个决定要不要下载的问题 → 落版
 *
 * 各幕时长单源，buildPlan 自动累加 start = prev.end − overlap。
 * 合计 32.0s − 5×0.4s 交叠 = 30.0s。
 */
export const OPEN_SECONDS = 5.0;
export const RECORD_SECONDS = 6.2;
export const RIVER_SECONDS = 6.6;
export const INSIGHTS_SECONDS = 5.6;
export const PRIVACY_SECONDS = 4.6;
export const FINALE_SECONDS = 4.0;

export const FILM_PLAN = buildPlan([
  { id: 'open',     label: '01 钩子 · 有些时刻只想自己记得', dur: OPEN_SECONDS,     overlap: 0,   enter: 'none' },
  { id: 'record',   label: '02 快速记录 · 点一下记一笔',     dur: RECORD_SECONDS,   overlap: 0.4, enter: 'fade' },
  { id: 'river',    label: '03 时间之河 · 把历史变成河流',   dur: RIVER_SECONDS,    overlap: 0.4, enter: 'fade' },
  { id: 'insights', label: '04 统计洞察 · 看见自己的节奏',   dur: INSIGHTS_SECONDS, overlap: 0.4, enter: 'fade' },
  { id: 'privacy',  label: '05 本地优先 · 没有服务器',       dur: PRIVACY_SECONDS,  overlap: 0.4, enter: 'blur-scale' },
  { id: 'finale',   label: '06 落版 · Us',                   dur: FINALE_SECONDS,   overlap: 0.4, enter: 'blur-scale' },
]);
