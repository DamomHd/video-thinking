import { describe, it } from 'node:test';
import assert from 'node:assert';
import { estimateKeyFromChroma, synthesizeChordChroma, NOTE_NAMES } from '../../scripts/sync/key.js';
import { solveBeatAlignment, solveCues } from '../../scripts/sync/solve.js';
import { MusicCue, VisualHit } from './types.js';

describe('调性估计器 (sync/key - 24 调全量检验)', () => {
  it('应能准确识别全部 12 个大调的 Camelot 码 (8B, 9B, ...)', () => {
    const expectedCamelots = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
    for (let root = 0; root < 12; root++) {
      const chroma = synthesizeChordChroma(root, 'major');
      const res = estimateKeyFromChroma(chroma);
      assert.strictEqual(
        res.camelot,
        expectedCamelots[root],
        `大调识别错误: 根音 ${NOTE_NAMES[root]} 预期 ${expectedCamelots[root]} 但得到 ${res.camelot}`
      );
      assert.strictEqual(res.mode, 'major');
    }
  });

  it('应能准确识别全部 12 个小调的 Camelot 码 (5A, 12A, ...)', () => {
    const expectedCamelots = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];
    for (let root = 0; root < 12; root++) {
      const chroma = synthesizeChordChroma(root, 'minor');
      const res = estimateKeyFromChroma(chroma);
      assert.strictEqual(
        res.camelot,
        expectedCamelots[root],
        `小调识别错误: 根音 ${NOTE_NAMES[root]} 预期 ${expectedCamelots[root]} 但得到 ${res.camelot}`
      );
      assert.strictEqual(res.mode, 'minor');
    }
  });
});

describe('多段配乐对拍求解器 (sync/solve-cues)', () => {
  const dummyHits: VisualHit[] = [
    { id: 'h1', sec: 5.0, filmSec: 5.0, priority: 'P1', want: 'downbeat' },
    { id: 'h2', sec: 18.0, filmSec: 18.0, priority: 'P0', want: 'drop' },
  ];

  const singleCue: MusicCue[] = [
    {
      id: 'c1',
      label: '单段测试',
      in: { ref: 'SC.0', sec: 0 },
      out: { ref: 'SC.end', sec: 30 },
      brief: '',
      startFromSec: 0,
      volume: 0.5,
      fadeInSec: 1,
      fadeOutSec: 1,
      track: {
        id: 't1',
        title: 'T1',
        artist: 'A1',
        bpm: 120,
        file: 'test.wav',
        durationSec: 30,
        adapted: true,
      },
    },
  ];

  const mockGrid = {
    beats: Array.from({ length: 61 }, (_, i) => Number((i * 0.5).toFixed(2))),
    downbeats: Array.from({ length: 16 }, (_, i) => Number((i * 2.0).toFixed(2))),
    dropSec: 18.0,
    totalSec: 30,
    bpm: 120,
    beatSec: 0.5,
    barSec: 2.0,
    source: 'synthetic' as const,
  };

  it('单段求解时应与 solveBeatAlignment 逐字段完全一致', () => {
    const singleReport = solveBeatAlignment(dummyHits, mockGrid);
    const cueReport = solveCues(singleCue, dummyHits, () => mockGrid);

    assert.strictEqual(cueReport.scoreSync, singleReport.scoreSync);
    assert.strictEqual(cueReport.matchedCount, singleReport.matchedCount);
    assert.strictEqual(cueReport.anchors.length, singleReport.anchors.length);
  });

  it('两段配乐求解时段起点为固定节点，锚点不越段，每段合成出点锚', () => {
    const twoCues: MusicCue[] = [
      {
        id: 'c1',
        label: '第一段',
        in: { ref: 'SC.0', sec: 0 },
        out: { ref: 'SC.mid', sec: 12.0 },
        brief: '',
        startFromSec: 0,
        volume: 0.5,
        fadeInSec: 1,
        fadeOutSec: 1,
        track: {
          id: 't1',
          title: 'T1',
          artist: 'A1',
          bpm: 120,
          file: 'test1.wav',
          durationSec: 12.0,
          adapted: true,
        },
      },
      {
        id: 'c2',
        label: '第二段',
        in: { ref: 'SC.mid', sec: 12.0 },
        out: { ref: 'SC.end', sec: 30.0 },
        brief: '',
        startFromSec: 0,
        volume: 0.5,
        fadeInSec: 1,
        fadeOutSec: 1,
        track: {
          id: 't2',
          title: 'T2',
          artist: 'A2',
          bpm: 120,
          file: 'test2.wav',
          durationSec: 18.0,
          adapted: true,
        },
      },
    ];

    const rep = solveCues(twoCues, dummyHits, () => mockGrid);

    // 验证各段锚点是否在各段区间内
    const c1Anchors = rep.anchors.filter(a => a.filmSec <= 12.0);
    const c2Anchors = rep.anchors.filter(a => a.filmSec > 12.0);

    assert(c1Anchors.some(a => a.hitId === 'h1'));
    assert(c2Anchors.some(a => a.hitId === 'h2'));

    // 验证是否合成了出点锚
    assert(rep.anchors.some(a => a.hitId === 'cue:c1:out'));
    assert(rep.anchors.some(a => a.hitId === 'cue:c2:out'));
  });

  it('没有配曲的段应跳过求解并保持线性直通', () => {
    const cuesWithEmpty: MusicCue[] = [
      {
        id: 'c1',
        label: '无配曲段',
        in: { ref: 'SC.0', sec: 0 },
        out: { ref: 'SC.mid', sec: 10.0 },
        brief: '',
        startFromSec: 0,
        volume: 0.5,
        fadeInSec: 1,
        fadeOutSec: 1,
        // track: undefined
      },
      {
        id: 'c2',
        label: '有配曲段',
        in: { ref: 'SC.mid', sec: 10.0 },
        out: { ref: 'SC.end', sec: 30.0 },
        brief: '',
        startFromSec: 0,
        volume: 0.5,
        fadeInSec: 1,
        fadeOutSec: 1,
        track: {
          id: 't2',
          title: 'T2',
          artist: 'A2',
          bpm: 120,
          file: 'test2.wav',
          durationSec: 20.0,
          adapted: true,
        },
      },
    ];

    const rep = solveCues(cuesWithEmpty, dummyHits, () => mockGrid);
    // 第一段无配曲，不应有 h1 的锚点
    assert(!rep.anchors.some(a => a.hitId === 'cue:c1:out'));
    // 第二段有配曲，应合成 c2 出点锚
    assert(rep.anchors.some(a => a.hitId === 'cue:c2:out'));
  });
});
