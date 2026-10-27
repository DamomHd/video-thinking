import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dbToLinear,
  linearToDb,
  calcPlanVolume,
  gainOf,
  fadeAt,
  equalPowerCrossfade,
  duckAt,
} from './audio-math';
import { MixFile } from './types';

test('dbToLinear & linearToDb bidirectional conversion', () => {
  assert.equal(Math.round(dbToLinear(0)), 1);
  assert.equal(Math.round(dbToLinear(-6) * 100) / 100, 0.5);
  assert.equal(Math.round(linearToDb(1)), 0);
  assert.equal(Math.round(linearToDb(0.5)), -6);
});

test('calcPlanVolume normalizes peak to -6 dBFS', () => {
  // 当素材峰值为 0 dBFS 时，衰减到 -6 dBFS (倍率约 0.501)
  const vol = calcPlanVolume('WHOOSH', 0, 1.0);
  assert.ok(vol >= 0.24 && vol <= 0.26, `Actual vol: ${vol}`);
});

test('gainOf calculates product of itemDb, layerDb, masterDb', () => {
  const mix: MixFile = {
    layers: {
      MUSIC: 0,
      BG: 0,
      TEX: 0,
      RISER: 0,
      WHOOSH: -6, // 层衰减 -6 dB
      IMPACT: 0,
      UI: 0,
    },
    muted: ['BG'],
    master: 0,
  };
  // 1. BG 被 mute，增益必为 0
  assert.equal(gainOf('bgLoop', 'BG', {}, mix), 0);
  // 2. WHOOSH 层 -6dB, itemDb 为 0 时，结果约为 0.5
  const g = gainOf('item1', 'WHOOSH', {}, mix);
  assert.ok(Math.abs(g - 0.5) < 0.01, `Actual g: ${g}`);
});

test('equalPowerCrossfade maintains energy conservation (cos^2 + sin^2 = 1)', () => {
  for (let p = 0; p <= 1; p += 0.1) {
    const { outGain, inGain } = equalPowerCrossfade(p);
    const sum = outGain * outGain + inGain * inGain;
    assert.ok(Math.abs(sum - 1.0) < 1e-6, `Sum of squares at ${p} is ${sum}`);
  }
});

test('duckAt applies ducking floor and smooth linear recovery', () => {
  const triggers = [
    {
      triggerStartSec: 10.0,
      spec: {
        db: -6, // 降到 0.5
        preSec: 0.5,
        holdSec: 1.0,
        releaseSec: 0.5,
        layers: ['MUSIC' as const],
      },
    },
  ];

  // 1. 触发前（9.0s）：未受影响
  assert.equal(duckAt(9.0, 'MUSIC', triggers), 1.0);
  // 2. 提前下潜中点（9.75s）：增益约 0.75
  assert.ok(Math.abs(duckAt(9.75, 'MUSIC', triggers) - 0.75) < 0.02);
  // 3. 最深保持期（10.5s）：增益为 0.5
  assert.ok(Math.abs(duckAt(10.5, 'MUSIC', triggers) - 0.5) < 0.01);
  // 4. 恢复完毕后（12.5s）：恢复到 1.0
  assert.equal(duckAt(12.5, 'MUSIC', triggers), 1.0);
});
