import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ElasticSolver,
  ZONE_SPECS,
  roundToFrames,
  splitZonesAt,
  validateZones,
  resolveZones,
} from '../../scripts/sync/zones.js';

describe('弹性区与位移分摊 (sync/zones)', () => {
  it('validateZones 必须揪出不相接、没盖满、区间非法三种错误', () => {
    assert.equal(validateZones([{ name: 'a', kind: 'hold', fromSec: 0, toSec: 10 }], 10).valid, true);

    const gap = validateZones(
      [
        { name: 'a', kind: 'hold', fromSec: 0, toSec: 4 },
        { name: 'b', kind: 'hold', fromSec: 5, toSec: 10 },
      ],
      10
    );
    assert.equal(gap.valid, false);
    assert.ok(gap.errors.some((e) => e.includes('不相接')));

    const short = validateZones([{ name: 'a', kind: 'hold', fromSec: 0, toSec: 8 }], 10);
    assert.equal(short.valid, false);
    assert.ok(short.errors.some((e) => e.includes('末区')));

    const bad = validateZones([{ name: 'a', kind: 'hold', fromSec: 5, toSec: 5 }], 5);
    assert.equal(bad.valid, false);
  });

  it('resolveZones 用刚性 video 区补齐缺口，绝不默认可形变', () => {
    const zs = resolveZones([{ name: 'mid', kind: 'hold', fromSec: 4, toSec: 6 }], 10);
    assert.equal(zs.length, 3);
    assert.equal(zs[0].kind, 'video');
    assert.equal(zs[0].elasticity, 0);
    assert.equal(zs[1].kind, 'hold');
    assert.equal(zs[2].kind, 'video');
  });

  it('roundToFrames 进位不能冲破区的额度（实测 1.71 帧被进成 2 帧，形变 3.51% > 3%）', () => {
    // 两个区：A 分到 1.71 帧但额度只有 1.71 帧；B 分到 0.4 帧、额度很宽
    const fps = 30;
    const vals = [1.71 / fps, 0.4 / fps];
    const maxes = [1.71 / fps, 10 / fps];
    const out = roundToFrames(vals, vals[0] + vals[1], fps, maxes);
    assert.ok(out[0] * fps <= 1 + 1e-9, `A 被进位到 ${out[0] * fps} 帧，超过了它的额度`);
    // 多出来的那一帧挪给了有余量的 B，总和照样凑齐
    assert.equal(Math.round((out[0] + out[1]) * fps), 2);
  });

  it('roundToFrames 谁都没有额度时宁可少达成，也不越界', () => {
    const fps = 30;
    const vals = [1.6 / fps, 1.6 / fps];
    const out = roundToFrames(vals, vals[0] + vals[1], fps, vals);
    assert.ok(out.every((v, i) => v <= vals[i] + 1e-9));
    assert.equal(Math.round((out[0] + out[1]) * fps), 2, '目标 3 帧，额度只够 2 帧');
  });

  it('roundToFrames 取整后总和必须等于 round(D·fps)', () => {
    const vals = [0.0137, 0.0411, 0.0072, 0.0280];
    const total = vals.reduce((a, c) => a + c, 0);
    const out = roundToFrames(vals, total, 30);
    const frames = out.reduce((a, c) => a + Math.round(c * 30), 0);
    assert.equal(frames, Math.round(total * 30));
  });

  it('splitZonesAt 按长度份额继承绝对上限，不会「切得越碎预算越大」', () => {
    const parts = splitZonesAt([{ name: 'z', kind: 'hold', fromSec: 0, toSec: 10 }], [2, 6]);
    assert.equal(parts.length, 3);
    const shareSum = parts.reduce((a, p) => a + (p.capShare ?? 1), 0);
    assert.ok(Math.abs(shareSum - 1) < 1e-9, `份额之和应为 1，实际 ${shareSum}`);
  });

  it('distribute 按 e·L 比例分摊：hold 吃掉绝大部分，motion 只吃一点', () => {
    const solver = new ElasticSolver(
      [
        { name: 'hold', kind: 'hold', fromSec: 0, toSec: 5 },
        { name: 'motion', kind: 'motion', fromSec: 5, toSec: 10 },
      ],
      10
    );
    const res = solver.allocate(10, 0.5, 30);
    assert.equal(res.reason, null, '预算应当足够');

    const hold = solver.zones.find((z) => z.kind === 'hold');
    const motion = solver.zones.find((z) => z.kind === 'motion');
    assert.ok(hold && motion);
    assert.ok(hold.delta > motion.delta, `hold ${hold.delta} 应多于 motion ${motion.delta}`);
    // motion 上限 = min(3%·5s, 1.0s) = 0.15s
    assert.ok(motion.delta <= ZONE_SPECS.motion.ratioCap * 5 + 1e-9);
    assert.ok(Math.abs(solver.cumulativeAt(10) - 0.5) < 1 / 30);
  });

  it('刚性区一帧不动：全 video 区时 allocate 直接报 rigid-grid', () => {
    const solver = new ElasticSolver([{ name: 'v', kind: 'video', fromSec: 0, toSec: 10 }], 10);
    const res = solver.allocate(5, 0.4, 30);
    assert.equal(res.achievedSec, 0);
    assert.equal(res.reason, 'rigid-grid');
    assert.equal(solver.cumulativeAt(5), 0);
  });

  it('超上限会夹紧，并把原因记成 budget', () => {
    const solver = new ElasticSolver([{ name: 'm', kind: 'motion', fromSec: 0, toSec: 10 }], 10);
    // motion 上限 = min(3%·10s, 1.0s) = 0.3s，这里要 2s
    const res = solver.allocate(10, 2.0, 30);
    assert.equal(res.reason, 'budget');
    assert.ok(solver.zones[0].delta <= 0.3 + 1e-9, `应夹到 0.3s，实际 ${solver.zones[0].delta}`);
  });

  it('knots 节点落在区边界且放映时间严格递增', () => {
    const solver = new ElasticSolver(
      [
        { name: 'hold', kind: 'hold', fromSec: 0, toSec: 5 },
        { name: 'rigid', kind: 'video', fromSec: 5, toSec: 10 },
      ],
      10
    );
    solver.allocate(5, 0.3, 30);
    const knots = solver.knots();
    assert.deepEqual(knots.map((k) => k.inner), [0, 5, 10]);
    for (let i = 1; i < knots.length; i++) {
      assert.ok(knots[i].outer > knots[i - 1].outer, '放映时间必须严格递增');
    }
  });
});
