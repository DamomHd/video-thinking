import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipEvents, ClipSpec, CLIP_GRAMMARS } from './clip.js';
import { uncoveredEvents, autoSpots, SoundMap } from './events.js';
import fs from 'node:fs';

const MAP: SoundMap = {
  land: { slot: 'L', layer: 'UI', pitched: true }, pop: { slot: 'P', layer: 'UI', pitched: true }, count: { slot: 'C', layer: 'IMPACT' },
  focus: { slot: 'F', layer: 'WHOOSH' }, morph: { slot: 'M', layer: 'WHOOSH' }, draw: { slot: 'D', layer: 'RISER' }, reveal: { slot: 'R', layer: 'RISER' },
  stamp: { slot: 'S', layer: 'IMPACT' }, hero: { slot: 'H', layer: 'IMPACT' }, tick: { slot: 'T', layer: 'UI' },
};

test('clipEvents：提示点 → 动作事件；时刻乘 pace、加片段在全片里的起点；number 提前 0.8s 开始滚', () => {
  const spec: ClipSpec = { grammar: 'y5_kinetic_type', duration: 8, pace: 2, cues: [
    { at: 0, kind: 'title', text: 'A' }, { at: 1, kind: 'point', text: 'B' }, { at: 2, kind: 'point', text: 'C' }, { at: 3, kind: 'number', data: { value: 42 } },
  ] };
  const ev = clipEvents(spec, { offsetSec: 10 });
  assert.equal(ev.length, 4);
  assert.deepEqual([ev[0].kind, ev[0].at, ev[0].land], ['reveal', 10, 10.6]);
  assert.deepEqual([ev[1].kind, ev[1].at, ev[1].index, ev[1].of], ['pop', 12, 0, 2]);
  assert.deepEqual([ev[2].at, ev[2].index], [14, 1]);
  assert.deepEqual([ev[3].kind, ev[3].at, ev[3].land, ev[3].count?.to], ['count', 15.2, 16, 42]);
});

test('clipEvents：sfx:false 与认不出的类型记为留白（写明理由）；片长之后的提示点丢掉', () => {
  const spec: ClipSpec = { grammar: 't1_3b1b', duration: 5, cues: [{ at: 1, kind: 'point', sfx: false }, { at: 2, kind: 'weird' }, { at: 9, kind: 'point' }] };
  const ev = clipEvents(spec);
  assert.equal(ev.length, 2);
  assert.match(ev[0].silent ?? '', /sfx: false/);
  assert.match(ev[1].silent ?? '', /weird/);
});

test('7 个画法的探针示例数据：每个提示点都有声或写明留白（接 autoSpots 不漏）', () => {
  for (const g of Object.keys(CLIP_GRAMMARS)) {
    const spec = JSON.parse(fs.readFileSync(`src/probe/clip-specs/${g}.json`, 'utf-8')) as ClipSpec;
    const ev = clipEvents(spec);
    assert.ok(ev.length > 0, g);
    assert.deepEqual(uncoveredEvents(ev, autoSpots(ev, MAP)), [], `${g} 有提示点没配上声`);
  }
});
