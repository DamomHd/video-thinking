import { buildPlan } from '../../shared/types';

/**
 * Us「图纸」版 · 30 秒 · 时间模型（秒 + 幕表）
 *
 * 参考片的节奏是「画出来 → 长时间静止让人读」：185s 里 82% 的帧完全静止，
 * 全片只有 2 处硬切。所以这一版也按**翻页**来排，不做花哨转场：
 * 图幅外壳（网格 / 图框 / 刻度 / 图签栏）每一屏都一样，
 * 页与页之间只有内容在换，图号从 US-00 走到 US-05。
 *
 * 交叠留 0.25s 的淡化 —— 因为前后两屏的外壳一模一样，
 * 这段交叠看起来就是「内容换了、图纸没换」，正是要的效果。
 *
 * 合计 30.75s − 3×0.25s = 30.0s（暗场两侧改硬切后少了两个交叠，两幕各缩 0.25s 配平）。
 */
export const COVER_SECONDS = 5.4;
export const RECORD_SECONDS = 5.4;
export const RIVER_SECONDS = 5.8;
export const STATS_SECONDS = 5.35;
export const PRIVACY_SECONDS = 4.55;
export const FINALE_SECONDS = 4.25;

export const FILM_PLAN = buildPlan([
  { id: 'cover',   label: 'US-00 封面 · 时间标尺',     dur: COVER_SECONDS,   overlap: 0,    enter: 'none' },
  { id: 'record',  label: 'US-01 一条记录的构成',       dur: RECORD_SECONDS,  overlap: 0.25, enter: 'fade' },
  { id: 'river',   label: 'US-02 时间之河 · 散点',      dur: RIVER_SECONDS,   overlap: 0.25, enter: 'fade' },
  /**
   * 暗场这一屏的进出都用**硬切**（overlap 0 / enter none）。
   *
   * 米白纸底和纯黑底之间做 0.25s 交叉淡化，实测中间 15 帧是一团灰浆 ——
   * 既不干脆也不平滑，是最差的选项（motion-guard 会报「峰值 17 持续 233ms」）。
   * 参考片同样有亮暗切换，它用的就是单帧硬切。
   * 规则写在 shared/motion 的 polarityTransitionOk 里：要么硬切，要么铺够 0.8s。
   */
  { id: 'stats',   label: 'US-03 时段分布（暗场）',     dur: STATS_SECONDS,   overlap: 0,    enter: 'none' },
  { id: 'privacy', label: 'US-04 数据边界 · 剖面',      dur: PRIVACY_SECONDS, overlap: 0,    enter: 'none' },
  { id: 'finale',  label: 'US-05 落版 · 汇总',          dur: FINALE_SECONDS,  overlap: 0.25, enter: 'fade' },
]);
