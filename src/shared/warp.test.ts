import test from 'node:test';
import assert from 'node:assert/strict';
import { knotMap, rampMap, outerOf, Knot } from './warp';

test('knotMap preserves strict monotonicity and avoids overshoot', () => {
  // 定义一组非均匀甚至突变斜率的时间锚点
  const knots: Knot[] = [
    { outer: 0.0, inner: 0.0 },
    { outer: 2.0, inner: 1.5 },
    { outer: 3.0, inner: 8.0 },  // 突变高速快进
    { outer: 6.0, inner: 8.5 },  // 突变低速慢动作
    { outer: 10.0, inner: 12.0 },
  ];

  const map = knotMap(knots);

  // 1. 验证锚点值完全匹配
  for (const k of knots) {
    const val = map(k.outer);
    assert.ok(Math.abs(val - k.inner) < 1e-4, `Expected ${k.inner} at ${k.outer}, got ${val}`);
  }

  // 2. 验证插值曲线严格单调递增，绝无时间倒流
  let prevVal = map(0);
  for (let t = 0.1; t <= 10.0; t += 0.05) {
    const val = map(t);
    assert.ok(val >= prevVal, `Monotonicity violated at t=${t}: prev=${prevVal}, current=${val}`);
    prevVal = val;
  }
});

test('rampMap performs piecewise linear time mapping', () => {
  const knots: Knot[] = [
    { outer: 0.0, inner: 0.0 },
    { outer: 4.0, inner: 8.0 }, // 2x 速度
    { outer: 8.0, inner: 10.0 }, // 0.5x 速度
  ];

  const map = rampMap(knots);

  assert.equal(map(0), 0);
  assert.equal(map(2), 4);
  assert.equal(map(4), 8);
  assert.equal(map(6), 9);
  assert.equal(map(8), 10);
});

test('outerOf precisely inverts inner target time using binary search', () => {
  const knots: Knot[] = [
    { outer: 0.0, inner: 0.0 },
    { outer: 1.5, inner: 3.0 },
    { outer: 4.0, inner: 9.0 },
  ];

  const map = knotMap(knots);

  // 寻找正片中某一爆炸或音效时刻 inner = 5.2 秒在外部预告片中的精确对应时刻
  const targetInner = 5.2;
  const outerTime = outerOf(map, targetInner, [0, 4.0]);

  const mappedInner = map(outerTime);
  assert.ok(
    Math.abs(mappedInner - targetInner) < 1e-4,
    `outerOf inversion error: expected inner ${targetInner}, got ${mappedInner} at outer ${outerTime}`
  );
});
