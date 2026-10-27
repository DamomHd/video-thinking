import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sectionBeds, bedSemis } from './beds';
import { bedFlavorOf, layeredRoleOf, synthLayered, BED_SEC } from '../../scripts/composer/layered';
import { RATE } from '../../scripts/composer/dsp';

describe('质感床 sectionBeds', () => {
  const S = [
    { id: '开场', from: 0, to: 10, slot: 'bedWarm' },
    { id: '问题', from: 10, to: 20, slot: 'bedTension' },
    { id: '暗场', from: 20, to: 26, slot: null, what: '留白' },
    { id: '收尾', from: 26, to: 40, slot: 'bedAir' },
  ];

  it('每段一条；相邻有床的段互相伸进去半个交叉淡化；邻段留白时不伸', () => {
    const s = sectionBeds(S);
    assert.deepEqual(s.map((x) => [x.id, x.fromSec, x.toSec]), [
      ['质感床 · 开场', 0, 10.6],
      ['质感床 · 问题', 9.4, 20],
      ['质感床 · 收尾', 26, 40],
    ]);
    assert.ok(s.every((x) => x.layer === 'TEX' && x.force));
  });

  it('carve 挖出真静默，床断成两截；太短的碎片不铺', () => {
    const s = sectionBeds(S, { carve: [[14, 15], [26, 26.5]] });
    const q = s.filter((x) => x.id.startsWith('质感床 · 问题'));
    assert.deepEqual(q.map((x) => [x.fromSec, x.toSec]), [[9.4, 14], [15, 20]]);
    assert.ok(!s.some((x) => x.fromSec < 26.5 && x.toSec > 26));
    assert.equal(sectionBeds([{ id: 'x', from: 0, to: 0.5, slot: 'a' }]).length, 0);
  });

  it('变调到配乐主音：取最近的八度；没给调号不变调', () => {
    assert.equal(bedSemis(undefined), 0);
    assert.equal(bedSemis('8A'), 0); // A 小调
    assert.equal(bedSemis('8B'), 3); // C 大调：A → C 上行 3
    for (const k of ['1A', '3B', '6A', '11B', '12A']) assert.ok(Math.abs(bedSemis(k)) <= 6);
    assert.ok(sectionBeds(S, { key: '8B' }).every((x) => x.pitchSemis === 3));
    assert.ok(sectionBeds(S).every((x) => x.pitchSemis === undefined));
  });

  it('BG 层（氛围床）同一套', () => {
    assert.ok(sectionBeds(S, { layer: 'BG' }).every((x) => x.layer === 'BG' && x.id.startsWith('氛围床')));
  });
});

describe('质感床音色 texture-bed', () => {
  it('tags 认角色和音色；没写音色就是 warm', () => {
    assert.equal(layeredRoleOf('layered, texture-bed, glass'), 'texture-bed');
    assert.equal(bedFlavorOf('layered, texture-bed, glass'), 'glass');
    assert.equal(bedFlavorOf('layered, texture-bed'), 'warm');
  });

  it('确定性、长度、不削波、首尾无缝（接缝处的跳变不大于正常的样本间变化）', () => {
    const a = synthLayered('texture-bed', 3, 'layered, texture-bed, low');
    const b = synthLayered('texture-bed', 3, 'layered, texture-bed, low');
    assert.deepEqual(a.L.slice(1000, 1100), b.L.slice(1000, 1100));
    assert.ok(Math.abs(a.L.length / RATE - BED_SEC) < 0.01);
    let peak = 0;
    let step = 0;
    for (let i = 0; i < a.L.length; i++) {
      peak = Math.max(peak, Math.abs(a.L[i]));
      if (i) step = Math.max(step, Math.abs(a.L[i] - a.L[i - 1]));
    }
    assert.ok(peak <= 0.51);
    assert.ok(Math.abs(a.L[0] - a.L[a.L.length - 1]) <= step);
  });
});
