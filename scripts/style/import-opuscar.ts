/**
 * 把 lemo-opuscar 的风格整份收进风格库（src/styles/<id>/），可重复跑（以上游为准覆盖生成的文件）。
 *
 *   npx tsx scripts/style/import-opuscar.ts <上游仓库目录>
 *
 * 每个风格：
 *   STYLE.md   上游风格提示词原文（材质、配色逻辑、字体、动效、镜头、声音、原生手法、坑、变化空间），开头加一行出处
 *   DEMO.md    上游样片说明原文（那支样片自己的故事、镜头表、配乐结构，只是一个例子）
 *   README.md  中文索引：名字、分类、一句话、适用场景、出处与授权、怎么取样片源码
 *   style.ts   只用风格库现有字段（id / label / colors / fonts）：色板取自样片源码的色板对象 + STYLE.md 里写明的色值，
 *              字体取自 STYLE.md「Type」一节点名的字体（后接系统中文字体兜底）；配色逻辑与字体用法以 STYLE.md 为准
 *   refs/      海报帧 poster.jpg + 画廊关键帧 frame.jpg（CC BY 4.0，署名 LemoLab）
 * 样片源码不收进仓库，用 `vw style demo <id>` 按需取到 out/styles/<id>/demo/。
 * 和本仓库已有风格重名时，id 加后缀 -opuscar（目前只有 blueprint）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const OPUSCAR_REPO = 'https://github.com/lemomo-ai/lemo-opuscar';

interface Meta {
  slug: string;
  num?: string;
  en: string;
  cn: string;
  category_en?: string;
  category_cn?: string;
  film?: string;
  line?: string;
  line_cn?: string;
  uses?: string[];
  dur?: number;
}

/** 上游 slug → 本库 id：和本仓库自有风格重名时加后缀 */
export function styleIdOf(slug: string, taken: Set<string>): string {
  return taken.has(slug) ? `${slug}-opuscar` : slug;
}

/** 'ink-wash' → 'INK_WASH'（常量名；数字开头前面补下划线） */
export function constOf(id: string): string {
  const c = id.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return /^[0-9]/.test(c) ? `_${c}` : c;
}

/** 'Dark Tech' → 'darkTech'（色板键名） */
export function camel(words: string): string {
  const w = words.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '';
  const k = w[0] + w.slice(1).map((s) => s[0].toUpperCase() + s.slice(1)).join('');
  return /^[0-9]/.test(k) ? `c${k}` : k;
}

/**
 * 样片源码里的色板对象：`const PAL = { paper: '#F3EBDC', ink: '#2B2233', … }` 这类（PAL / PALETTE / COL / COLS / C / INK / COLORS）。
 * 只取值是 6 位 hex 的键；同名键以先出现的为准。
 */
