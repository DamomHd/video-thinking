import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extendStyle, BLUEPRINT, getStyle, STYLES } from '../styles/index.js';
import { normColor, findOffColors } from '../../scripts/guard/style-guard.js';

describe('风格库 (src/styles)', () => {
  it('extendStyle：深合并，只覆盖写到的字段；片子特有的段原样保留；带 styleId', () => {
    const t = extendStyle(BLUEPRINT, { colors: { accent: '#FD8FAC' }, frame: { margin: 30 }, track: { width: 7 } });
    assert.equal(t.colors.accent, '#FD8FAC');
    assert.equal(t.colors.paper, BLUEPRINT.colors.paper, '没写的颜色沿用风格');
    assert.equal(t.frame.margin, 30);
    assert.deepEqual(t.frame.rows, BLUEPRINT.frame.rows, '图框没写的字段沿用风格');
    assert.deepEqual(t.track, { width: 7 }, '片子特有的段原样保留');
    assert.equal(t.styleId, 'blueprint');
    assert.equal(BLUEPRINT.colors.accent, '#C98A1E', '不改动风格本身');
  });

  it('注册表能取到风格；不存在的风格报出已登记列表', () => {
    assert.equal(getStyle('blueprint').id, 'blueprint');
    assert.throws(() => getStyle('nope'), /blueprint/);
    for (const [id, s] of Object.entries(STYLES)) assert.equal(s.id, id, '登记的 key 要和风格 id 一致');
  });

  it('风格只定整体气质：色板、字体必填，不再带动效 / 原语 / 3D / Blender / 声音参数；每个风格都有 README', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    for (const s of Object.values(STYLES)) {
      assert.ok(Object.keys(s.colors).length && Object.keys(s.fonts).length, `${s.id} 缺色板或字体`);
      for (const k of ['motion', 'primitives', 'three', 'blender', 'audio']) assert.ok(!(k in s), `${s.id} 还带着 ${k}：画面怎么设计由模型逐片决定，不进风格`);
      assert.ok(fs.existsSync(path.join(process.cwd(), 'src', 'styles', s.id, 'README.md')), `${s.id} 缺 README.md（气质描述）`);
    }
  });
});

describe('风格守门 (guard/style-guard)', () => {
  it('颜色归一：hex 三位 / 六位 / 八位、rgb / rgba 都折成 rrggbb，忽略透明度', () => {
    assert.equal(normColor('#ABC'), 'aabbcc');
    assert.equal(normColor('#C98A1E'), 'c98a1e');
    assert.equal(normColor('#C98A1E80'), 'c98a1e');
    assert.equal(normColor('rgba(24, 22, 20, 0.12)'), '181614');
    assert.equal(normColor('rgb(255,0,0)'), 'ff0000');
  });

  it('色板内的颜色（含不同透明度）、纯黑纯白、注释行都放行；色板外的报出位置', () => {
    const palette = ['#181614', 'rgba(201, 138, 30, 1)'];
    const src = [
      { file: 'a.tsx', text: "const a = 'rgba(24, 22, 20, 0.3)';\nconst b = '#c98a1e';\nconst c = '#000';\n// 说明里的 #123456 不算\nconst d = '#FF5028';" },
    ];
    const off = findOffColors(palette, src);
    assert.equal(off.length, 1);
    assert.equal(off[0].color, '#ff5028');
    assert.deepEqual(off[0].uses, [{ file: 'a.tsx', line: 5 }]);
  });
});

import { constNameOf, styleSource, registerStyle } from '../../scripts/style/save.js';

