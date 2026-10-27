import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reviewDirector, reviewDesign, DESIGN_DIMS, densityReview, keyPitchClasses, licenseReview, bedReview, recentFilms, voiceBalanceReview, soundRulesReview, soundCrossings, quietRuns } from '../../scripts/guard/review.js';

test('reviewDirector：缺单 / 缺节 / 空项 / 占位 / 主镜头未定', () => {
  assert.equal(reviewDirector(null)[0].level, 'warn');
  const t = [
    '## 标杆', '- 标杆是哪一两部：某发布会',
    '## 内容策划', '- 一句话：交易不停',
    '## 风格与方向', '- 风格：blueprint',
    '## 语言与结构', '- 主镜头：待定',
    '## 节奏', '- 路线：continuous',
    '## 声音', '- 底噪：',
    '## 海报帧', '- 时刻：1.2 / 20 / 33 / 44',
    '## 设计评审', '- 风格一致性：',
  ].join('\n');
  const texts = reviewDirector(t).map((i) => i.text).join('|');
  assert.match(texts, /1 项没填：底噪/, '设计评审的空分数项不算在「没填」里（由 reviewDesign 查）');
  assert.match(texts, /待定/);
  assert.match(texts, /主镜头/);
  const ok = t.replace('待定', '**是**。gates 立起').replace('- 底噪：', '- 底噪：room-tone');
  assert.deepEqual(reviewDirector(ok).map((i) => i.level), ['ok']);
});

test('reviewDesign：六维要打分、低于 7 提醒、缺陷要写（只提示，不报警告）；两轮取最后一轮', () => {
  assert.match(reviewDesign('## 声音\n')[0].text, /没有「设计评审」/);
  const base = (scores: string, defects: string) => `## 设计评审\n${scores}\n- 缺陷与处理：${defects}\n## 自检记录\n`;
  const all = (n: number) => DESIGN_DIMS.map((d) => `- ${d}：${n}`).join('\n');
  const r1 = reviewDesign(base('- 风格一致性：8', '第 3 屏卡片阴影去掉'));
  assert.ok(r1.some((i) => /没打分：视觉层级/.test(i.text)));
  const r2 = reviewDesign(base(all(8).replace('原创性：8', '原创性：6'), '第 3 屏卡片阴影去掉，改成细线框'));
  assert.ok(r2.some((i) => /低于 7 分，建议先改：原创性 6/.test(i.text)));
  assert.ok(r2.every((i) => i.level !== 'warn'), '设计评审只提示');
  const r3 = reviewDesign(base(all(8), ''));
  assert.ok(r3.some((i) => /缺陷与处理/.test(i.text)));
  const twoRounds = base(all(6) + '\n交付前：\n' + all(8), '海报帧第 2 张标题层级拉开；交付前无新增缺陷');
  assert.deepEqual(reviewDesign(twoRounds).map((i) => i.level), ['ok']);
});

test('densityReview：过密窗口与长空档', () => {
  const dense = Array.from({ length: 20 }, (_, i) => ({ layer: 'UI', fromSec: i * 0.2 }));
  const r = densityReview([...dense, { layer: 'BG', fromSec: 0 }], 12);
  assert.ok(r.some((i) => /0–5s 有 20 个/.test(i.text)));
  assert.ok(r.some((i) => /3\.8s 起有 8\.2s/.test(i.text)));
});

test('keyPitchClasses：8A = A 小调，7 个音名', () => {
  const s = keyPitchClasses('8A');
  assert.equal(s.size, 7);
  for (const pc of [0, 2, 3, 5, 7, 8, 10]) assert.ok(s.has(pc)); // A B C D E F G
  assert.ok(!s.has(1)); // A# 不在
});

test('licenseReview：外部素材必须带 CC0 与来源页', () => {
  const cc0 = 'http://creativecommons.org/publicdomain/zero/1.0/';
  assert.equal(licenseReview(['sfx-lib/epidemic/a.wav'], [])[0].level, 'ok');
  const files = ['sfx-lib/freesound/a.wav', 'sfx-lib/kenney/b.wav'];
  assert.equal(licenseReview(files, [{ file: files[0], license: cc0, url: 'u' }])[0].level, 'warn');
  const ok = licenseReview(files, [{ file: files[0], license: cc0, url: 'u' }, { file: files[1], license: cc0, url: 'v' }]);
  assert.match(ok[0].text, /freesound 1 · kenney 1/);
});

