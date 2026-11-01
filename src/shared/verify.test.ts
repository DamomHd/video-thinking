import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsText, tracedNumbers, factTrace, acceptanceStatus, acceptanceReview, type Evidence } from '../../scripts/guard/verify.js';
import type { BriefRow } from '../../scripts/guard/brief.js';

const row = (screen: string[]): BriefRow => ({ level: '证据', point: 'p', from: 0, to: 5, carry: '', voIds: [], screen });

test('tracedNumbers：小数 / 百分号 / 两位以上整数要查，单个数字不查，千分位合并', () => {
  assert.deepEqual(tracedNumbers('第3步 增长3.36% 共1,200 人 18 个'), ['3.36', '1200', '18']);
});

test('factsText：取事实清单这一项，到下一个顶层条目为止', () => {
  const d = ['## 内容策划', '- 事实清单（带出处）：转化率 3.36%（来源 A）', '  - 订单 1200 笔', '- 信息容量：x 99'].join('\n');
  const f = factsText(d);
  assert.match(f, /3\.36/);
  assert.match(f, /1200/);
  assert.doesNotMatch(f, /99/);
});

test('factTrace：未登记 warn、已登记 ok、清单空 warn、无数字不出条目', () => {
  const d = (facts: string) => `## 内容策划\n- 事实清单（带出处）：${facts}\n- 信息容量：\n`;
  assert.equal(factTrace(d('转化率 3.36%'), [row(['没有数字'])]).length, 0);
  assert.equal(factTrace(d('转化率 3.36%'), [row(['转化 3.36%'])])[0].level, 'ok');
  const miss = factTrace(d('转化率 3.36%'), [row(['转化 3.36%，订单 1200'])]);
  assert.equal(miss[0].level, 'warn');
  assert.match(miss[0].text, /1200/);
  assert.equal(factTrace(d(''), [row(['订单 1200'])])[0].level, 'warn');
});

const base: Evidence = { briefOk: true, facts: 'ok', readcheck: true, designScored: true, rendered: true, audioWav: true, soundWarn: false, listened: true, critic: 'ok' };

test('acceptanceStatus：全齐 passed；没听审声音只算 partial；没冷看理解 not_run', () => {
  assert.ok(acceptanceStatus(base).every((s) => s.state === 'passed'));
  assert.equal(acceptanceStatus({ ...base, listened: false }).find((s) => s.dim === '声音')!.state, 'partial');
  assert.equal(acceptanceStatus({ ...base, critic: 'none' }).find((s) => s.dim === '理解')!.state, 'not_run');
  assert.equal(acceptanceStatus({ ...base, rendered: false, audioWav: false }).find((s) => s.dim === '播放')!.state, 'not_run');
});

test('acceptanceReview：全过一条 ok，有缺口逐条点出', () => {
  assert.deepEqual(acceptanceReview(base).map((i) => i.level), ['ok']);
  const r = acceptanceReview({ ...base, listened: false, critic: 'none' });
  assert.equal(r.length, 3);
  assert.ok(r.every((i) => i.level === 'hint'));
});

import { filmKindOf, feelingCheck } from '../../scripts/guard/brief.js';

test('filmKindOf：没写按信息型，写感受型识别；feelingCheck 要感受线', () => {
  assert.equal(filmKindOf('## 内容策划\n- 讲给谁：x\n'), '信息型');
  const f = '## 内容策划\n- 片型（说明）：**感受型**\n- 感受线（说明）：静 → 涌 → 空\n## 标杆\n';
  assert.equal(filmKindOf(f), '感受型');
  assert.equal(filmKindOf('## 标杆\n- 片型：感受型'), '信息型', '只认内容策划一节里的声明');
  assert.match(feelingCheck(f)[1].text, /静 → 涌 → 空/);
  assert.equal(feelingCheck('## 内容策划\n- 片型：感受型\n')[1].level, 'hint');
});

import { measureHit, isPointSfx, auditReview, STEP } from '../../scripts/guard/audio-audit.js';

/** 底 -40 dB，在 sec 处起一个 -15 dB 的短音 */
const curve = (n: number, hits: number[]) => {
  const l = new Array(n).fill(-40);
  for (const h of hits) for (let k = 0; k < 8; k++) l[Math.round(h / STEP) + k] = -15 - k;
  return l;
};

test('measureHit：响了测抬升和起音偏移；没响抬升 < 3dB', () => {
  const l = curve(500, [2.0]);
  const ok = measureHit(l, { key: 'a', layer: 'UI', sec: 2.0 });
  assert.ok(ok.riseDb > 20);
  assert.ok(Math.abs(ok.shiftSec!) < 0.03);
  const late = measureHit(l, { key: 'a', layer: 'UI', sec: 1.9 });
  assert.ok(late.shiftSec! > 0.08, '计划比实际早 100ms → 起音晚于预期');
  const none = measureHit(l, { key: 'b', layer: 'UI', sec: 5.0 });
  assert.ok(none.riseDb < 3);
  assert.equal(none.shiftSec, undefined);
});

