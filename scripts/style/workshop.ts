/**
 * 「改成你自己的风格」工作流的工具（流程见 docs/method/style-workshop.md，借鉴 lemo-opuscar 的 MY-STYLES.md）
 *
 *   vw style fork <底子风格> --id=<新 id> [--label=]           改库里的风格：起一份草稿
 *   vw style fork --blank --technique=<技法底子> --id=<新 id>   从空白开始：草稿只有十一节的骨架，技法借底子
 *   vw style vs <底子帧.png> <新风格帧.png> [--out=]             同一帧并排：左底子、右新风格（只有改动处不同）
 *   vw style keep <id>                                          用户点头后：草稿挪进 src/styles/<id>/ 并登记
 *
 * 草稿在 out/style-drafts/<id>/：STYLE.md（完整一份，改动直接写进对应的节）、CHANGES.md（每个决定一行，用户批的就是它）、
 * README.md、style.ts（只用风格库现有字段：色板、字体）、refs/（styleframe.png、styleframe-vs-base.png 放这里）。
 * 用户确认之前，风格库和注册表都不动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { STYLES } from '../../src/styles/index.js';
import { constNameOf, registerStyle, styleSource } from './save.js';
import { writeStyleIndex } from './index-md.js';
import { buildGallery } from './gallery.js';

const draftsDir = (root: string) => path.join(root, 'out', 'style-drafts');

/** 新 id 必须没被风格库、注册表和别的草稿占用 */
export function assertFreeId(id: string, root = process.cwd()): void {
  constNameOf(id);
  if (STYLES[id] || fs.existsSync(path.join(root, 'src/styles', id))) throw new Error(`风格库里已经有「${id}」，换一个名字`);
}

/** 底子的 STYLE.md → 新风格的 STYLE.md：换标题，标题下写「基于哪个风格」；正文原样，由模型把改动写进对应的节 */
export function forkStyleMd(baseMd: string, baseId: string, baseLabel: string, newLabel: string): string {
  const body = baseMd.replace(/^>.*\n(>.*\n)*\n?/m, ''); // 去掉收录时加的出处引用块（新风格的出处写在下面）
  const lines = body.split('\n');
  const t = lines.findIndex((l) => l.startsWith('# '));
  const rest = t >= 0 ? lines.slice(t + 1).join('\n') : body;
  return `# ${newLabel}\n\n基于 ${baseLabel}（${baseId}）。改了什么见 CHANGES.md；没改的部分和底子一致。\n${rest}`;
}

/** 从空白开始：十一节骨架（和收录风格的 STYLE.md 同样的节），技法借底子 */
export function blankStyleMd(newLabel: string, techId: string, techLabel: string): string {
  const sec = ['本质，以及它不是什么', '材质与渲染', '配色逻辑', '字体与字幕', '动效手感', '镜头语法', '声音调色板', '原生手法（标志性的那一下）', '媒介的坑', '引擎（先借技法底子，样片做完后指向自己的代码）', '变化空间（每部片可以自由变的）'];
  return `# ${newLabel}\n\n从空白开始；技法借自 ${techLabel}（${techId}）。\n\n${sec.map((s, i) => `## ${i + 1}. ${s}\n\n（待定）\n`).join('\n')}`;
}

export const CHANGES_HEAD = `# 改了什么

用户批的就是这张表；样片要让每一行都在画面里出现至少一次。分组：放心改 / 一改就变味 / 不能改（不能改的不出现在这里——那就是另一个风格了）。

| 节 | 原来 | 现在 | 为什么 | 分组 |
|---|---|---|---|---|
`;

export function forkStyle(base: string | null, id: string, label: string, options: { technique?: string; root?: string } = {}): string {
  const root = options.root ?? process.cwd();
  assertFreeId(id, root);
  const dir = path.join(draftsDir(root), id);
  if (fs.existsSync(dir)) throw new Error(`已经有这份草稿：out/style-drafts/${id}`);
  const srcId = base ?? options.technique;
  if (!srcId || !STYLES[srcId]) throw new Error(`没有风格「${srcId}」（vw style list 查 id）`);
  const src = STYLES[srcId];
  const srcMd = path.join(root, 'src/styles', srcId, 'STYLE.md');
  fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
  const md = base
    ? fs.existsSync(srcMd)
      ? forkStyleMd(fs.readFileSync(srcMd, 'utf-8'), srcId, src.label, label)
      : blankStyleMd(label, srcId, src.label) // 自有风格没有 STYLE.md：按十一节骨架写
    : blankStyleMd(label, srcId, src.label);
  fs.writeFileSync(path.join(dir, 'STYLE.md'), md);
  fs.writeFileSync(path.join(dir, 'CHANGES.md'), CHANGES_HEAD);
  fs.writeFileSync(path.join(dir, 'style.ts'), styleSource(id, label, { colors: src.colors, fonts: src.fonts, frame: src.frame }, `风格 ${srcId}`).replace(`沉淀自片子 风格 ${srcId} 的主题（vw style save）`, `${base ? '改自' : '从空白开始、技法借自'}风格 ${srcId}（vw style fork）`));
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${label}（${id}）\n\n> ${base ? `改自 ${src.label}（${srcId}）` : `从空白开始，技法借自 ${src.label}（${srcId}）`}。草稿：用户点头后 \`vw style keep ${id}\` 才进风格库。\n\n**一句话**：（这个风格是什么）\n\n**用来做**：（什么片、给谁、发在哪；画幅）\n\n## 文件\n- \`STYLE.md\`：完整的风格说明（选了这个风格就按它做）。\n- \`CHANGES.md\`：相对底子改了什么、为什么。\n- \`style.ts\`：参考色板与字体。\n- \`refs/styleframe.png\`：用户认可的风格帧${base ? '；`refs/styleframe-vs-base.png`：同一帧，左底子、右新风格' : ''}。\n- 样片：\`src/films/${id}-test/\`（15–30 秒，CHANGES 每一行都在画面里出现）。\n`
  );
  return dir;
}

/** 同一帧并排：左底子、右新风格（只有改动处不同），缩到同样高度 */
export function styleVs(baseImg: string, newImg: string, out: string): string {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', baseImg, '-i', newImg, '-filter_complex', '[0]scale=-2:720[a];[1]scale=-2:720[b];[a][b]hstack=inputs=2', '-frames:v', '1', out]);
  return out;
}

/** 用户点头：草稿挪进风格库并登记（名字要仍然空着） */
export function keepStyle(id: string, root = process.cwd()): string {
  const dir = path.join(draftsDir(root), id);
  if (!fs.existsSync(dir)) throw new Error(`没有草稿 out/style-drafts/${id}（先 vw style fork）`);
  assertFreeId(id, root);
  // 从空白开始的风格可以没有「相对底子的改动」，所以只提醒、不拦
  const rows = fs.readFileSync(path.join(dir, 'CHANGES.md'), 'utf-8').split('\n').filter((l) => l.startsWith('|')).length - 2;
  if (rows <= 0) console.warn('[vw style keep] CHANGES.md 还没有内容行');
  const dst = path.join(root, 'src/styles', id);
  fs.cpSync(dir, dst, { recursive: true });
  const index = path.join(root, 'src/styles/index.ts');
  fs.writeFileSync(index, registerStyle(fs.readFileSync(index, 'utf-8'), id));
  fs.rmSync(dir, { recursive: true, force: true });
  writeStyleIndex(root);
  buildGallery(root);
  return dst;
}
