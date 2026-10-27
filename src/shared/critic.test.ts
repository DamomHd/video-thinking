import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criticPrompt, parseCritic, criticReview, energyPeaks, ruler, CRITIC_DIMS } from '../../scripts/guard/critic.js';

const ANSWER = [
  '# 冷看 · x',
  '',
  '## 一句话',
  '（看完你记住的这部片在说什么）',
  '迁移期间交易一刻不停。',
  '',
  '## 片型',
  '项目汇报。',
  '',
  '## 看不懂',
  '- 12.4s：两条轨道的颜色分不清哪条是新的',
  '- 30.0s：数字没停够就切走了',
  '',
  '## 记住的一刻',
  '- 20.0s：道岔扳过去',
  '',
  '## 最弱的三处',
  '- 8.0s：标题太小——放大一档',
  '',
  '## 分数',
  '- 看得懂：6/10 —— 两处看不懂',
  '- 完成度：8/10 —— 线宽有层级',
  '- 节奏：7/10 —— 中段平',
  '- 记得住：8/10 —— 道岔',
].join('\n');

test('criticPrompt：成片模式和关键帧模式都要求只读冷看包、写回 critic.md、带全部打分项', () => {
  for (const mode of ['film', 'frames'] as const) {
    const p = criticPrompt('demo', mode);
    assert.match(p, /不打开仓库里别的任何文件/);
    assert.match(p, /out\/demo\/critic\.md/);
    for (const d of CRITIC_DIMS) assert.ok(p.includes(`- ${d}：`));
  }
  assert.match(criticPrompt('demo', 'film'), /signals\.md/);
  assert.doesNotMatch(criticPrompt('demo', 'frames'), /signals\.md/);
});

test('parseCritic：跳过括号说明取一句话；「- 无」不算看不懂；分数按维度读', () => {
  const n = parseCritic(ANSWER);
  assert.equal(n.sentence, '迁移期间交易一刻不停。');
  assert.equal(n.confusing.length, 2);
  assert.deepEqual(n.scores, { 看得懂: 6, 完成度: 8, 节奏: 7, 记得住: 8 });
  assert.deepEqual(parseCritic(ANSWER.replace(/- 12\.4s[^\n]*\n- 30\.0s[^\n]*/, '- 无')).confusing, []);
});

test('criticReview：没冷看提示；过期提示；复述与结论并排；说不出来是 warn；低分提示', () => {
  assert.match(criticReview(null, 'x', 0, 'demo')[0].text, /vw critic demo/);
  const items = criticReview({ text: ANSWER, mtimeMs: 1 }, '交易一刻不停', 2, 'demo');
  assert.ok(items.some((i) => /比成片旧/.test(i.text)));
  assert.ok(items.some((i) => i.text.includes('「迁移期间交易一刻不停。」') && i.text.includes('「交易一刻不停」')));
  assert.ok(items.some((i) => /看不懂 2 处/.test(i.text)));
  assert.ok(items.some((i) => /看得懂 6/.test(i.text)));
  const lost = criticReview({ text: ANSWER.replace('迁移期间交易一刻不停。', '说不出来，每屏都在讲不同的事'), mtimeMs: 3 }, 'x', 2, 'demo');
  assert.equal(lost.find((i) => i.topic === '冷看' && /说不出/.test(i.text))?.level, 'warn');
});

test('energyPeaks：取最高的几处、彼此隔开；ruler 每 10 秒一个刻度、长度对齐曲线', () => {
  const c = [0, 0.9, 1, 0.8, 0, 0, 0, 0, 0.7, 0, 0, 0.5];
  assert.deepEqual(energyPeaks(c, 3, 5), [2, 8]);
  assert.deepEqual(energyPeaks(c, 3, 5), energyPeaks(c, 3, 5));
  const r = ruler(25);
  assert.equal(r.length, 25);
  assert.equal(r.indexOf('10'), 10);
  assert.equal(r.indexOf('20'), 20);
});
