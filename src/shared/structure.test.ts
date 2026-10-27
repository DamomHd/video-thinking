import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStructureReview, perSecond, normalize, energyCurve, sparkline, energyReview, shotStats, climaxesOf } from '../../scripts/guard/structure.js';
import type { BriefRow } from '../../scripts/guard/brief.js';

const row = (level: BriefRow['level'], point: string, from: number, to: number): BriefRow => ({ level, point, from, to, carry: '', voIds: [], screen: [] });

test('planStructureReview：前 3 秒有信息点、高潮时刻落下信息点时只有 ok', () => {
  const rows = [row('结论', '一刻不停', 1, 30), row('支撑', '范围最小', 6, 14), row('证据', '21 → 6', 20.3, 24)];
  const items = planStructureReview(rows, [20.6]);
  assert.ok(items.every((i) => i.level === 'ok'), JSON.stringify(items));
  assert.match(items[1].text, /21 → 6/);
});

test('planStructureReview：开场没信息点、高潮空响都提示；没有信息表不出条目', () => {
  const items = planStructureReview([row('结论', 'x', 5, 30)], [18], [{ id: 'L1', text: '停在什么时候？', sec: 0.8 }]);
  assert.equal(items.filter((i) => i.level === 'hint').length, 2);
  assert.match(items[0].text, /L1「停在什么时候？」/);
  assert.match(items[1].text, /最近的是结论「x」5s，差 -13\.0s/);
  assert.deepEqual(planStructureReview([], [18]), []);
});

test('perSecond / normalize：按秒平均；拉到 0..1、端点被夹住；常数列全 0', () => {
  assert.deepEqual(perSecond([1, 3, 5, 7, 9], 2), [2, 6]);
  const n = normalize([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
  assert.equal(Math.min(...n), 0);
  assert.equal(Math.max(...n), 1);
  assert.deepEqual(normalize([3, 3, 3]), [0, 0, 0]);
});

test('energyCurve：两列等权、按短的截；缺一列就用另一列；同输入同输出', () => {
  const m = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const a = [-60, -50, -40, -30, -20, -10, 0, 0];
  const c = energyCurve(m, a);
  assert.equal(c.length, 8);
  assert.deepEqual(c, energyCurve(m, a));
  assert.deepEqual(energyCurve(m, []), normalize(m));
  assert.equal(sparkline([0, 0.5, 1]), '▁▅█');
});

test('energyReview：高潮前先回落再到峰 → ok；平坦全片和高潮前没压都提示', () => {
  // 0–9 秒中等，10–13 回落，14–16 爆
  const shaped = [0.6, 0.7, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.6, 0.5, 0.1, 0.1, 0.05, 0.1, 1, 1, 0.9, 0.5, 0.4, 0.3];
  const ok = energyReview(shaped, [14]);
  assert.ok(!ok.some((i) => i.level !== 'ok'), JSON.stringify(ok));
  const flat = energyReview(new Array(20).fill(0.5), [10]);
  assert.ok(flat.some((i) => /起伏小/.test(i.text)));
  const noDip = [...new Array(10).fill(0.6), 0.8, 0.85, 0.9, 0.95, 1, 1, 0.6, 0.6, 0.6, 0.6];
  assert.ok(energyReview(noDip, [14]).some((i) => /没有回落/.test(i.text)));
  assert.deepEqual(energyReview([0.1, 0.2], [1]), []);
});

test('shotStats：相邻 0.2s 内的切点算同一刀；没有硬切就是一个镜头', () => {
  assert.deepEqual(shotStats([], 30), { count: 1, meanSec: 30, longestSec: 30, longestAt: 0 });
  const s = shotStats([5, 5.05, 12, 12.1], 20);
  assert.equal(s.count, 3);
  assert.equal(s.longestSec, 8);
  assert.equal(s.longestAt, 12);
});

test('climaxesOf：取每段的 climax / climax2，按时间排', () => {
  assert.deepEqual(climaxesOf({ cues: [{ climax: { sec: 30 }, climax2: { sec: 12 } }, {}] }), [12, 30]);
  assert.deepEqual(climaxesOf(null), []);
});
