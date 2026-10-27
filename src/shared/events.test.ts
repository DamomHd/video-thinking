import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countTicks, autoSpots, uncoveredEvents, eventGroup, MotionEvent, SoundMap } from './events.js';
import { layeredRoleOf } from '../../scripts/composer/layered.js';

const MAP: SoundMap = {
  land: { slot: 'card', layer: 'UI', pitched: true },
  reveal: { slot: 'swell', layer: 'TEX' },
  stamp: { slot: 'stamp', layer: 'IMPACT' },
  hero: { slot: 'hero', layer: 'IMPACT' },
  tick: { slot: 'tick', layer: 'UI' },
  preHit: { slot: 'pre', layer: 'RISER', leadSec: 0.6 },
};

describe('动作事件 → 自动配声 (shared/events)', () => {
  it('数字滚动的咔哒：跟着滚动曲线前密后疏，全部落在滚动区间内', () => {
    const ticks = countTicks(10, 2, 12);
    assert.equal(ticks.length, 12);
    assert.ok(ticks.every((t) => t >= 10 && t <= 12));
    const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
    assert.ok(gaps[0] < gaps[gaps.length - 1], `前密后疏: ${gaps[0]} vs ${gaps[gaps.length - 1]}`);
  });

  it('数字滚动生成一串咔哒；落定事件按组内序号走调内音高；重拍前加反向吸气', () => {
    const evs: MotionEvent[] = [
      { id: '计数', kind: 'count', at: 5, end: 7, count: { from: 0, to: 652445 } },
      ...eventGroup('卡片', 'land', [1, 1.5, 2]),
      { id: '落版', kind: 'hero', at: 9, land: 10 },
    ];
    const spots = autoSpots(evs, MAP, { key: '8B' });
    assert.ok(spots.filter((s) => s.id.startsWith('计数 · 咔哒')).length >= 8);
    assert.deepEqual(spots.filter((s) => s.id.startsWith('卡片')).map((s) => s.pitchSemis), [3, 5, 7]);
    const pre = spots.find((s) => s.id === '落版 · 吸气')!;
    assert.equal(pre.toSec, 10);
    assert.ok(Math.abs(pre.fromSec - 9.4) < 1e-9);
  });

  it('渐显这类持续动作：声音铺满动作区间', () => {
    const [s] = autoSpots([{ id: '图片浮现', kind: 'reveal', at: 3, end: 4 }], MAP);
    assert.deepEqual([s.fromSec, s.toSec], [3, 4]);
  });

  it('覆盖对账：没声又没写留白理由的事件报出来；写了 silent 的放行', () => {
    const evs: MotionEvent[] = [
      { id: '有声', kind: 'stamp', at: 1 },
      { id: '漏了', kind: 'morph', at: 2 }, // 映射表里没有 morph
      { id: '留白', kind: 'focus', at: 3, silent: '标题聚焦是安静的动作' },
    ];
    const spots = autoSpots(evs, MAP);
    assert.deepEqual(uncoveredEvents(evs, spots).map((e) => e.id), ['漏了']);
  });

  it('分层音色：tags 写 layered + 角色词才启用', () => {
    assert.equal(layeredRoleOf('layered, card-land, soft'), 'card-land');
    assert.equal(layeredRoleOf('card-land'), null);
    assert.equal(layeredRoleOf('layered, nothing'), null);
  });
});
