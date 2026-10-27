import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreCandidate,
  rankCandidates,
  tagOverlap,
  avoidHits,
  missingRequired,
  acousticScore,
  LAYER_SHAPES,
  Candidate,
} from '../../scripts/epidemic/scoring.js';
import { PaletteSpec } from './types.js';

const riserSpec: PaletteSpec = {
  slot: 'lcRise', layer: 'RISER', cat: 'whoosh',
  tags: 'riser, cinematic, sweep, build',
  dur: [1.5, 3.0], variants: 1, align: 'peak', gain: 1,
  ucs: ['designed--riser'],
};

const cand = (over: Partial<Candidate> = {}): Candidate => ({
  id: 'x', title: 'Cinematic Riser Build', tags: ['riser', 'cinematic'], slugs: [],
  durationSec: 2.2, rank: { relevance: 1, popularity: 4 },
  feat: { attackMs: 800, tailMs: 2000, bright: 0.5, rise: 0.8, crest: 12, peakDb: -4 },
  ...over,
});

describe('音效候选打分 (epidemic/scoring)', () => {
  it('标签词重叠按命中比例给分', () => {
    assert.ok(tagOverlap(riserSpec, cand()) > 0.3);
    assert.equal(tagOverlap(riserSpec, cand({ tags: [], title: 'Dog Bark', slugs: [] })), 0);
  });

  it('缺本层必含词罚 0.5，命中避让词每个罚 0.35', () => {
    const noRequired = cand({ title: 'Soft Pad', tags: ['pad'], slugs: [] });
    assert.equal(missingRequired(riserSpec, noRequired), 1);
    assert.ok(
      scoreCandidate(riserSpec, noRequired, 10).score <
        scoreCandidate(riserSpec, cand(), 10).score - 0.4,
      '缺必含词必须显著拉低总分'
    );

    const reversed = cand({ title: 'Reverse Riser Fall', tags: ['riser', 'reverse', 'down'] });
    assert.equal(avoidHits(riserSpec, reversed), 3, 'down / fall / reverse 都是 RISER 的避让词');
    assert.ok(scoreCandidate(riserSpec, reversed, 10).score < scoreCandidate(riserSpec, cand(), 10).score);
  });

  it('声学画像按层目标形状打分：RISER 必须渐强', () => {
    const rising = cand({ feat: { ...cand().feat!, rise: 0.85 } });
    const falling = cand({ feat: { ...cand().feat!, rise: 0.1 } });
    assert.ok(acousticScore(riserSpec, rising) > acousticScore(riserSpec, falling));
    assert.equal(LAYER_SHAPES.RISER.rise[0], 0.6);
  });

  it('UI 层要求起音 ≤ 25ms', () => {
    const uiSpec: PaletteSpec = {
      slot: 'uiClick', layer: 'UI', cat: 'ui', tags: 'ui, click, clean',
      dur: [0.1, 0.4], variants: 1, align: 'onset', gain: 1,
    };
    const snappy = cand({ durationSec: 0.2, feat: { attackMs: 8, tailMs: 180, bright: 0.7, rise: 0.1, crest: 14, peakDb: -5 } });
    const sluggish = cand({ durationSec: 0.2, feat: { attackMs: 300, tailMs: 180, bright: 0.7, rise: 0.1, crest: 14, peakDb: -5 } });
    assert.ok(acousticScore(uiSpec, snappy) > acousticScore(uiSpec, sluggish));
  });

  it('没有声学画像时该项得 0，而不是蒙一个值', () => {
    const blind = cand({ feat: undefined });
    assert.equal(acousticScore(riserSpec, blind), 0);
  });

  it('UCS 命中加分；rankCandidates 把高分顶到首位', () => {
    const withUcs = cand({ id: 'a', ucs: 'designed--riser' });
    const withoutUcs = cand({ id: 'b' });
    assert.ok(
      scoreCandidate(riserSpec, withUcs, 10).score >
        scoreCandidate(riserSpec, withoutUcs, 10).score
    );

    const ranked = rankCandidates(riserSpec, [withoutUcs, withUcs]);
    assert.equal(ranked[0].id, 'a', '首位就是当前选中');
    assert.ok((ranked[0].score ?? 0) >= (ranked[1].score ?? 0));
    assert.ok(ranked[0].parts, 'parts 要一并返回，报告里才能看清每项贡献');
  });
});
