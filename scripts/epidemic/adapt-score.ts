/**
 * 改编候选分 (对标 architecture.html 附录 C)
 *
 *   分 = scoreSync(本段) + 2·网格拟合 − min(60, drop 误差帧) − 第二高潮罚分
 *   第二高潮罚分 = min(30, 0.5·误差帧)，找不到强跃升时罚满 30
 *
 * 用在比选改编上：同一首曲子跑 N 个配方，各自实测，按这个分挑一版。
 * 注意分母是**帧**不是秒 —— 误差帧 = 误差秒 × fps，所以 fps 必须传进来。
 */

import { BeatGrid } from '../sync/analyze.js';

export interface AdaptCandidate {
  recipe: string;
  editId: string;
  file: string;
  grid: BeatGrid;
  /** 实测主高潮落点（秒，段内） */
  actualDropSec: number | null;
  /** 实测第二高潮落点（秒，段内）；null = 没找到强跃升 */
  actualDrop2Sec: number | null;
}

export interface AdaptTargets {
  /** 目标主高潮（秒，段内） */
  dropAtSec: number | null;
  /** 目标第二高潮（秒，段内） */
  drop2AtSec: number | null;
  /** 本段的对拍得分（0–100），由 solve 的报告给出 */
  scoreSync: number;
  fps: number;
  /** 曲目声明的 bpm，用来衡量改编后网格有没有跑偏 */
  nominalBpm?: number;
}

export interface ScoredCandidate extends AdaptCandidate {
  score: number;
  parts: {
    scoreSync: number;
    gridFit: number;
    dropPenalty: number;
    drop2Penalty: number;
  };
  dropErrFrames: number | null;
  drop2ErrFrames: number | null;
}

/**
 * 网格拟合 (0–1)：改编产物的拍网格有多「整」。
 * 三件事各占一份：
 *   - 小节数是不是整数（接口按小节剪，剪得好的话段长正好落在小节线上）
 *   - 实测 bpm 与声明 bpm 的偏差
 *   - 有没有识别出明确的 drop 段
 */
export function gridFit(grid: BeatGrid, nominalBpm?: number): number {
  if (!grid.barSec || grid.barSec <= 0) return 0;

  const bars = grid.totalSec / grid.barSec;
  const barFrac = Math.abs(bars - Math.round(bars));
  const barScore = Math.max(0, 1 - barFrac * 4); // 偏离 1/4 小节就归零

  // 没有声明 bpm 时这一项不该白送分也不该白扣分，按自相关可信度顶上
  const bpmScore =
    nominalBpm && nominalBpm > 0
      ? Math.max(0, 1 - (Math.abs(grid.bpm - nominalBpm) / nominalBpm) * 20) // 偏 5% 归零
      : Math.min(1, (grid.periodR ?? 0) / 0.3);

  const dropScore = grid.dropSec > 0 ? 1 : 0;

  return (barScore + bpmScore + dropScore) / 3;
}

export function scoreCandidate(c: AdaptCandidate, t: AdaptTargets): ScoredCandidate {
  const fit = gridFit(c.grid, t.nominalBpm);

  // ── 主高潮罚分：min(60, 误差帧)
  let dropErrFrames: number | null = null;
  let dropPenalty = 0;
  if (t.dropAtSec !== null) {
    if (c.actualDropSec === null) {
      dropPenalty = 60; // 根本没找到 drop，罚满
    } else {
      dropErrFrames = Math.abs(c.actualDropSec - t.dropAtSec) * t.fps;
      dropPenalty = Math.min(60, dropErrFrames);
    }
  }

  // ── 第二高潮罚分：min(30, 0.5·误差帧)，找不到强跃升时罚满 30
  let drop2ErrFrames: number | null = null;
  let drop2Penalty = 0;
  if (t.drop2AtSec !== null) {
    if (c.actualDrop2Sec === null) {
      drop2Penalty = 30;
    } else {
      drop2ErrFrames = Math.abs(c.actualDrop2Sec - t.drop2AtSec) * t.fps;
      drop2Penalty = Math.min(30, 0.5 * drop2ErrFrames);
    }
  }

  const score = t.scoreSync + 2 * fit * 100 - dropPenalty - drop2Penalty;

  return {
    ...c,
    score: Math.round(score * 100) / 100,
    parts: {
      scoreSync: t.scoreSync,
      gridFit: Math.round(fit * 1000) / 1000,
      dropPenalty: Math.round(dropPenalty * 100) / 100,
      drop2Penalty: Math.round(drop2Penalty * 100) / 100,
    },
    dropErrFrames: dropErrFrames === null ? null : Math.round(dropErrFrames * 100) / 100,
    drop2ErrFrames: drop2ErrFrames === null ? null : Math.round(drop2ErrFrames * 100) / 100,
  };
}

export function rankCandidates(cands: AdaptCandidate[], t: AdaptTargets): ScoredCandidate[] {
  return cands.map((c) => scoreCandidate(c, t)).sort((a, b) => b.score - a.score);
}

/**
 * 从分析结果里找第二高潮：取 jumps 里除主 drop 外、离目标最近的那个强跃升。
 * 没有 jumps 或全被主 drop 占掉时返回 null —— 打分那边会罚满 30 分。
 */
export function pickSecondClimax(grid: BeatGrid, targetSec: number | null): number | null {
  const jumps = (grid.jumps ?? []).filter((j) => Math.abs(j - grid.dropSec) > grid.barSec);
  if (jumps.length === 0) return null;
  if (targetSec === null) return jumps[0];
  return jumps.reduce((best, j) =>
    Math.abs(j - targetSec) < Math.abs(best - targetSec) ? j : best
  );
}
