/**
 * 风格索引 src/styles/README.md（借鉴 lemo-opuscar 的 styles/README.md 和「Finding the style」）
 *
 * 用户没点名风格、又想从库里挑时：模型推荐两三个，再把这张全表贴进对话，让用户打字选。自有风格排最前。
 * 由 vw style index 生成；收录导入、vw style keep、vw style save 之后自动重生成。不要手改。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 上游风格分类的顺序（中文名） */
const CATEGORY_ORDER = ['剪辑与纪实', '实证影像', '手绘与绘画', '东方传统', '印刷与版画', '图形与排版', '信息与发布', '卡通与动画', '游戏', '电影与时代', '材质与 3D'];

export interface StyleIndexRow {
  id: string;
  title: string;
  category: string | null;
  categoryEn: string | null;
  uses: string;
  own: boolean;
}

/** 从风格目录的 README 读索引行（纯函数：给 README 文本） */
export function indexRowOf(id: string, readme: string): StyleIndexRow {
  const title = readme.match(/^# (.+)$/m)?.[1].trim() ?? id;
  const cat = readme.match(/分类：([^（\n]+)（([^）\n]+)）/);
  const uses = readme.match(/\*\*适合\*\*：(.+)$/m)?.[1].trim() ?? readme.match(/\*\*(?:气质|一句话)\*\*：(.+)$/m)?.[1].trim() ?? '';
  return { id, title, category: cat?.[1].trim() ?? null, categoryEn: cat?.[2].trim() ?? null, uses, own: !cat };
}

export function styleIndexMd(rows: StyleIndexRow[]): string {
  const own = rows.filter((r) => r.own).sort((a, b) => a.id.localeCompare(b.id));
  const lib = rows.filter((r) => !r.own);
  const cats = [...new Set(lib.map((r) => r.category!))].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 99) % 99 - (CATEGORY_ORDER.indexOf(b) + 99) % 99 || a.localeCompare(b));
  const table = (rs: StyleIndexRow[]) => ['| 风格 | id | 适合 |', '|---|---|---|', ...rs.map((r) => `| [${r.title}](${r.id}/README.md) | \`${r.id}\` | ${r.uses} |`)].join('\n');
  const parts = [
    '# 风格索引',
    '',
    '> 由 `vw style index` 生成，不要手改。片子默认不选风格（模型按内容自己设计主题）；用户想从库里挑时，按题目推荐两三个，再把这张全表贴进对话（中文名），附海报帧（`<id>/refs/poster.jpg`），让用户打字选。选了就读那个风格的 `STYLE.md`（完整风格的约束都在里面）。',
    `> 共 ${rows.length} 个：自有 ${own.length} 个，收录 ${lib.length} 个（lemo-opuscar 完整风格）。只有完整的风格才进库。`,
    '',
    '## 我的风格',
    '',
    own.length ? table(own) : '（还没有）',
    '',
  ];
  for (const c of cats) {
    const rs = lib.filter((r) => r.category === c);
    parts.push(`## ${c} · ${rs[0].categoryEn}（${rs.length}）`, '', table(rs), '');
  }
  return parts.join('\n');
}

export function writeStyleIndex(root = process.cwd()): string {
  const dir = path.join(root, 'src/styles');
  const rows = fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'style.ts')) && fs.existsSync(path.join(dir, d, 'README.md')))
    .map((d) => indexRowOf(d, fs.readFileSync(path.join(dir, d, 'README.md'), 'utf-8')));
  const file = path.join(dir, 'README.md');
  fs.writeFileSync(file, styleIndexMd(rows));
  return file;
}