describe('从 lemo-opuscar 用法里借的检查', () => {
  it('沿用库里风格：从 theme.ts 认出风格 id；自定主题返回 null', async () => {
    const { libraryStyleOf } = await import('../../scripts/guard/review');
    assert.equal(libraryStyleOf("import { INK_WASH } from '../../styles/ink-wash/style';\nexport const T = extendStyle(INK_WASH, {});"), 'ink-wash');
    assert.equal(libraryStyleOf("export const T = { colors: {}, fonts: {} };"), null);
    assert.equal(libraryStyleOf(null), null);
  });
  it('和样片对照：没沿用风格不查；六项要写全，至少四项「不同」', async () => {
    const { reviewDemoContrast } = await import('../../scripts/guard/review');
    assert.deepEqual(reviewDemoContrast('x', null), []);
    const sec = (diff: number) => `## 和样片对照\n${['结构', '开场', '标志镜头', '镜头路线', '配乐形状', '结尾'].map((k, i) => `- ${k}：${i < diff ? '不同：…' : '相同：…'}`).join('\n')}\n## 设计评审`;
    assert.equal(reviewDemoContrast(sec(4), 'ink-wash')[0].level, 'ok');
    assert.equal(reviewDemoContrast(sec(3), 'ink-wash')[0].level, 'warn');
    assert.equal(reviewDemoContrast('## 和样片对照\n- 结构：\n## 设计评审', 'ink-wash')[0].level, 'warn');
    assert.equal(reviewDemoContrast('没有这一节', 'ink-wash')[0].level, 'warn');
  });
  it('决策单：可选项（有角色时 / 分镜）和「和样片对照」不算漏填；缺「标杆」要报', async () => {
    const { reviewDirector } = await import('../../scripts/guard/review');
    const text = ['## 标杆', '- 标杆是哪一两部：某片', '## 内容策划', '## 风格与方向', '## 语言与结构', '- 主镜头：**否**，理由', '## 节奏', '## 声音', '## 海报帧', '- 有角色时：', '- 分镜（用户要了才做）：', '## 和样片对照', '- 结构：', '## 设计评审'].join('\n');
    assert.deepEqual(reviewDirector(text).map((i) => i.level), ['ok']);
    assert.ok(reviewDirector(text.replace('## 标杆', '## 别的')).some((i) => i.text.includes('标杆')));
  });
  it('分镜页和风格索引', async () => {
    const { storyboardHtml } = await import('../../scripts/look/storyboard');
    const html = storyboardHtml('x', [{ img: 'file:///a.png', shot: { at: 1.25, framing: '全景', dur: '3s', line: '<台词>' } }], 3);
    assert.ok(html.includes('#1') && html.includes('全景') && html.includes('&lt;台词&gt;') && html.includes('1.3s'));
    const { indexRowOf, styleIndexMd } = await import('../../scripts/style/index-md');
    const lib = indexRowOf('ink-wash', '# 中国水墨 · Chinese Ink Wash\n\n> 收录自 x · 分类：手绘与绘画（Hand-drawn & Painting）\n\n**适合**：Wuxia · Poetry\n');
    const own = indexRowOf('mine', '# 我的风格（mine）\n\n**气质**：安静\n');
    assert.equal(lib.category, '手绘与绘画');
    assert.ok(own.own && own.uses === '安静');
    const md = styleIndexMd([lib, own]);
    assert.ok(md.indexOf('## 我的风格') < md.indexOf('## 手绘与绘画') && md.includes('`mine`') && md.includes('Wuxia'));
  });
});

test('bedReview：质感床空着提示，铺了报覆盖率', () => {
  assert.equal(bedReview([{ layer: 'UI', fromSec: 1 }], 20)[0].level, 'hint');
  const r = bedReview([{ layer: 'TEX', fromSec: 0, durSec: 10 }, { layer: 'TEX', fromSec: 10, durSec: 5 }], 20);
  assert.match(r[0].text, /2 段，铺了全片的 75%/);
});

test('recentFilms：排除自己，按出片时间从新到旧取几部', () => {
  const e = [{ id: 'a', mtimeMs: 1 }, { id: 'b', mtimeMs: 3 }, { id: 'me', mtimeMs: 9 }, { id: 'c', mtimeMs: 2 }];
  assert.deepEqual(recentFilms(e, 'me', 2), ['b', 'c']);
});

test('voiceBalanceReview：人声比配乐低于 8 dB 的句子提示，没有配乐的句子不算', () => {
  assert.equal(voiceBalanceReview([{ id: 'L1', voiceDb: -18, musicDb: -30 }])[0].level, 'ok');
  const r = voiceBalanceReview([{ id: 'L1', voiceDb: -18, musicDb: -24 }, { id: 'L2', voiceDb: -18, musicDb: -Infinity }]);
  assert.match(r[0].text, /1 句人声只比配乐高 L1 6 dB/);
});

test('soundRulesReview：静默不够、声音转场不够、设计表写了却空的层，都提示', () => {
  const r = soundRulesReview({ silences: [[3, 3.6]], crossings: 1, boundaries: 4, designLayers: [{ name: '质感床', count: 0 }, { name: '配乐', count: 1 }] });
  assert.ok(r.every((i) => i.level === 'hint'));
  assert.match(r.map((i) => i.text).join('|'), /真静默只有 1 处.*只有 1 个段落交界.*质感床/s);
  const ok = soundRulesReview({ silences: [[3, 3.6], [9, 9.5]], crossings: 2, boundaries: 4, designLayers: [{ name: '配乐', count: 1 }] });
  assert.ok(ok.every((i) => i.level === 'ok'));
});

test('soundCrossings：越过交界的点状声音才算；铺底层和循环的不算', () => {
  const spots = [
    { layer: 'WHOOSH', fromSec: 4.6, durSec: 0.8 },
    { layer: 'BG', fromSec: 0, durSec: 30 },
    { layer: 'TEX', fromSec: 8, durSec: 6, loop: true },
    { layer: 'UI', fromSec: 9.95, durSec: 0.1 },
  ];
  assert.equal(soundCrossings(spots, [5, 10, 12]), 1);
});

test('quietRuns：比中位数低 12 dB 以上且 ≥ 0.3s 才算；给出最安静的一处', () => {
  const lv = [...Array(20).fill(-20), -40, -41, -40, -40, ...Array(10).fill(-20), -35, -36, ...Array(10).fill(-20)];
  const q = quietRuns(lv, 0.1);
  assert.deepEqual(q.runs, [[2, 2.4]]);
  assert.equal(q.deepestBelowMedian, 21);
});
