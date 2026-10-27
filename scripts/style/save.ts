/**
 * 沉淀风格（vw style save <片> --id=<风格 id>）
 *
 * 风格库的定位是「事后沉淀」：片子默认不选风格，由模型按内容自己设计主题（theme.ts）；
 * 一部片交付、用户认可它的样子之后，才把它的主题沉淀进风格库，给以后的系列片沿用。
 * 只在用户明确认可后运行。
 *
 * 产出和风格工坊进库的风格同一套结构（风格库规范统一，2026-10-27 用户定）：
 *   src/styles/<id>/style.ts     色板 + 字体 + 图框（取自片子的 theme.ts，片子特有的段不带）
 *   src/styles/<id>/README.md    一句话 / 适合 / 用来做 / 文件说明（来源片子写好，其余由模型按成片写）
 *   src/styles/<id>/STYLE.md     十一节骨架，由模型按成片和用户的话写满
 *   src/styles/<id>/CHANGES.md   沉淀时的取舍表
 *   src/styles/<id>/refs/        poster.jpg（成片海报）+ demo.mp4（软链到成片）+ 从成片均匀抽 4 帧；styleframe.png 由模型挑一帧补上
 *   src/styles/index.ts          登记一行
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { StyleFrame } from '../../src/styles/types.js';

export interface ThemeLike {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  frame?: StyleFrame;
}

/** 风格 id → 常量名（blue-print → BLUE_PRINT） */
export function constNameOf(id: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`风格 id 只能用小写字母、数字和连字符：${id}`);
  return id.replace(/-/g, '_').toUpperCase();
}