describe('沉淀风格 (scripts/style/save)', () => {
  const theme = { colors: { paper: '#FFF', text: '#111' }, fonts: { display: 'X', 'mono-alt': 'Y' }, frame: { margin: 40, tickLen: 8, cols: 6, rows: ['A', 'B'] } };

  it('常量名：连字符转下划线、大写；非法 id 报错', () => {
    assert.equal(constNameOf('dark-tech'), 'DARK_TECH');
    assert.throws(() => constNameOf('Dark Tech'), /小写/);
  });

  it('style.ts 源码：带来源片子、色板、字体、图框；片子特有的段不带', () => {
    const src = styleSource('dark-tech', '暗色科技', { ...theme, track: { width: 7 } } as any, 'anlan-film');
    assert.match(src, /export const DARK_TECH = defineStyle\(\{/);
    assert.match(src, /沉淀自片子 anlan-film/);
    assert.match(src, /paper: "#FFF"/);
    assert.match(src, /"mono-alt": "Y"/);
    assert.match(src, /rows: \["A","B"\]/);
    assert.ok(!src.includes('track'));
    assert.match(src, /export type DarkTechStyle/);
  });

  it('注册表：加 import、加表项、加导出；重复登记报错', async () => {
    const fs = await import('node:fs');
    const cur = fs.readFileSync('src/styles/index.ts', 'utf-8');
    const next = registerStyle(cur, 'dark-tech');
    assert.match(next, /import \{ DARK_TECH \} from '\.\/dark-tech\/style';/);
    assert.match(next, /'dark-tech': DARK_TECH,\n\};/);
    assert.match(next, /export \{ BLUEPRINT(, [A-Z_]+)*, DARK_TECH \};/);
    assert.throws(() => registerStyle(next, 'dark-tech'), /已经有/);
    assert.throws(() => registerStyle(cur, 'blueprint'), /已经有/);
  });
});

it('收录风格（lemo-opuscar）：导入脚本的解析是确定的，登记表和目录一一对应', async () => {
  const { constOf, camel, demoPalette, proseColors, dominantColors, styleIdOf, o98IdOf } = await import('../../scripts/style/import-opuscar');
  assert.equal(constOf('ink-wash'), 'INK_WASH');
  assert.equal(constOf('hd-2d'), 'HD_2D');
  assert.equal(camel('Electric Violet'), 'electricViolet');
  assert.equal(styleIdOf('blueprint', new Set(['blueprint'])), 'blueprint-opuscar');
  assert.deepEqual(demoPalette("const PAL = { paper: '#f3ebdc', ink: \"#2B2233\", n: 3 };"), { paper: '#F3EBDC', ink: '#2B2233' });
  assert.deepEqual(proseColors('pick one: lime `#B7F34A`, electric violet `#8B7CFF`'), { lime: '#B7F34A', electricViolet: '#8B7CFF' });
  const px = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 255]);
  assert.deepEqual(dominantColors(px, 2), ['#000000', '#FFFFFF']);
  assert.deepEqual(dominantColors(px, 2), dominantColors(px, 2));

  const fs = await import('node:fs');
  const path = await import('node:path');
  const { OPUSCAR_STYLES } = await import('../styles/opuscar');
  const dirs = fs.readdirSync(path.join(process.cwd(), 'src/styles')).filter((d) => fs.existsSync(path.join(process.cwd(), 'src/styles', d, 'STYLE.md')));
  // 收录风格都有目录；带 STYLE.md 的目录（收录的 + 用 vw style keep 进库的自有风格）都已登记
  for (const id of Object.keys(OPUSCAR_STYLES)) assert.ok(dirs.includes(id), `${id} 没有目录`);
  for (const d of dirs) assert.ok(STYLES[d], `src/styles/${d} 有 STYLE.md 但没登记`);
  assert.equal(Object.keys(OPUSCAR_STYLES).length, 59);
  for (const [id, s] of Object.entries(OPUSCAR_STYLES)) {
    assert.equal(s.id, id);
    assert.ok(Object.keys(s.colors).length >= 3, `${id} 色板太少`);
    assert.ok(fs.existsSync(path.join(process.cwd(), 'src/styles', id, 'refs/poster.jpg')), `${id} 缺海报帧`);
  }
  // OPUSCAR 98 只作参考：不在风格库里，在 docs/library/opuscar98/
  assert.ok(!Object.keys(STYLES).some((id) => id.startsWith('o98-')));
  assert.equal(fs.readdirSync(path.join(process.cwd(), 'docs/library/opuscar98')).filter((f) => f.startsWith('o98-')).length, 98);
  assert.equal(o98IdOf({ no: 7, title: 'It Happened One Night' }), 'o98-07-it-happened-one-night');
});

it('改成你自己的风格：草稿的 STYLE.md 换标题、写明底子、去掉收录出处；从空白开始是十一节骨架', async () => {
  const { forkStyleMd, blankStyleMd, CHANGES_HEAD } = await import('../../scripts/style/workshop');
  const base = '> 原文：某处\n> 第二行\n\n# Ink Wash — Style Prompt\n\n## 1. Essence\n正文\n';
  const md = forkStyleMd(base, 'ink-wash', '中国水墨', '我的水墨');
  assert.ok(md.startsWith('# 我的水墨\n\n基于 中国水墨（ink-wash）'));
  assert.ok(!md.includes('原文：某处') && md.includes('## 1. Essence') && md.includes('正文'));
  const blank = blankStyleMd('黑板粉笔', 'whiteboard', '白板');
  assert.equal((blank.match(/^## \d+\./gm) ?? []).length, 11);
  assert.ok(CHANGES_HEAD.includes('| 节 | 原来 | 现在 | 为什么 | 分组 |'));
});

it('风格库总览页：Markdown 转 HTML（标题、引用、列表、表格、行内格式，HTML 要转义）', async () => {
  const { mdToHtml } = await import('../../scripts/style/gallery');
  const h = mdToHtml('# 标题\n> 引用\n- **粗** 和 `code`\n  - 子项\n1. 一\n\n| a | b |\n|---|---|\n| <x> | [链](https://e.com) |\n普通段落');
  assert.ok(h.includes('<h2>标题</h2>') && h.includes('<blockquote>引用</blockquote>'));
  assert.ok(h.includes('<ul>') && h.includes('<b>粗</b>') && h.includes('<code>code</code>') && h.includes('class="sub"'));
  assert.ok(h.includes('<ol>') && h.includes('<th>a</th>') && h.includes('&lt;x&gt;') && h.includes('<a href="https://e.com"'));
  assert.ok(h.includes('<p>普通段落</p>'));
});
