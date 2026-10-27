import { VisualHit } from '../../src/shared/types.js';

export interface BpmFitCandidate {
  bpm: number;
  gridCostFrames: number;
  fitScore: number; // 0 ~ 100
  window: [number, number]; // [bpmMin, bpmMax] (±1.5%)
}

export interface BpmScanResult {
  dropSec: number;
  bestCandidates: BpmFitCandidate[];
  evaluateBpm: (bpm: number) => { gridCostFrames: number; fitScore: number };
}

/**
 * 计算单一 BPM 下的视觉拍点网格代价与拟合分
 * @param hits 视觉关键拍点
 * @param dropSec 高潮 drop 锚定原点（秒）
 * @param bpm 目标测试速度
 * @param fps 帧率（默认 30）
 */
export function evaluateBpmFit(
  hits: VisualHit[],
  dropSec: number,
  bpm: number,
  fps = 30
): { gridCostFrames: number; fitScore: number } {
  if (bpm <= 0 || hits.length === 0) {
    return { gridCostFrames: 999, fitScore: 0 };
  }

  const beatSec = 60 / bpm;
  const barSec = beatSec * 4;

  let totalWeightedFrames = 0;
  let totalWeight = 0;

  for (const hit of hits) {
    const t = hit.filmSec ?? hit.sec;
    const dt = t - dropSec;
    let distSec = 0;

    const prioWeight = hit.priority === 'P0' ? 3.0 : hit.priority === 'P1' ? 1.5 : 0.5;

    if (hit.want === 'drop') {
      // 必须精确对齐 drop 原点或其整小节周期
      const offsetBars = Math.round(dt / barSec);
      distSec = Math.abs(dt - offsetBars * barSec);
    } else if (hit.want === 'downbeat') {
      // 对齐到最近的小节头
      const offsetBars = Math.round(dt / barSec);
      distSec = Math.abs(dt - offsetBars * barSec);
    } else {
      // 对齐到最近的拍
      const offsetBeats = Math.round(dt / beatSec);
      distSec = Math.abs(dt - offsetBeats * beatSec);
    }

    const errFrames = distSec * fps;
    totalWeightedFrames += errFrames * prioWeight;
    totalWeight += prioWeight;
  }

  const gridCostFrames = totalWeight > 0 ? totalWeightedFrames / totalWeight : 0;

  // 架构标准：≤ 10 帧满分 100 分，超过每帧罚 3.5 分
  let fitScore = 100;
  if (gridCostFrames > 10) {
    fitScore = Math.max(0, 100 - (gridCostFrames - 10) * 3.5);
  }

  return {
    gridCostFrames: Number(gridCostFrames.toFixed(2)),
    fitScore: Number(fitScore.toFixed(1)),
  };
}

/**
 * 扫描 60~180 BPM 空间，求出网格代价最低的前 3 名 BPM 及其 ±1.5% 推荐窗口
 */
export function scanBpmGrid(
  hits: VisualHit[],
  dropSec: number,
  options?: { minBpm?: number; maxBpm?: number; step?: number; fps?: number }
): BpmScanResult {
  const minBpm = options?.minBpm ?? 60;
  const maxBpm = options?.maxBpm ?? 180;
  const step = options?.step ?? 1;
  const fps = options?.fps ?? 30;

  const results: { bpm: number; gridCostFrames: number; fitScore: number }[] = [];

  for (let b = minBpm; b <= maxBpm; b += step) {
    const res = evaluateBpmFit(hits, dropSec, b, fps);
    results.push({ bpm: b, ...res });
  }

  // 按网格代价升序排序（误差最小排在最前）
  results.sort((a, b) => a.gridCostFrames - b.gridCostFrames);

  // 取前 3 名，并计算 ±1.5% 推荐窗口
  const bestCandidates: BpmFitCandidate[] = results.slice(0, 3).map(r => ({
    bpm: r.bpm,
    gridCostFrames: r.gridCostFrames,
    fitScore: r.fitScore,
    window: [
      Number((r.bpm * 0.985).toFixed(1)),
      Number((r.bpm * 1.015).toFixed(1)),
    ],
  }));

  return {
    dropSec,
    bestCandidates,
    evaluateBpm: (bpm: number) => evaluateBpmFit(hits, dropSec, bpm, fps),
  };
}
