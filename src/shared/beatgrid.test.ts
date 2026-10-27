import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeBeatGrid, resolveShots } from './beatgrid.js';
import { knotMap } from './warp.js';
import { outerOf } from './warp.js';

describe('拍网格 (shared/beatgrid)', () => {
  it('BEAT / BAR 由 bpm 推出，beat(n) / bar(m) 以 DROP 为原点', () => {
    const g = makeBeatGrid({ dropSec: 10, bpm: 120 });
    assert.equal(g.BEAT, 0.5);
    assert.equal(g.BAR, 2);
    assert.equal(g.beat(0), 10);
    assert.equal(g.beat(4), 12);
    assert.equal(g.beat(-8), 6);
    assert.equal(g.bar(1), 12);
    assert.equal(g.bar(-2), 6);
  });

  it('beatOf 是 beat 的逆；snapBeat / snapBar 吸附到最近的格', () => {
    const g = makeBeatGrid({ dropSec: 10, bpm: 120 });
    assert.ok(Math.abs(g.beatOf(g.beat(7)) - 7) < 1e-9);
    assert.equal(g.snapBeat(11.2), 11.0);   // 11.2 最近的拍是 11.0
    assert.equal(g.snapBeat(11.3), 11.5);
    assert.equal(g.snapBar(11.2), 12);      // 最近的小节头
  });

  it('换配乐只改 bpm / drop，镜头按拍号自动挪位', () => {
    const a = makeBeatGrid({ dropSec: 10, bpm: 120 });
    const b = makeBeatGrid({ dropSec: 14, bpm: 90 });
    // 同一个拍号在两套网格下都落在各自的整拍上
    // （BEAT 常是无理数，所以按容差比；1e-9 拍远小于一帧）
    for (const n of [-16, -8, 0, 12, 32]) {
      assert.ok(Math.abs(a.beatOf(a.beat(n)) - n) < 1e-9, `120bpm 下第 ${n} 拍往返失真`);
      assert.ok(Math.abs(b.beatOf(b.beat(n)) - n) < 1e-9, `90bpm 下第 ${n} 拍往返失真`);
    }
    // 第 32 拍的绝对秒数随 bpm 变化
    assert.notEqual(a.beat(32), b.beat(32));
  });

  it('resolveShots 按入点排序、算出时长，并揪出非正时长与重复 id', () => {
    const ok = resolveShots([
      { id: 'b', label: 'B', fromSec: 4, toSec: 8 },
      { id: 'a', label: 'A', fromSec: 0, toSec: 4 },
    ]);
    assert.deepEqual(ok.shots.map((s) => s.id), ['a', 'b']);
    assert.equal(ok.shots[0].durSec, 4);
    assert.equal(ok.totalSec, 8);
    assert.equal(ok.errors.length, 0);

    const bad = resolveShots([
      { id: 'x', label: 'X', fromSec: 2, toSec: 2 },
      { id: 'x', label: 'X2', fromSec: 3, toSec: 5 },
    ]);
    assert.ok(bad.errors.some((e) => e.includes('时长非正')));
    assert.ok(bad.errors.some((e) => e.includes('id 重复')));
  });

  it('resolveShots 保留调用方自己的镜头字段（泛型不丢信息）', () => {
    const r = resolveShots([
      { id: 'a', label: 'A', fromSec: 0, toSec: 2, kind: 'reuse' as const, sceneId: 'galaxy' },
    ]);
    assert.equal(r.shots[0].kind, 'reuse');
    assert.equal(r.shots[0].sceneId, 'galaxy');
    assert.equal(r.shots[0].durSec, 2);
  });
});

describe('复用镜头的时间重映射与反解 (warp + outerOf)', () => {
  it('knotMap 正向过节点；outerOf 反解回同一个外部时间', () => {
    // 把正片幕内 1.8s 钉到镜头内 0s，幕内 9.4s 钉到镜头内 8.889s
    const knots = [
      { outer: 0, inner: 1.8 },
      { outer: 4.444, inner: 5.2 },
      { outer: 8.889, inner: 9.4 },
    ];
    const map = knotMap(knots);

    for (const k of knots) {
      assert.ok(Math.abs(map(k.outer) - k.inner) < 1e-6, `节点 ${k.outer} 应映射到 ${k.inner}`);
    }

    // 反解：给幕内时刻，求镜头内时刻
    for (const k of knots) {
      const back = outerOf(map, k.inner, [0, 8.889]);
      assert.ok(Math.abs(back - k.outer) < 1e-3, `反解 ${k.inner} 应得到 ${k.outer}，实得 ${back}`);
    }
  });

  it('映射严格单调，不会让复用镜头里的时间倒流', () => {
    const map = knotMap([
      { outer: 0, inner: 0.2 },
      { outer: 1.111, inner: 1.0 },
      { outer: 2.222, inner: 6.4 },
    ]);
    let prev = -Infinity;
    for (let t = 0; t <= 2.222; t += 0.02) {
      const v = map(t);
      assert.ok(v >= prev - 1e-9, `t=${t.toFixed(2)} 处时间倒流: ${prev} → ${v}`);
      prev = v;
    }
  });

  it('镜头常量一改，反解出来的音效时刻跟着挪（不是手填的秒数）', () => {
    const mk = (pin: number) =>
      knotMap([
        { outer: 0, inner: 0 },
        { outer: pin, inner: 1.2 },
        { outer: 2.0, inner: 6.8 },
      ]);
    const a = outerOf(mk(0.5), 1.2, [0, 2.0]);
    const b = outerOf(mk(1.2), 1.2, [0, 2.0]);
    assert.ok(Math.abs(a - 0.5) < 1e-3);
    assert.ok(Math.abs(b - 1.2) < 1e-3);
    assert.notEqual(Math.round(a * 100), Math.round(b * 100));
  });
});