test('isPointSfx：底色 / 循环 / 长音不查', () => {
  assert.ok(isPointSfx({ layer: 'UI', durSec: 0.7 }));
  assert.ok(!isPointSfx({ layer: 'TEX', durSec: 0.7 }));
  assert.ok(!isPointSfx({ layer: 'UI', durSec: 0.7, loop: true }));
  assert.ok(!isPointSfx({ layer: 'IMPACT', durSec: 5 }));
});

test('auditReview：全响 ok；没响超 30% warn；偏移超 100ms warn', () => {
  const r = (sec: number, riseDb: number, shiftSec?: number) => ({ key: `k${sec}`, layer: 'UI', sec, riseDb, shiftSec });
  assert.equal(auditReview([r(1, 20, 0), r(2, 18, 0.02)], 10)[0].level, 'ok');
  assert.ok(auditReview([r(1, 1), r(2, 2), r(3, 20, 0)], 10).some((i) => i.level === 'warn' && /没响出来/.test(i.text)));
  assert.ok(auditReview([r(1, 20, 0.2), r(2, 20, 0)], 10).some((i) => i.level === 'warn' && /起音/.test(i.text)));
  assert.equal(auditReview([], 10)[0].level, 'hint');
});

import { firstOfBursts } from '../../scripts/guard/audio-audit.js';
test('firstOfBursts：连发只留首个，间隔够大的各自保留', () => {
  const h = (sec: number) => ({ key: `k${sec}`, layer: 'UI', sec });
  assert.deepEqual(firstOfBursts([h(1.1), h(1.0), h(1.05), h(2.0)]).map((x) => x.sec), [1.0, 2.0]);
});

import { reviewDirector } from '../../scripts/guard/review.js';
test('reviewDirector：感受型片留空信息型专属项不算没填，信息型照报', () => {
  const t = (kind: string) => ['## 标杆', '- 标杆：x', `## 内容策划`, `- 片型：${kind}`, '- 事实清单（x）：', '- 信息容量：', '## 风格与方向', '- a：b', '## 语言与结构', '- 主镜头：否', '## 节奏', '- a：b', '## 声音', '- a：b', '## 海报帧', '- a：b', '## 设计评审', '- 风格一致性：8'].join('\n');
  assert.equal(reviewDirector(t('感受型'))[0].level, 'ok');
  assert.match(reviewDirector(t('信息型')).map((i) => i.text).join('|'), /2 项没填/);
});

import { kindOf, fieldOf, spanSec, feelSecBefore, briefCheck, parseBriefTable } from '../../scripts/guard/brief.js';
import { planStructureReview } from '../../scripts/guard/structure.js';
import fs from 'node:fs';

test('kindOf：真实模板的写法（说明括号里带冒号）也认得出；空的感受线不算写了', () => {
  const tpl = fs.readFileSync('docs/templates/director.md', 'utf-8');
  assert.deepEqual(kindOf(tpl), { kind: '信息型', spans: [] }, '模板缺省是信息型');
  assert.equal(fieldOf(tpl, '感受线'), '', '模板里的感受线是空的');
  const mixed = tpl.replace(/(- 片型[^\n]*：)信息型/, '$1混合；感受段：0–6s、30–40s');
  assert.deepEqual(kindOf(mixed), { kind: '混合', spans: [[0, 6], [30, 40]] });
  assert.deepEqual(kindOf('## 内容策划\n- 感受段：2-5s\n').kind, '混合', '只写了感受段也按混合');
  assert.equal(kindOf('## 内容策划\n- 讲给谁：x\n').kind, null, '没声明');
});

test('spanSec / feelSecBefore：合并重叠、按全片截断', () => {
  assert.equal(spanSec([[0, 6], [4, 8], [30, 50]], 40), 8 + 10);
  assert.equal(feelSecBefore([[0, 6], [30, 40]], 20), 6);
  assert.equal(feelSecBefore([[0, 6], [30, 40]], 35), 11);
});

test('briefCheck：混合片按信息段算容量，结论时刻扣掉前面的感受段', () => {
  const rows = parseBriefTable(['## 内容策划', '| 层级 | 信息点 | 起 | 止 | 承载 |', '|---|---|---|---|---|', '| 结论 | 转化翻倍 | 12 | 40 | 屏幕「翻倍」 |'].join('\n'));
  const txt = (spans: [number, number][]) => briefCheck(rows, 40, [], spans).map((i) => `${i.level}:${i.text}`).join('|');
  assert.match(txt([]), /warn:结论 12s 才第一次出现/, '纯信息型：12s > 40/4');
  assert.match(txt([[0, 10]]), /ok:结论 12s 出现/, '前 10s 是感受段，有效时间 2s ≤ 30/4');
  assert.match(txt([[0, 10]]), /信息段 30\.0s/);
});

test('planStructureReview：开场是感受段不报钩子；高潮落在感受段不要求信息点', () => {
  const rows = [{ level: '结论' as const, point: 'x', from: 8, to: 20, carry: '', voIds: [], screen: [] }];
  assert.equal(planStructureReview(rows, [], [], 1, [])[0].level, 'hint');
  const r = planStructureReview(rows, [3], [], 1, [[0, 6]]);
  assert.equal(r[0].level, 'ok');
  assert.match(r[0].text, /开场是感受段/);
  assert.match(r[1].text, /落在感受段/);
});
