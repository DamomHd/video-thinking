import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { profileFor, detectHardware, HwInfo } from '../../scripts/hw/profile.js';

/**
 * 硬件档位：同一套代码在 Intel 上降档、在 M 系列上用满。
 * 测的是「档位 → 缺省参数」这张表，以及 VW_HW_TIER 强制档位。
 */
const base: HwInfo = { tier: 'intel', arch: 'x64', cpus: 8, memGB: 16, gpu: 'Intel Iris Plus Graphics', forced: false };

describe('硬件档位 (scripts/hw/profile)', () => {
  it('Apple Silicon：GPU Cycles、高采样、2× 超采样、Blender 机身', () => {
    const p = profileFor({ ...base, tier: 'apple', arch: 'arm64', cpus: 12, memGB: 24 });
    assert.equal(p.blender.device, 'GPU');
    assert.ok(p.blender.samples >= 128);
    assert.equal(p.render.ssaa, 2);
    assert.equal(p.phoneBody, 'blender');
    assert.ok(p.render.concurrency >= 6);
  });

  it('Apple Silicon 内存小于 16GB 时不开超采样（4K 截帧每页多吃约 4 倍显存）', () => {
    assert.equal(profileFor({ ...base, tier: 'apple', arch: 'arm64', memGB: 8 }).render.ssaa, 1);
  });

  it('Intel：CPU Cycles、低采样、不开超采样、three.js 机身、长任务要确认', () => {
    const p = profileFor(base);
    assert.equal(p.blender.device, 'CPU');
    assert.ok(p.blender.samples <= 32);
    assert.equal(p.render.ssaa, 1);
    assert.equal(p.phoneBody, 'three');
    assert.ok(p.blender.confirmAboveMin <= 30);
    assert.ok(p.render.concurrency <= 4);
  });

  it('VW_HW_TIER 可强制档位（在 Intel 上预演 M 系列参数）', () => {
    assert.equal(detectHardware({ VW_HW_TIER: 'apple' }).tier, 'apple');
    assert.equal(detectHardware({ VW_HW_TIER: 'intel' }).tier, 'intel');
  });
});
