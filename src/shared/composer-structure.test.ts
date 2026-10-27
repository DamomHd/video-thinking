import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateStructuredScoreAbc, abcNote } from '../../scripts/composer/structure.js';
import { parseAbc } from '../../scripts/composer/abc.js';
import { renderScoreToPcm, generateFilmScoreAbc } from '../../scripts/composer/engine.js';
import { coverageFromDb } from '../../scripts/guard/music-coverage.js';

/**
 * 本地作曲：按段长与高潮生成「铺满全程、有律动」的谱
 *
 * 2026-10-25 的事故：旧引擎不看段长和高潮，60 秒的段只写了 23 秒的谱、没有鼓；
 * 守门只看文件时长，没拦住。这组测试守的就是那几条。
 */
describe('结构化配乐谱 (composer/structure)', () => {
  it('ABC 音名：60=C，72=c，48=C,，36=C,,', () => {
    assert.equal(abcNote(60), 'C');
    assert.equal(abcNote(72), 'c');
    assert.equal(abcNote(84), "c'");
    assert.equal(abcNote(48), 'C,');
    assert.equal(abcNote(36), 'C,,');
    assert.throws(() => abcNote(61));
  });

  it('谱子铺满段长，高潮小节头正好落在 dropSec（速度在 ±8% 内微调）', () => {
    const s = generateStructuredScoreAbc({ bpm: 100, totalSec: 40, dropSec: 30.5 });
    const score = parseAbc(s.abc);
    const secPerBeat = 60 / score.bpm;
    assert.ok(score.totalBeats * secPerBeat >= 40, `谱长 ${(score.totalBeats * secPerBeat).toFixed(2)}s 不足 40s`);
    const hit = score.cues.find((c) => c.type === 'hit')!;
    assert.ok(Math.abs(hit.beat * secPerBeat - 30.5) < 0.01, `hit 落在 ${(hit.beat * secPerBeat).toFixed(3)}s`);
    assert.ok(Math.abs(s.bpm / 100 - 1) <= 0.08);
  });

  it('解析器读得到小数速度（只读整数会让 hit 漂掉）', () => {
    assert.equal(parseAbc('X:1\nQ:1/4=85.18\nK:C\nC4 |').bpm, 85.18);
  });

  it('有鼓组，而且从前奏之后就一直有脉冲（八分踩镲 + 底鼓）', () => {
    const s = generateStructuredScoreAbc({ bpm: 100, totalSec: 40, dropSec: 30 });
    const score = parseAbc(s.abc);
    const drums = new Set(Object.values(score.voices).filter((v) => v.role === 'drums').map((v) => v.id));
    const hits = score.events.filter((e) => drums.has(e.voice));
    assert.ok(hits.some((e) => e.midi === 36), '没有底鼓');
    assert.ok(hits.some((e) => e.midi === 38), '没有军鼓');
    assert.ok(hits.some((e) => e.midi === 41), '没有踩镲');
    // 第 4 小节（前奏之后）到高潮前，每个小节都有鼓
    for (let bar = 4; bar < s.dropBar - 1; bar++) {
      assert.ok(hits.some((e) => e.beat >= bar * 4 && e.beat < bar * 4 + 4), `第 ${bar} 小节没有鼓`);
    }
  });

  it('没给高潮时放在 70% 处；高潮离段尾太近时不越界', () => {
    const a = generateStructuredScoreAbc({ bpm: 120, totalSec: 30 });
    assert.ok(Math.abs(a.dropAtSec / 30 - 0.7) < 0.1);
    const b = generateStructuredScoreAbc({ bpm: 120, totalSec: 30, dropSec: 29.9 });
    assert.ok(b.dropBar < b.bars);
  });

  it('引擎：非专属片一律走结构化谱，并且把段长和高潮传进去', () => {
    const abc = generateFilmScoreAbc('some-new-film', 100, 40, 30);
    assert.match(abc, /role=drums/);
    const score = parseAbc(abc);
    assert.ok(score.totalBeats * (60 / score.bpm) >= 40);
  });
});

describe('配乐覆盖率守门 (guard/music-coverage)', () => {
  it('统计静音占比、段尾空档、最长空档', () => {
    const db = [...Array(100).fill(-20), ...Array(50).fill(-80), ...Array(100).fill(-20), ...Array(300).fill(-90)];
    const st = coverageFromDb(db, 0.01);
    assert.ok(Math.abs(st.silentRatio - 350 / 550) < 1e-9);
    assert.ok(Math.abs(st.trailingSilenceSec - 3) < 1e-9);
    assert.ok(Math.abs(st.longestGapSec - 3) < 1e-9);
  });

  it('端到端：结构化谱渲成音频后，段内静音远低于 15%，段尾不空', () => {
    const s = generateStructuredScoreAbc({ bpm: 110, totalSec: 20, dropSec: 14 });
    const pcm = renderScoreToPcm(s.abc, { durationSec: 20 });
    const HOP = Math.round(48000 * 0.01);
    const db: number[] = [];
    for (let i = 0; i + HOP <= pcm.L.length; i += HOP) {
      let e = 0;
      for (let j = 0; j < HOP; j++) e += pcm.L[i + j] * pcm.L[i + j];
      db.push(10 * Math.log10(e / HOP + 1e-12));
    }
    const st = coverageFromDb(db.slice(0, Math.round(18 / 0.01))); // 去掉 2s 淡出区
    assert.ok(st.silentRatio < 0.05, `静音 ${(st.silentRatio * 100).toFixed(1)}%`);
    assert.ok(st.trailingSilenceSec < 0.5);
  });
});
