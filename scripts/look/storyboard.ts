/**
 * 分镜（借鉴 lemo-opuscar DIRECTOR.md §5：用户要了才做）：6–9 个关键镜头用真实画面代码渲出来，拼成一张，每格标镜头号、景别、时长、台词
 *
 *   vw storyboard <片> --shots=<shots.json> [--cols=3]
 *   shots.json = [{ "at": 1.2, "framing": "全景", "dur": "3s", "point": "结论 / 支撑 1…（承载信息表里的哪一点）", "line": "这一格在讲什么 / 台词" }, …]
 *
 * 出 out/<片>/storyboard.png（发给用户，等点头）。字靠无头 Chrome 排版截图（本机 ffmpeg 没有 drawtext）；
 * 没有 Chrome 时退回不带字的拼图 + storyboard.md 文字说明。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { renderStills, tileImages } from './stills.js';

export interface StoryboardShot {
  at: number;
  framing?: string;
  dur?: string;
  /** 这个镜头承载决策单「内容策划」信息表里的哪一点；不承载的写「过场」 */
  point?: string;
  line?: string;
}

const CHROME = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** 分镜页的 HTML（纯函数）：每格一张图 + 镜头号 · 景别 · 时长 + 台词 */
export function storyboardHtml(films: string, cells: { img: string; shot: StoryboardShot }[], cols: number, cellW = 560): string {
  const items = cells
    .map(
      (c, i) => `<figure><img src="${esc(c.img)}"><figcaption><b>#${i + 1}</b> · ${esc(c.shot.framing ?? '')} · ${esc(c.shot.dur ?? '')} · <span class="t">${c.shot.at.toFixed(1)}s</span>${c.shot.point ? ` · <span class="p">${esc(c.shot.point)}</span>` : ''}<br>${esc(c.shot.line ?? '')}</figcaption></figure>`
    )
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#F4F1EA;font:15px "PingFang SC","Hiragino Sans GB",sans-serif;color:#1A1A1A}
h1{font-size:20px;margin:0 0 16px}
.g{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:18px}
figure{margin:0}img{width:${cellW}px;display:block;border:1px solid #ccc}
figcaption{padding:6px 2px 0;line-height:1.45;min-height:44px}.t{color:#888}.p{color:#2F5D8A;font-weight:600}
</style><h1>分镜 · ${esc(films)}</h1><div class="g">${items}</div>`;
}

export async function storyboard(filmId: string, shots: StoryboardShot[], options: { cols?: number } = {}): Promise<{ file: string; withText: boolean }> {
  if (!shots.length) throw new Error('shots 是空的');
  const cols = options.cols ?? 3;
  const out = path.join(process.cwd(), 'out', filmId);
  const dir = path.join(out, 'storyboard');
  fs.rmSync(dir, { recursive: true, force: true });
  const files = await renderStills({ composition: filmId, secs: shots.map((s) => s.at), outDir: dir });
  const md = shots.map((s, i) => `${i + 1}. ${s.at.toFixed(1)}s · ${s.framing ?? ''} · ${s.dur ?? ''}${s.point ? ` · [${s.point}]` : ''} — ${s.line ?? ''}`).join('\n');
  fs.writeFileSync(path.join(out, 'storyboard.md'), `# 分镜 · ${filmId}\n\n${md}\n`);
  const chrome = CHROME.find((c) => fs.existsSync(c));
  const file = path.join(out, 'storyboard.png');
  if (!chrome) {
    tileImages(files, file, { cols, width: 560 });
    return { file, withText: false };
  }
  const html = path.join(dir, 'storyboard.html');
  fs.writeFileSync(html, storyboardHtml(filmId, files.map((f, i) => ({ img: `file://${f}`, shot: shots[i] })), cols));
  const rows = Math.ceil(shots.length / cols);
  const w = 48 + cols * 560 + (cols - 1) * 18;
  const h = 80 + rows * (315 + 70) + (rows - 1) * 18;
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files', `--window-size=${w},${h}`, `--screenshot=${file}`, `file://${html}`], { stdio: 'ignore' });
  return { file, withText: true };
}
