import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMusicGrid } from '../../scripts/sync/analyze';
import { solveBeatAlignment } from '../../scripts/sync/solve';
import { spliceAudioWithCrossfade, findNearestZeroCrossing } from '../../scripts/sync/surgery';
import { VisualHit } from './types';

test('analyzeMusicGrid accurately generates beats, downbeats, and drop point', () => {
  const grid = analyzeMusicGrid(30.0, { nominalBpm: 120 });
  // 120 BPM: 单拍 0.5s, 单小节 2.0s
  assert.equal(grid.beatSec, 0.5);
  assert.equal(grid.barSec, 2.0);
  assert.ok(grid.beats.length >= 60);

  // 小节头必须以 2.0s 为周期
  assert.equal(grid.downbeats[0], 0);
  assert.equal(grid.downbeats[1], 2.0);
  assert.equal(grid.downbeats[2], 4.0);

  // 高潮 Drop 点必须落在小节强拍上
  assert.ok(grid.downbeats.includes(grid.dropSec), `Drop ${grid.dropSec} must be a downbeat`);
});

test('solveBeatAlignment aligns P0 hits and calculates scoreSync', () => {
  const grid = analyzeMusicGrid(30.0, { nominalBpm: 120 });

  const hits: VisualHit[] = [
    { id: 'logoDrop', sec: 21.8, filmSec: 21.8, priority: 'P0', want: 'drop' },
    { id: 'cardIn', sec: 6.0, filmSec: 6.0, priority: 'P1', want: 'downbeat' },
    { id: 'clickPulse', sec: 10.5, filmSec: 10.5, priority: 'P2', want: 'beat' },
  ];

  // 模拟终章的弹性区：hold 档 (e=1, 上限 30% / +2.0s)
  const zones = [
    { name: 'climaxZone', kind: 'hold' as const, fromSec: 20.0, toSec: 25.0 },
  ];

  const report = solveBeatAlignment(hits, grid, zones, 30);

  assert.equal(report.totalHits, 3);
  assert.ok(report.matchedCount >= 2, `Should match at least 2 hits: ${report.matchedCount}`);
  assert.ok(report.scoreSync > 100, `P0 match should bring score > 100, got: ${report.scoreSync}`);

  // knots 样条锚点必须单调递增
  for (let i = 0; i < report.knots.length - 1; i++) {
    assert.ok(report.knots[i].outer <= report.knots[i + 1].outer, 'Outer knots must be monotonic');
    assert.ok(report.knots[i].inner <= report.knots[i + 1].inner, 'Inner knots must be monotonic');
  }
});

test('findNearestZeroCrossing locates sign change in waveform', () => {
  const samples = new Float32Array([-0.8, -0.4, -0.1, 0.2, 0.6, 0.9]);
  const crossing = findNearestZeroCrossing(samples, 1, 3);
  // 在 index 2 和 3 之间有负到正的跳变
  assert.equal(crossing, 2);
});

test('spliceAudioWithCrossfade preserves continuous signal energy without click', () => {
  const partA = new Float32Array(4800).fill(0.5);
  const partB = new Float32Array(4800).fill(0.5);

  const spliced = spliceAudioWithCrossfade(partA, partB, 12);
  assert.ok(spliced.length < 9600, 'Crossfade overlaps fade duration');

  // 等功率交叉淡化中点振幅为 0.5 * sqrt(2) ≈ 0.707
  const midIdx = partA.length - Math.round((12 / 1000) * 48000 / 2);
  assert.ok(Math.abs(spliced[midIdx] - 0.5 * Math.SQRT2) < 0.05, `Spliced middle value is ${spliced[midIdx]}`);
});