/** 生成 style.ts 的源码（纯函数） */
export function styleSource(id: string, label: string, theme: ThemeLike, fromFilm: string): string {
  const C = constNameOf(id);
  const obj = (o: Record<string, unknown>, ind: string) =>
    Object.entries(o)
      .map(([k, v]) => `${ind}${/^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join('\n');
  const frame = theme.frame
    ? `  frame: { margin: ${theme.frame.margin}, tickLen: ${theme.frame.tickLen}, cols: ${theme.frame.cols}, rows: ${JSON.stringify([...theme.frame.rows])} },\n`
    : '';
  return `import { defineStyle } from '../types';

/**
 * ${label}（${id}）
 *
 * 沉淀自片子 ${fromFilm} 的主题（vw style save）。风格只定整体气质：色板、字体${theme.frame ? '、图框' : ''}。
 * 气质描述与参考帧见同目录 README.md、refs/。
 */
export const ${C} = defineStyle({
  id: '${id}',
  label: ${JSON.stringify(label)},
  colors: {
${obj(theme.colors, '    ')}
  },
  fonts: {
${obj(theme.fonts, '    ')}
  },
${frame}});

export type ${C.charAt(0) + C.slice(1).toLowerCase().replace(/_(\w)/g, (_, c) => c.toUpperCase())}Style = typeof ${C};
`;
}

/** 在注册表源码里登记一个风格（纯函数）：加 import、加表项、加导出 */
export function registerStyle(indexSrc: string, id: string): string {
  const C = constNameOf(id);
  if (new RegExp(`\\b${id}\\b\\s*:`).test(indexSrc) || indexSrc.includes(`'./${id}/style'`)) throw new Error(`注册表里已经有风格「${id}」`);
  const imports = [...indexSrc.matchAll(/^import .*;$/gm)];
  const last = imports[imports.length - 1];
  if (!last || last.index === undefined) throw new Error('注册表里找不到 import 行');
  const at = last.index + last[0].length;
  let out = `${indexSrc.slice(0, at)}\nimport { ${C} } from './${id}/style';${indexSrc.slice(at)}`;
  out = out.replace(/(export const STYLES: Record<string, StyleKit> = \{\n(?:.*\n)*?)(\};)/, (_m, body, end) => `${body}  ${/^[a-z]+$/.test(id) ? id : `'${id}'`}: ${C},\n${end}`);
  out = out.replace(/export \{ ([^}]*) \};\s*$/, (_m, names) => `export { ${names.trim()}, ${C} };\n`);
  return out;
}

export function readmeSource(id: string, label: string, fromFilm: string): string {
  return `# ${label}（${id}）

> 沉淀自片子 \`${fromFilm}\`（用户认可后由 \`vw style save\` 生成）。风格只定气质；画面怎么设计由模型按每部片的内容决定（docs/method/、docs/library/）。

**一句话**：（这个风格是什么）

**适合**：（什么片、给谁）

**用来做**：（画幅、时长、有没有口播）

## 文件
- \`STYLE.md\`：完整的风格说明（选了这个风格就按它做）。
- \`CHANGES.md\`：沉淀时相对来源片子做的取舍。
- \`style.ts\`：色板、字体（有图框时含图框）。
- \`refs/demo.mp4\`：样片 = \`${fromFilm}\` 的成片（软链）；\`refs/poster.jpg\`：海报帧；\`refs/styleframe.png\`：风格帧；\`refs/ref-*.jpg\`：成片均匀抽的几帧。

## 样张
\`vw style sheet ${id}\` → \`out/styles/${id}-sheet.png\`。
`;
}

/** 读片子的主题：theme.ts 里第一个带 colors 的导出 */
async function readFilmTheme(filmId: string): Promise<ThemeLike> {
  const p = path.join(process.cwd(), 'src', 'films', filmId, 'theme.ts');
  if (!fs.existsSync(p)) throw new Error(`片子 ${filmId} 没有 theme.ts`);
  const mod = await import(pathToFileURL(p).href);
  const t = Object.values(mod).find((v) => v && typeof v === 'object' && 'colors' in (v as object)) as Partial<ThemeLike> | undefined;
  if (!t?.colors || !t.fonts) throw new Error(`${filmId}/theme.ts 里找不到 colors + fonts`);
  return { colors: t.colors, fonts: t.fonts, frame: t.frame };
}

export async function saveStyle(filmId: string, id: string, label: string): Promise<{ dir: string; refs: number }> {
  const root = process.cwd();
  const dir = path.join(root, 'src', 'styles', id);
  if (fs.existsSync(dir)) throw new Error(`风格目录已存在：src/styles/${id}`);
  const theme = await readFilmTheme(filmId);
  const indexPath = path.join(root, 'src', 'styles', 'index.ts');
  const indexNext = registerStyle(fs.readFileSync(indexPath, 'utf-8'), id);

  fs.mkdirSync(path.join(dir, 'refs'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'style.ts'), styleSource(id, label, theme, filmId), 'utf-8');
  fs.writeFileSync(path.join(dir, 'README.md'), readmeSource(id, label, filmId), 'utf-8');
  fs.writeFileSync(indexPath, indexNext, 'utf-8');

  const { blankStyleMd, CHANGES_HEAD } = await import('./workshop.js');
  fs.writeFileSync(path.join(dir, 'STYLE.md'), blankStyleMd(label, id, `片子 ${filmId}`).replace(/从空白开始；技法借自 .*。/, `自有风格：沉淀自片子 \`${filmId}\`（样片 refs/demo.mp4）。`), 'utf-8');
  fs.writeFileSync(path.join(dir, 'CHANGES.md'), CHANGES_HEAD, 'utf-8');

  let refs = 0;
  const final = path.join(root, 'out', filmId, 'final-60.mp4');
  const poster = path.join(root, 'out', filmId, 'poster.jpg');
  if (fs.existsSync(poster)) fs.copyFileSync(poster, path.join(dir, 'refs', 'poster.jpg'));
  if (fs.existsSync(final)) {
    fs.symlinkSync(path.relative(path.join(dir, 'refs'), final), path.join(dir, 'refs', 'demo.mp4'));
    const { extractRef } = await import('../look/stills.js');
    const r = extractRef(final, path.join(dir, 'refs'), { n: 4 });
    // 风格的参考帧只示意气质：缩略图和通用笔记模板不留，README 里写气质
    fs.rmSync(r.sheet, { force: true });
    fs.rmSync(r.notes, { force: true });
    refs = r.frames.length;
  }
  return { dir, refs };
}
