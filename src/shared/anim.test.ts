import test from 'node:test';
import assert from 'node:assert/strict';
import {
  spring,
  camOut,
  camInOut,
  tw,
  env,
  rowIn,
  cardIn,
  lerpLog,
  countUp,
} from './anim';

test('spring physics oscillator settles asymptotically to 1.0 without drift', () => {
  // t <= 0 时为 0
  assert.equal(spring(0), 0);
  assert.equal(spring(-1), 0);

  // t 逐步增加，测试弹性收敛
  const valAt02 = spring(0.2);
  assert.ok(valAt02 > 0.5, `Spring at 0.2s should move forward: ${valAt02}`);

  // 在充分时间后 (如 2.5s)，阻尼弹簧必然完全静止收敛于 1.0
  const valAtSettled = spring(2.5);
  assert.ok(Math.abs(valAtSettled - 1.0) < 0.005, `Spring should settle near 1.0: ${valAtSettled}`);
});

test('camOut produces 3.5-power ultra-smooth deceleration curve', () => {
  assert.equal(camOut(0), 0);
  assert.equal(camOut(1), 1);
  assert.equal(camOut(1.5), 1); // 越界夹取

  // 3.5 次幂镜头缓出，在 0.5 处进度应已超过 90%
  const p = camOut(0.5);
  assert.ok(p > 0.85 && p < 0.95, `camOut(0.5) is ${p}`);
});

test('tw and env provide robust normalized envelopes', () => {
  // tw(t, fromSec, toSec)
  assert.equal(tw(1.0, 2.0, 3.0), 0);
  assert.equal(tw(2.5, 2.0, 3.0), 0.5);
  assert.equal(tw(3.5, 2.0, 3.0), 1.0);

  // env(t, fromSec, toSec, fadeInSec, fadeOutSec)
  // 入场前
  assert.equal(env(0.5, 1.0, 4.0, 0.5, 0.5), 0);
  // 完全入场保持区
  assert.equal(env(2.0, 1.0, 4.0, 0.5, 0.5), 1);
  // 退场完毕后
  assert.equal(env(5.0, 1.0, 4.0, 0.5, 0.5), 0);
});

test('lerpLog maintains consistent zoom ratios across orders of magnitude', () => {
  const z0 = 100;
  const z1 = 1;
  // 对数中点应该是 sqrt(100 * 1) = 10
  const mid = lerpLog(z0, z1, 0.5);
  assert.ok(Math.abs(mid - 10) < 1e-6, `Expected 10, got ${mid}`);
});

test('cardIn provides physical scale and translateY offsets', () => {
  const cardStart = cardIn(0);
  assert.equal(cardStart.opacity, 0);
  assert.ok(cardStart.translateY > 0, 'Card should start shifted down');

  const cardEnd = cardIn(2.0); // 充分收敛
  assert.equal(cardEnd.opacity, 1);
  assert.ok(Math.abs(cardEnd.scale - 1.0) < 0.001, `Scale should settle to 1.0, got ${cardEnd.scale}`);
  assert.ok(Math.abs(cardEnd.translateY - 0) < 0.001, `TranslateY should settle to 0, got ${cardEnd.translateY}`);
});
