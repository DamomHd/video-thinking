import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roughPaths, boilSeed } from '../components/sketch/Rough.js';

/**
 * 手绘图元：确定性是底线 —— 并发渲染的每个标签页要画出同一笔。
 */
describe('手绘图元 (sketch/Rough)', () => {
  const rect = { kind: 'rect' as const, x: 10, y: 10, w: 200, h: 120 };

  it('同一 seed 两次生成完全相同', () => {
    assert.deepEqual(roughPaths(rect, { seed: 7 }), roughPaths(rect, { seed: 7 }));
  });

  it('换 seed 线条不同（boil 才有颤动）', () => {
    assert.notDeepEqual(roughPaths(rect, { seed: 7 })[0].d, roughPaths(rect, { seed: 8 })[0].d);
  });

  it('boilSeed：按频率分段换 seed；0 频率不变', () => {
    assert.equal(boilSeed(5, 0.0, 8), 5);
    assert.equal(boilSeed(5, 0.124, 8), 5);
    assert.equal(boilSeed(5, 0.125, 8), 6);
    assert.equal(boilSeed(5, 3.7, 0), 5);
  });

  it('各种形状都能出路径；填充会单独出一条带 fill 的路径', () => {
    for (const shape of [
      rect,
      { kind: 'ellipse' as const, cx: 100, cy: 100, w: 80, h: 50 },
      { kind: 'line' as const, x1: 0, y1: 0, x2: 100, y2: 40 },
      { kind: 'linear' as const, points: [[0, 0], [50, 30], [100, 0]] as [number, number][] },
      { kind: 'polygon' as const, points: [[0, 0], [50, 80], [100, 0]] as [number, number][] },
      { kind: 'path' as const, d: 'M 0 0 C 40 80, 80 -40, 120 40' },
    ]) {
      const out = roughPaths(shape, { seed: 1 });
      assert.ok(out.length > 0 && out.every((p) => p.d.length > 0), shape.kind);
    }
    const filled = roughPaths(rect, { seed: 1, fill: '#f00', fillStyle: 'solid' });
    assert.ok(filled.some((p) => p.fill === '#f00'));
  });
});
