import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planWash, blobShape, inkAt, deformPolygon } from './watercolor.js';
import { createRng } from './anim.js';

describe('水彩 / 水墨 (shared/watercolor)', () => {
  it('同一 seed 的水彩层完全相同；换 seed 不同', () => {
    const s = blobShape([0, 0], 100);
    assert.deepEqual(planWash(s, { seed: 3 }), planWash(s, { seed: 3 }));
    assert.notDeepEqual(planWash(s, { seed: 3 }).layers[0].pts, planWash(s, { seed: 4 }).layers[0].pts);
  });

  it('形变每深一层点数翻倍；毛糙度越大轮廓偏离越大', () => {
    const base: [number, number, number][] = blobShape([0, 0], 100, 8).map((p) => [p[0], p[1], 0.1]);
    assert.equal(deformPolygon(base, 3, createRng(1)).length, 8 * 8);
    const spread = (v: number) => {
      const pts = deformPolygon(blobShape([0, 0], 100, 8).map((p) => [p[0], p[1], v]), 3, createRng(1));
      const rs = pts.map((p) => Math.hypot(p[0], p[1]));
      return Math.max(...rs) - Math.min(...rs);
    };
    assert.ok(spread(0.3) > spread(0.05));
  });

  it('层的生长系数在 [0.6, 1.2]：外圈慢、内圈快', () => {
    for (const l of planWash(blobShape([0, 0], 100), { seed: 9 }).layers) assert.ok(l.growth >= 0.6 && l.growth <= 1.2);
  });

  it('水墨：进度 0 没有墨；中心先有墨、远处后有；同一位置同一进度结果恒定', () => {
    assert.equal(inkAt(0, 0, [0, 0], 100, 0), 0);
    assert.ok(inkAt(0, 0, [0, 0], 100, 0.3) > 0.5);
    assert.equal(inkAt(95, 0, [0, 0], 100, 0.3), 0);
    assert.equal(inkAt(40, 10, [0, 0], 100, 0.6, { seed: 'x' }), inkAt(40, 10, [0, 0], 100, 0.6, { seed: 'x' }));
    assert.ok(inkAt(300, 0, [0, 0], 100, 1) === 0, '扩散有边界');
  });
});