export function demoPalette(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/(?:const|let|var)\s+(?:PAL|PALETTE|COL|COLS|COLORS|C|INK)\s*=\s*\{([\s\S]{0,4000}?)\}/g)) {
    for (const kv of m[1].matchAll(/([A-Za-z_$][\w$]*)\s*:\s*['"](#[0-9A-Fa-f]{6})['"]/g)) {
      if (!(kv[1] in out)) out[kv[1]] = kv[2].toUpperCase();
    }
  }
  return out;
}

/**
 * STYLE.md 里写明的色值：取 hex 前面紧挨着的一两个词当键名（「lime `#B7F34A`」→ lime，「(around `#B02E22`)」往前找名词）。
 * 找不到合适的词就用 c1、c2…
 */
export function proseColors(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Set<string>();
  let n = 0;
  const STOP = new Set(['around', 'about', 'like', 'e', 'g', 'eg', 'or', 'and', 'a', 'an', 'the', 'of', 'at', 'to', 'is', 'as', 'pick', 'one', 'per', 'film', 'with', 'in', 'on', 'near', 'roughly', 'approx', 'approximately', 'base', 'only']);
  for (const m of md.matchAll(/#[0-9A-Fa-f]{6}\b/g)) {
    const hex = m[0].toUpperCase();
    if (seen.has(hex)) continue;
    seen.add(hex);
    const before = md.slice(Math.max(0, m.index! - 60), m.index!).replace(/[`*_()\[\]:,;~≈]/g, ' ');
    const words = before.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z-]*$/.test(w) && !STOP.has(w.toLowerCase()));
    let key = camel(words.slice(-2).join(' '));
    if (!key || key in out) key = camel(words.slice(-1).join(' '));
    if (!key || key in out) key = `c${++n}`;
    out[key] = hex;
  }
  return out;
}

const CJK_SANS = '"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", sans-serif';
const CJK_SERIF = '"Songti SC", "STSong", "Source Han Serif SC", serif';
const MONO_FALLBACK = '"SF Mono", Menlo, monospace';

/** STYLE.md 第 4 节（Type）里点名的字体 → display / text / mono 三个字体栈 */
export function fontsOf(md: string): Record<string, string> {
  const sec = md.match(/^## 4\.[^\n]*\n([\s\S]*?)(?=^## )/m)?.[1] ?? '';
  const KNOWN = /\b((?:[A-Z][A-Za-z]+ ){0,3}(?:Mono|Sans|Serif|Grotesk|Garamond|Gothic|Display|Slab|Script|Hand|Marker|Mincho|Kai|Song|Hei)\b(?: [A-Z][A-Za-z]+)?|Inter(?: Tight)?|Fredoka|Lilita One|IM Fell English|ZCOOL [A-Za-z]+|Oswald|Anton|Bebas Neue|Archivo(?: [A-Z][a-z]+)?|Space Grotesk|Rubik|Nunito|Caveat|Kalam|Bangers|Press Start 2P|VT323|Silkscreen|Fraunces|Playfair Display|Cormorant(?: [A-Z][a-z]+)?|Abril Fatface|Poiret One|Limelight|Righteous|Bungee(?: [A-Z][a-z]+)?|Lora|Merriweather|Libre Baskerville|DM (?:Sans|Serif Display|Mono)|Work Sans|Barlow(?: Condensed)?|Teko|Rajdhani|Orbitron|Share Tech Mono|Courier Prime|Special Elite|Noto (?:Sans|Serif)(?: [A-Z]{2})?)/g;
  const names: string[] = [];
  for (const m of sec.matchAll(KNOWN)) {
    const n = m[1].trim();
    if (/^(The|A|One|No|Sans|Serif|Mono|Display|Hand|Script|Slab|Song|Hei|Kai)$/.test(n)) continue;
    if (!names.includes(n)) names.push(n);
  }
  const mono = names.find((n) => /Mono|VT323|Courier|Press Start|Share Tech/.test(n));
  const serif = names.find((n) => /Serif|Garamond|Cormorant|Playfair|Baskerville|Lora|Merriweather|Fraunces|Mincho|Song|IM Fell/.test(n) && !/Sans/.test(n));
  const others = names.filter((n) => n !== mono);
  const q = (n: string) => `"${n}"`;
  const fall = serif && others[0] === serif ? CJK_SERIF : CJK_SANS;
  return {
    display: others.length ? `${q(others[0])}, ${fall}` : CJK_SANS,
    text: others.length ? `${q(others[1] ?? others[0])}, ${others[1] && others[1] === serif ? CJK_SERIF : fall}` : CJK_SANS,
    mono: mono ? `${q(mono)}, ${MONO_FALLBACK}` : MONO_FALLBACK,
  };
}

/**
 * 图的主色：缩到 160×90 取像素，k-means（k 个中心按亮度分位数初始化、迭代 12 次，确定性），按面积从大到小排。
 * 只在样片源码和 STYLE.md 都给不出色板时用，键名 poster1…（取自海报帧）。
 */
export function dominantColors(rgb: Uint8Array, k = 6): string[] {
  const px: number[][] = [];
  for (let i = 0; i + 2 < rgb.length; i += 3) px.push([rgb[i], rgb[i + 1], rgb[i + 2]]);
  if (!px.length) return [];
  const lum = (p: number[]) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
  const sorted = [...px].sort((a, b) => lum(a) - lum(b));
  let cs = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) * sorted.length) / k)]]);
  let assign = new Array(px.length).fill(0);
  for (let it = 0; it < 12; it++) {
    assign = px.map((p) => {
      let best = 0;
      let bd = Infinity;
      cs.forEach((c, j) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bd) [bd, best] = [d, j];
      });
      return best;
    });
    cs = cs.map((c, j) => {
      const m = px.filter((_, i) => assign[i] === j);
      return m.length ? [0, 1, 2].map((d) => m.reduce((s, p) => s + p[d], 0) / m.length) : c;
    });
  }
  const count = cs.map((_, j) => assign.filter((a) => a === j).length);
  const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  const out: string[] = [];
  cs.map((c, j) => ({ c, n: count[j] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .forEach(({ c }) => {
      const h = hex(c);
      if (!out.includes(h)) out.push(h);
    });
  return out;
}

function posterPixels(file: string): Uint8Array {
  return new Uint8Array(execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-vf', 'scale=160:90', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 }));
}

function readDemoSource(dir: string): string {
  if (!fs.existsSync(dir)) return '';
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(m?js)$/.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf-8'))
    .join('\n');
}

function styleTs(id: string, label: string, colors: Record<string, string>, fonts: Record<string, string>, meta: Meta): string {
  const lit = (o: Record<string, string>) =>
    Object.entries(o)
      .map(([k, v]) => `    ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n');
  return `import { defineStyle } from '../types';

/**
 * ${meta.cn} · ${meta.en}（收录自 lemo-opuscar，${meta.category_cn ?? ''}）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo ${id}）
 */
export const ${constOf(id)} = defineStyle({
  id: ${JSON.stringify(id)},
  label: ${JSON.stringify(label)},
  colors: {
${lit(colors)}
  },
  fonts: {
${lit(fonts)}
  },
});
`;
}

function readme(id: string, meta: Meta, commit: string, hasFrame: boolean): string {
  return `# ${meta.cn} · ${meta.en}

> 收录自 [lemo-opuscar](${OPUSCAR_REPO})（LemoLab，commit \`${commit}\`）· 分类：${meta.category_cn ?? ''}（${meta.category_en ?? ''}）

**一句话**：${meta.line_cn ?? ''}${meta.line ? `（${meta.line}）` : ''}

**适合**：${(meta.uses ?? []).join(' · ')}

## 文件
- [\`STYLE.md\`](STYLE.md)：风格提示词原文——**选了这个风格就按它做**（本质与边界、材质、配色逻辑、字体与字幕、动效、镜头语法、声音、原生手法、媒介的坑、变化空间）。
- [\`DEMO.md\`](DEMO.md)：上游样片《${meta.film ?? ''}》（${meta.dur ?? '?'} s）的说明，只是一个例子，不要照搬它的故事、镜头和时间。
- \`style.ts\`：参考色板与字体（风格库现有字段）。**色板只是参考**：片子用这个风格时，配色由模型按片子的需要、照 STYLE.md 的配色逻辑自己定。
- \`refs/poster.jpg\`${hasFrame ? '、`refs/frame.jpg`' : ''}：样片海报帧${hasFrame ? '和画廊关键帧' : ''}。
- 样片源码（Canvas / WebGL 页面 + 配乐混音脚本 + 字体）：\`vw style demo ${id}\` 取到 \`out/styles/${id}/demo/\`，读来学手法，不在本工程里渲。

## 授权
风格提示词与代码：MIT（LemoLab）。样片海报帧与关键帧：CC BY 4.0，署名 LemoLab，并附 ${OPUSCAR_REPO}。样片里的第三方素材见样片源码的 \`CREDITS\`。
`;
}

export function importOpuscar(upstream: string, root = process.cwd()): { ids: string[]; renamed: Record<string, string> } {
  const stylesDir = path.join(upstream, 'styles');
  const commit = execFileSync('git', ['-C', upstream, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
  const own = new Set(['blueprint']); // 本仓库自有风格（不是从这里收录的）
  const slugs = fs
    .readdirSync(stylesDir)
    .filter((s) => !s.startsWith('_') && fs.existsSync(path.join(stylesDir, s, 'STYLE.md')))
    .sort();
  const ids: string[] = [];
  const renamed: Record<string, string> = {};
  for (const slug of slugs) {
    const src = path.join(stylesDir, slug);
    const meta = JSON.parse(fs.readFileSync(path.join(src, 'style.json'), 'utf-8')) as Meta;
    const id = styleIdOf(slug, own);
    if (id !== slug) renamed[slug] = id;
    const dst = path.join(root, 'src/styles', id);
    fs.mkdirSync(path.join(dst, 'refs'), { recursive: true });
    const md = fs.readFileSync(path.join(src, 'STYLE.md'), 'utf-8');
    const header = `> 原文：lemo-opuscar \`styles/${slug}/STYLE.md\`（LemoLab，MIT，commit \`${commit}\`），${new Date().toISOString().slice(0, 10)} 收入本仓库风格库，未改动。\n> 在本工程里怎么落地（引擎换算、样片源码怎么取）见同目录 README.md 和 docs/library/adaptation.md §11。\n\n`;
    fs.writeFileSync(path.join(dst, 'STYLE.md'), header + md);
    if (fs.existsSync(path.join(src, 'DEMO.md'))) fs.copyFileSync(path.join(src, 'DEMO.md'), path.join(dst, 'DEMO.md'));
    if (fs.existsSync(path.join(src, 'poster.jpg'))) fs.copyFileSync(path.join(src, 'poster.jpg'), path.join(dst, 'refs/poster.jpg'));
    const frame = path.join(upstream, 'docs/frames', `${slug}.jpg`);
    const hasFrame = fs.existsSync(frame);
    if (hasFrame) fs.copyFileSync(frame, path.join(dst, 'refs/frame.jpg'));
    const colors = { ...demoPalette(readDemoSource(path.join(src, 'demo'))) };
    for (const [k, v] of Object.entries(proseColors(md))) {
      if (Object.values(colors).includes(v)) continue;
      colors[k in colors ? `${k}Doc` : k] = v;
    }
    const poster = path.join(dst, 'refs/poster.jpg');
    if (Object.keys(colors).length < 3 && fs.existsSync(poster)) {
      dominantColors(posterPixels(poster)).forEach((h, i) => {
        if (!Object.values(colors).includes(h)) colors[`poster${i + 1}`] = h;
      });
    }
    const label = `${meta.cn} · ${meta.en}`;
    fs.writeFileSync(path.join(dst, 'style.ts'), styleTs(id, label, colors, fontsOf(md), meta));
    fs.writeFileSync(path.join(dst, 'README.md'), readme(id, meta, commit, hasFrame));
    ids.push(id);
  }
  // 登记表：单独一个文件，index.ts 展开它（vw style save 仍往 index.ts 里加自有风格）
  const lines = ids.map((id) => `import { ${constOf(id)} } from './${id}/style';`);
  fs.writeFileSync(
    path.join(root, 'src/styles/opuscar.ts'),
    `/**\n * 收录自 lemo-opuscar 的 ${ids.length} 个风格（scripts/style/import-opuscar.ts 生成，不要手改；上游 commit ${commit}）。\n * 每个风格的约束在 src/styles/<id>/STYLE.md 原文里。\n */\nimport { StyleKit } from './types';\n${lines.join('\n')}\n\nexport const OPUSCAR_STYLES: Record<string, StyleKit> = {\n${ids.map((id) => `  ${JSON.stringify(id)}: ${constOf(id)},`).join('\n')}\n};\n`
  );
  return { ids, renamed };
}

/** 样片源码：从上游缓存（out/vendor/lemo-opuscar，没有就浅克隆）拷到 out/styles/<id>/demo/ */
export function fetchDemo(id: string, root = process.cwd()): string {
  const cache = path.join(root, 'out/vendor/lemo-opuscar');
  if (!fs.existsSync(path.join(cache, 'styles'))) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '-q', OPUSCAR_REPO, cache], { stdio: 'inherit' });
  }
  const slug = id.replace(/-opuscar$/, '');
  const src = path.join(cache, 'styles', slug, 'demo');
  if (!fs.existsSync(src)) throw new Error(`上游没有 ${slug} 的样片源码`);
  const dst = path.join(root, 'out/styles', id, 'demo');
  fs.rmSync(dst, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
  return dst;
}


/* ------------------------------------------------------------------ */
/* OPUSCAR 98：上游纪念片里 98 部最佳影片各一个风格（styleboard/opuscar98_styles.json）                */
/* ------------------------------------------------------------------ */

interface O98Film {
  no: number;
  year: string;
  title: string;
  zh: string;
  chapter: string;
  style_en: string;
  style_zh: string;
  blend_en: string[];
  blend_zh: string[];
  dim: string;
  render: string;
  desc_en: string;
  desc_zh: string;
  prompt_en: string;
  prompt_zh: string;
  direction_en?: string;
  direction_zh?: string;
  refs?: string[];
  shots?: { cam: string; sec: number; en: string; zh: string }[];
}

export const O98_GALLERY = 'https://lemomo-ai.github.io/lemo-opuscar';

/** 'The Silence of the Lambs' → 'the-silence-of-the-lambs'（截到 32 字符） */
export function slugOf(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 32).replace(/-$/, '');
}

export const o98IdOf = (f: { no: number; title: string }) => `o98-${String(f.no).padStart(2, '0')}-${slugOf(f.title)}`;

function o98StyleMd(f: O98Film, commit: string): string {
  const shots = (f.shots ?? []).map((s) => `| ${s.cam} | ${s.zh} | ${s.en} |`).join('\n');
  return `# ${f.style_zh} · ${f.style_en}

> 原文：lemo-opuscar \`styleboard/opuscar98_styles.json\` 第 ${f.no} 条（OPUSCAR 98 纪念片里《${f.zh}》${f.title}（${f.year}）那一段的风格；LemoLab，MIT，commit \`${commit}\`），${new Date().toISOString().slice(0, 10)} 收入本仓库风格库，未改动。
> 和 66 个完整风格的区别：这是一段约 5 秒的片段风格，提示词更短，没有完整的十一节说明。片子选了它，就按下面的「风格提示词」做；在本工程里怎么落地见 docs/library/adaptation.md §11、§13。

**渲染**：${f.render}（${f.dim}）　**手法组合**：${f.blend_zh.join(' · ')}（${f.blend_en.join(' · ')}）

## 风格提示词（中文原文）

${f.prompt_zh}

## Style prompt (English original)

${f.prompt_en}

## 这个风格是什么（上游说明）

${f.desc_zh}

${f.desc_en}

## 上游示范用法（只是一个例子，不要照搬故事和镜头）

${f.direction_zh ?? ''}

| 机位 | 镜头 | Shot |
|---|---|---|
${shots}

参考：${(f.refs ?? []).join('；')}
`;
}

function o98Readme(id: string, f: O98Film, commit: string, hasFrame: boolean): string {
  return `# ${f.style_zh} · ${f.style_en}

> 收录自 [lemo-opuscar](${OPUSCAR_REPO}) 的 OPUSCAR 98（LemoLab，commit \`${commit}\`）· 第 ${f.no} 条 · 源自《${f.zh}》${f.title}（${f.year}）· ${f.render}

**一句话**：${f.desc_zh.split('。')[0]}。

**手法组合**：${f.blend_zh.join(' · ')}

## 文件
- [\`STYLE.md\`](STYLE.md)：风格提示词原文（中英文）、上游说明、上游示范用法——**选了这个风格就按提示词做**。
- \`style.ts\`：参考色板与字体（风格库现有字段）。**色板只是参考**：取自提示词写明的色值（不足 3 个补画面帧主色），片子用这个风格时配色由模型按片子需要、照提示词的配色逻辑自己定。
- \`refs/frame.jpg\`${hasFrame ? '' : '（没取到）'}：OPUSCAR 98 里这一段的画面帧。

## 授权
提示词：MIT（LemoLab）。画面帧：CC BY 4.0，署名 LemoLab，并附 ${OPUSCAR_REPO}。电影名只是风格来源的说明，片子里不要出现原片的名字、角色、画面或音乐。
`;
}

/**
 * OPUSCAR 98 不进风格库（2026-10-27 用户定：只有完整的风格才收录风格库），只作参考资料：
 * docs/library/opuscar98/<id>.md（提示词原文、说明、示范分镜）+ img/<编号>.jpg（画面帧）+ README.md（索引）。
 */
export function importOpuscar98(upstream: string, root = process.cwd()): string[] {
  const commit = execFileSync('git', ['-C', upstream, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf-8' }).trim();
  const data = JSON.parse(fs.readFileSync(path.join(upstream, 'styleboard/opuscar98_styles.json'), 'utf-8')) as { films: O98Film[] };
  const dir = path.join(root, 'docs/library/opuscar98');
  fs.mkdirSync(path.join(dir, 'img'), { recursive: true });
  const ids: string[] = [];
  const rows: string[] = [];
  for (const f of data.films) {
    const id = o98IdOf(f);
    const nn = String(f.no).padStart(2, '0');
    const img = path.join(dir, 'img', `${nn}.jpg`);
    const old = path.join(root, 'src/styles', id, 'refs/frame.jpg'); // 以前收进风格库时下过的，挪过来不重下
    if (!fs.existsSync(img) && fs.existsSync(old)) fs.copyFileSync(old, img);
    if (!fs.existsSync(img)) {
      try {
        execFileSync('curl', ['-sSfL', '--retry', '2', '-o', img, `${O98_GALLERY}/img/opuscar98/${nn}.jpg`]);
      } catch {
        fs.rmSync(img, { force: true });
      }
    }
    const md = o98StyleMd(f, commit)
      .replace('收入本仓库风格库，未改动。', '收入本仓库作参考（不在风格库里，片子不能选它当风格），未改动。')
      .replace(/> 和 66 个完整风格的区别：[^\n]*\n/, '> 这是约 5 秒片段的风格，没有完整的十一节说明，所以不进风格库。用法：当视觉语言的参考——某一段画面想要这种质感时，借它的提示词写进决策单，声音、镜头、坑由模型自己补。\n');
    fs.writeFileSync(path.join(dir, `${id}.md`), `${md}\n![画面帧](img/${nn}.jpg)\n`);
    rows.push(`| ${f.no} | [${f.style_zh}](${id}.md) | ${f.style_en} | ${f.render} | ${f.blend_zh.join(' · ')} |`);
    ids.push(id);
  }
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# OPUSCAR 98 · 98 个片段风格（参考，不是风格库）\n\n> 来源：lemo-opuscar \`styleboard/opuscar98_styles.json\`（LemoLab，提示词 MIT、画面帧 CC BY 4.0，commit \`${commit}\`）。上游纪念片里 98 部最佳影片各一段约 5 秒的画面，每段一个风格。\n> **不进风格库**（只有完整的风格才收录）：没有十一节说明，片子不能「选」它。用法：某一段画面想要这种质感时，读对应的 md，借提示词里的材质、配色、镜头做法写进决策单；其余（声音、坑、节奏）由模型自己补。电影名只是风格来源，片子里不出现原片的名字、角色、画面或音乐。\n\n| # | 风格 | Style | 渲染 | 手法组合 |\n|---|---|---|---|---|\n${rows.join('\n')}\n`
  );
  return ids;
}

/** 提示词里点名的字体（不像 STYLE.md 有「Type」一节，就在整段提示词里找） */
function fontsOfPrompt(prompt: string): Record<string, string> {
  return fontsOf(`## 4. Type\n${prompt}\n## `);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const up = process.argv[2];
  if (!up) {
    console.error('用法: npx tsx scripts/style/import-opuscar.ts <lemo-opuscar 仓库目录>');
    process.exit(1);
  }
  const r = importOpuscar(path.resolve(up));
  console.log(`[import-opuscar] ${r.ids.length} 个风格 → src/styles/；改名：${JSON.stringify(r.renamed)}`);
  const o98 = importOpuscar98(path.resolve(up));
  const { writeStyleIndex } = await import('./index-md.js');
  writeStyleIndex();
  (await import('./gallery.js')).buildGallery();
  console.log(`[import-opuscar] OPUSCAR 98：${o98.length} 个片段风格 → docs/library/opuscar98/（参考，不进风格库）`);
}
