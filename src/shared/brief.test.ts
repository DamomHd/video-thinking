import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBriefTable, briefCheck, paperScript, readSec } from '../../scripts/guard/brief.js';

const doc = (rows: string[]) =>
  ['## 内容策划', '- 一句话：x', '', '| 层级 | 信息点 | 起 | 止 | 承载 |', '|---|---|---|---|---|', ...rows, '', '## 标杆', '| 层级 | 信息点 | 起 | 止 | 承载 |', '|---|---|---|---|---|', '| 结论 | 不该读到 | 0 | 1 | |'].join('\n');

const GOOD = doc([
  '| 结论 | 交易一刻不停 | 2 | 30 | 口播 L1；屏幕「交易一刻不停」 |',
  '| 支撑 | 范围最小 | 6 | 14 | 口播 L2 |',
  '| 证据 | 21 个接口只迁 6 个 | 8 | 14 | 屏幕「21 → 6」 |',
  '| 支撑 | 只搬一遍 | 14 | 22 | 口播 L3 |',
  '| 证据 | 两遍 vs 一遍 | 16 | 22 | 屏幕「一遍到位」 |',
]);

test('parseBriefTable：只读「内容策划」一节的表；口播 id 和「」里的屏幕字拆出来', () => {
  const rows = parseBriefTable(GOOD);
  assert.equal(rows.length, 5);
  assert.deepEqual(rows[0].voIds, ['L1']);
  assert.deepEqual(rows[0].screen, ['交易一刻不停']);
  assert.equal(rows[2].from, 8);
  assert.ok(!rows.some((r) => r.point === '不该读到'));
  assert.deepEqual(parseBriefTable('## 内容策划\n没有表\n## 下一节'), []);
});

test('briefCheck：结构对、结论早、口播在容量内时只有 ok', () => {
  const vo = [{ id: 'L1', text: '交易一刻不停。', sec: 2 }, { id: 'L2', text: '范围收到最小。', sec: 6 }, { id: 'L3', text: '只搬一遍。', sec: 14 }];
  const items = briefCheck(parseBriefTable(GOOD), 30, vo);
  assert.ok(items.every((i) => i.level === 'ok'), JSON.stringify(items.filter((i) => i.level !== 'ok')));
});

test('briefCheck：没有表、两个结论、结论太晚、支撑超量、读不完、口播超容量都要报', () => {
  assert.equal(briefCheck([], 30)[0].level, 'warn');
  const late = parseBriefTable(doc(['| 结论 | A | 20 | 30 | |', '| 结论 | B | 2 | 30 | |']));
  const t1 = briefCheck(late, 30).map((i) => i.text).join('|');
  assert.match(t1, /恰好 1 个/);
  assert.match(t1, /20s 才第一次出现/);
  const many = parseBriefTable(doc(['| 结论 | A | 1 | 30 | |', ...[1, 2, 3, 4].map((k) => `| 支撑 | S${k} | ${k * 5} | ${k * 5 + 4} | |`)]));
  const t2 = briefCheck(many, 30).map((i) => i.text).join('|');
  assert.match(t2, /支撑点 4 个/);
  assert.match(t2, /只装得下 3 个/);
  assert.match(t2, /没有证据/);
  const tight = parseBriefTable(doc(['| 结论 | A | 1 | 3 | 屏幕「一二三四五六七八九十一二三四五」 |']));
  assert.match(briefCheck(tight, 30).map((i) => i.text).join('|'), /停不够读完/);
  assert.equal(readSec(9), 3.5);
  const vo = [{ id: 'L1', text: '字'.repeat(120), sec: 1 }, { id: 'L9', text: '没人用的一句', sec: 5 }];
  const t3 = briefCheck(parseBriefTable(doc(['| 结论 | A | 1 | 30 | 口播 L1、L7 |'])), 30, vo).map((i) => i.text).join('|');
  assert.match(t3, /超过 30s 的容量/);
  assert.match(t3, /不存在的口播句：L7/);
  assert.match(t3, /不承载任何信息点.*L9/);
});

test('paperScript：口播和屏幕字按时间排，第一行是结论', () => {
  const vo = [{ id: 'L2', text: '范围收到最小。', sec: 6 }, { id: 'L1', text: '交易一刻不停。', sec: 2 }];
  const s = paperScript(parseBriefTable(GOOD), vo).split('\n');
  assert.equal(s[0], '一句话：交易一刻不停');
  assert.ok(s.findIndex((l) => l.includes('L1')) < s.findIndex((l) => l.includes('L2')));
  assert.ok(s.some((l) => l.includes('21 → 6')));
});
