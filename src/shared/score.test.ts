import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreGrid, defineScore, scoreEvents, offGridHits, filmMoments } from './score';

const SPEC = { bpm: 120, key: '8B', startSec: 0.5, sections: [{ id: 'intro', bars: 2 }, { id: 'drop', bars: 4 }] };

describe('配乐网格先行 score', () => {
  it('网格：拍长、小节长、段起止、段内定位', () => {
    const g = scoreGrid(SPEC);
    assert.equal(g.beatSec, 0.5);
    assert.equal(g.barSec, 2);
    assert.deepEqual(g.section('drop'), { start: 4.5, end: 12.5, bars: 4, firstBar: 2 });
    assert.equal(g.sec('drop', 1, 2), 7.5);
    assert.equal(g.at(0), 0.5);
    assert.equal(g.endSec, 12.5);
    assert.throws(() => g.section('nope'), /没有段 nope/);
  });

  it('拍网格和 shared/beats 同一种：拍数、小节头', () => {
    const bg = scoreGrid(SPEC).beatGrid();
    assert.equal(bg.beats.length, 24);
    assert.deepEqual(bg.downbeats.slice(0, 3), [0.5, 2.5, 4.5]);
    assert.equal(bg.beatSec, 0.5);
  });

  it('调内音：C 大调 / A 小调的音级、跨八度、三和弦', () => {
    const c = scoreGrid(SPEC);
    assert.equal(c.degree(0), 60); // C4
    assert.equal(c.degree(2), 64); // E4
    assert.equal(c.degree(7), 72); // 上一个八度的 C
    assert.equal(c.degree(-1), 59); // B3
    assert.deepEqual(c.triad(4), [67, 71, 74]); // G B D
    const a = scoreGrid({ ...SPEC, key: '8A' });
    assert.equal(a.degree(0, 3), 57); // A3
    assert.equal(a.degree(2, 3), 60); // C4（小三度）
  });

  it('参数错误要报', () => {
    assert.throws(() => scoreGrid({ ...SPEC, bpm: 0 }), /bpm/);
    assert.throws(() => scoreGrid({ ...SPEC, sections: [{ id: 'a', bars: 1 }, { id: 'a', bars: 1 }] }), /重复/);
  });

  it('scoreEvents：排序、夹住力度和声像、越界的音报出来；时长 = 网格 + 尾巴', () => {
    const def = defineScore({
      grid: SPEC,
      notes: (g) => [
        { t: g.sec('drop'), inst: 'piano', pitch: g.degree(0), dur: 1, vel: 2 },
        { t: g.sec('intro'), inst: 'synth:pad', pitch: 'C3', dur: 4, pan: -3 },
        { t: 99, inst: 'piano', pitch: 60 },
        { t: 1, inst: '', pitch: 60 },
      ],
    });
    const r = scoreEvents(def);
    assert.equal(r.durSec, 14.5);
    assert.deepEqual(r.notes.map((n) => n.inst), ['synth:pad', 'piano']);
    assert.equal(r.notes[1].vel, 1);
    assert.equal(r.notes[0].pan, -1);
    assert.equal(r.problems.length, 2);
  });

  it('offGridHits：小节头 / 拍 / 四分之一拍三档，容差 1 帧', () => {
    const g = scoreGrid(SPEC);
    const off = offGridHits(
      [
        { id: '落版', sec: 4.5, want: 'drop' },
        { id: '偏一点', sec: 4.52, want: 'downbeat' },
        { id: '拍上', sec: 3.0, want: 'beat' },
        { id: '不在小节头', sec: 3.0, want: 'downbeat' },
        { id: '十六分', sec: 3.125, want: 'any' },
      ],
      g,
      30
    );
    assert.deepEqual(off.map((o) => [o.id, o.errMs]), [['不在小节头', 500]]);
  });
});

test('画面先行：g.hit 取画面时刻（动作事件取落定时刻、同名时优先）；没有的 id 报错并列出有哪些', () => {
  const moments = filmMoments([{ id: 'P0.title', sec: 12.4 }, { id: 'K.lock', sec: 3 }], [{ id: 'K.lock', at: 2.6, land: 3.1 }, { id: 'pen', at: 5 }]);
  assert.deepEqual(moments, { 'P0.title': 12.4, 'K.lock': 3.1, pen: 5 });
  const def = defineScore({
    grid: { bpm: 90, key: '10A', sections: [{ id: 'all', bars: 8 }], lock: false },
    notes: (g) => [{ t: g.hit('P0.title'), inst: 'piano', pitch: g.degree(0, 3) }, { t: g.hit('pen'), inst: 'glass', pitch: 'D6' }],
  });
  const r = scoreEvents(def, moments);
  assert.deepEqual(r.notes.map((n) => n.t), [5, 12.4]);
  assert.equal(r.notes[1].pitch, 59); // 10A = B 小调，g.degree(0, 3) = B3
  assert.throws(() => scoreEvents(defineScore({ ...def, notes: (g) => [{ t: g.hit('nope'), inst: 'piano' }] }), moments), /没有时刻 nope.*P0\.title/);
});
