import { test } from 'node:test';
import assert from 'node:assert/strict';
import { naturalQuery, tokensOf, kenneyWords } from '../../scripts/epidemic/cc0.js';

test('naturalQuery：去掉 layered，角色词换成自然检索词', () => {
  assert.equal(naturalQuery({ tags: 'layered, card-land' }), 'soft click tap');
  assert.equal(naturalQuery({ tags: 'soft whoosh, air', alt: 'swish' }), 'soft whoosh air swish');
});

test('tokensOf：驼峰与下划线拆词，去掉泛词和编号', () => {
  assert.deepEqual(tokensOf('impactMetal_heavy_000.ogg'), ['impact', 'metal', 'heavy']);
  assert.deepEqual(tokensOf('impact-sounds'), ['impact']);
});

test('kenneyWords：近义词展开到 Kenney 的词表', () => {
  const w = kenneyWords('stamp thud');
  for (const x of ['stamp', 'impact', 'heavy', 'punch']) assert.ok(w.includes(x));
});

import { musicQueries, looksLikeMusic, bpmFit, scoreMusic, briefFit, cutTooBig } from '../../scripts/epidemic/cc0-music.js';
import { licenseReview } from '../../scripts/guard/review.js';

test('musicQueries：整句一条 + 逐词各一条（Freesound 多词是全部匹配，整句常常搜不到）', () => {
  assert.deepEqual(musicQueries('Minimal piano, calm'), ['minimal piano, calm', 'minimal', 'piano', 'calm']);
  assert.deepEqual(musicQueries('ambient music'), ['ambient music', 'ambient']);
});

test('looksLikeMusic：要有音乐类标签，不能有现场录音类标签', () => {
  assert.ok(looksLikeMusic(['corporate', 'background', 'guitar']));
  assert.ok(looksLikeMusic(['128bpm', 'clean']));
  assert.ok(!looksLikeMusic(['ambiance', 'birds', 'wind', 'music']));
  assert.ok(!looksLikeMusic(['door', 'creak']));
});

test('bpmFit：窗口内 1 分；半速 / 倍速也算；偏出 10% 归零', () => {
  assert.equal(bpmFit(120, [115, 125]), 1);
  assert.equal(bpmFit(60, [115, 125]), 1, '半速的曲子按倍速对拍');
  assert.equal(bpmFit(140, [115, 125]), 0);
  assert.ok(bpmFit(128, [115, 125]) > 0.7);
  assert.equal(bpmFit(0, [115, 125]), 0);
});

test('scoreMusic：贴合、清晰、有高潮、口碑好的排前面；预览分析不了的扣分', () => {
  const good = scoreMusic({ downloads: 5000, rating: 4.7, grid: { bpm: 120, periodR: 0.5, dropSec: 30, totalSec: 90, sections: [{ kind: 'drop', startSec: 30, endSec: 50, bars: 8, energy: 1 }] } }, [115, 125]);
  const flat = scoreMusic({ downloads: 5000, rating: 4.7, grid: { bpm: 97, periodR: 0.05, dropSec: 30, totalSec: 90, sections: [] } }, [115, 125]);
  const none = scoreMusic({ downloads: 5000, rating: 4.7 }, [115, 125]);
  assert.ok(good.score > flat.score && flat.score >= none.score);
  assert.ok(none.notes.includes('预览无法分析'));
});

test('licenseReview：Freesound 配乐也要有 CC0 与来源页', () => {
  const cc0 = 'http://creativecommons.org/publicdomain/zero/1.0/';
  const ok = licenseReview(['music/x-c1.wav'], [{ file: 'music/x-c1.wav', source: 'freesound', license: cc0, url: 'u' }]);
  assert.match(ok[0].text, /配乐 1/);
  const bad = licenseReview(['music/x-c1.wav'], [{ file: 'music/x-c1.wav', source: 'freesound' }]);
  assert.equal(bad[0].level, 'warn');
  assert.equal(licenseReview(['music/local.wav'], [{ file: 'music/local.wav' }])[0].level, 'ok', '本地作曲不算外部素材');
});

test('briefFit / scoreMusic：贴合描述、原曲高潮离目标近的排前面（「calm piano」不该选到「Epic Orchestra」）', () => {
  assert.equal(briefFit('calm piano', ['piano', 'sad'], 'The sad piano'), 0.5);
  assert.equal(briefFit('calm piano', ['calm', 'piano'], 'x'), 1);
  const grid = (drop: number) => ({ bpm: 117, periodR: 0.5, dropSec: drop, totalSec: 120, sections: [{ kind: 'drop' as const, startSec: drop, endSec: drop + 20, bars: 8, energy: 1 }] });
  const want = { brief: 'calm piano', dropAtSec: 30, cueSec: 45 };
  const piano = scoreMusic({ downloads: 3000, rating: 4.6, tags: ['calm', 'piano'], title: 'Calm piano', grid: grid(34) }, [110, 130], want);
  const epic = scoreMusic({ downloads: 9000, rating: 4.8, tags: ['epic', 'orchestra'], title: 'Epic Orchestra', grid: grid(160) }, [110, 130], want);
  assert.ok(piano.score > epic.score, `${piano.score} vs ${epic.score}`);
});

test('cutTooBig：小节数上限 + 相对段长上限（30s 片插 13 小节 = 整段都是复制的循环）', () => {
  assert.equal(cutTooBig(13, 112, 30), true, '13 × 2.14s ≈ 28s，超过 30s 的 35%');
  assert.equal(cutTooBig(4, 112, 30), false, '4 小节 ≈ 8.6s，不到 35%');
  assert.equal(cutTooBig(12, 166, 90), false, '长片里 12 小节不算大');
  assert.equal(cutTooBig(17, 166, 300), true, '超过 16 小节一律不要');
});
