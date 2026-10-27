/**
 * 风格库总览页：vw style gallery → out/styles/gallery.html（浏览器直接打开，离线可看）
 *
 * 按分类排海报（自有风格在前），每张配名字、id、适合做什么；点开看 STYLE.md 全文（生成时转成 HTML 嵌进页面）、
 * 参考帧，收录风格附上游样片视频链接（在线）。图片直接引用 src/styles/<id>/refs/ 里的原图，不复制。
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { indexRowOf, StyleIndexRow } from './index-md.js';

/** 上游画廊的网页版样片（video/mp4，能直接在页面里播）；高清原片在 releases 里（按附件下载） */
const WEB_VIDEO = (slug: string) => `https://lemomo-ai.github.io/lemo-opuscar/films/${slug}.mp4`;
const HD_VIDEO = (slug: string) => `https://github.com/lemomo-ai/lemo-opuscar/releases/download/films/${slug}.mp4`;
/** 本地缓存（vw style gallery --videos 下载）：有就优先播本地的，离线也能看 */
const LOCAL_VIDEO_DIR = (root: string) => path.join(root, 'out/opuscar/films');
const CATEGORY_ORDER = ['剪辑与纪实', '实证影像', '手绘与绘画', '东方传统', '印刷与版画', '图形与排版', '信息与发布', '卡通与动画', '游戏', '电影与时代', '材质与 3D'];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
}

/** 够用的 Markdown → HTML（标题、引用、列表、表格、行内格式；纯函数） */
export function mdToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.split('\n');
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    if (/^\|.*\|$/.test(t)) {
      close();
      const rows: string[] = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(lines[i++].trim());
      i--;
      const cells = (r: string) => r.slice(1, -1).split('|').map((c) => c.trim());
      const body = rows.filter((r) => !/^\|[\s:|-]+\|$/.test(r));
      out.push('<table>' + body.map((r, k) => `<tr>${cells(r).map((c) => (k === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`).join('') + '</table>');
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      close();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      continue;
    }
    if (t.startsWith('>')) {
      close();
      out.push(`<blockquote>${inline(t.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }
    const ul = l.match(/^(\s*)[-*]\s+(.*)$/);
    const ol = l.match(/^(\s*)\d+\.\s+(.*)$/);
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      const indent = (ul ?? ol)![1].length > 0 ? ' class="sub"' : '';
      out.push(`<li${indent}>${inline((ul ?? ol)![2])}</li>`);
      continue;
    }
    close();
    if (t) out.push(`<p>${inline(t)}</p>`);
  }
  close();
  return out.join('\n');
}

interface Card extends StyleIndexRow {
  img: string | null;
  imgs: string[];
  html: string;
  essence: string;
  /** 页面里播放的地址（本地缓存或网页版）和高清下载地址 */
  video: string | null;
  hd: string | null;
}

/** STYLE.md 第一段引用里的一句话本质（收录风格原文是英文） */
function essenceOf(md: string): string {
  const q = md.split('\n').filter((l) => l.startsWith('>') && !/原文：|在本工程里怎么落地|References/.test(l));
  return (q[0] ?? '').replace(/^>\s*/, '').replace(/\*\*/g, '').trim();
}

/** 把收录风格的网页版样片下载到 out/opuscar/films/（已有的跳过），离线也能在总览页里播 */
export function fetchGalleryVideos(root = process.cwd()): { fetched: number; skipped: number; failed: string[] } {
  const dir = path.join(root, 'src/styles');
  const dst = LOCAL_VIDEO_DIR(root);
  fs.mkdirSync(dst, { recursive: true });
  let fetched = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const d of fs.readdirSync(dir).filter((x) => fs.existsSync(path.join(dir, x, 'DEMO.md')))) {
    const slug = d.replace(/-opuscar$/, '');
    const f = path.join(dst, `${slug}.mp4`);
    if (fs.existsSync(f) && fs.statSync(f).size > 10000) {
      skipped++;
      continue;
    }
    try {
      execFileSync('curl', ['-sSfL', '--retry', '2', '-o', `${f}.part`, WEB_VIDEO(slug)]);
      fs.renameSync(`${f}.part`, f);
      fetched++;
    } catch {
      fs.rmSync(`${f}.part`, { force: true });
      failed.push(slug);
    }
  }
  return { fetched, skipped, failed };
}

export function buildGallery(root = process.cwd()): { file: string; count: number } {
  const dir = path.join(root, 'src/styles');
  const outDir = path.join(root, 'out/styles');
  fs.mkdirSync(outDir, { recursive: true });
  const rel = (p: string) => path.relative(outDir, p).split(path.sep).join('/');
  const cards: Card[] = fs
    .readdirSync(dir)
    .filter((d) => fs.existsSync(path.join(dir, d, 'style.ts')) && fs.existsSync(path.join(dir, d, 'README.md')))
    .map((d) => {
      const row = indexRowOf(d, fs.readFileSync(path.join(dir, d, 'README.md'), 'utf-8'));
      const refs = fs.existsSync(path.join(dir, d, 'refs')) ? fs.readdirSync(path.join(dir, d, 'refs')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort((a, b) => Number(b.startsWith('poster')) - Number(a.startsWith('poster'))) : [];
      const mdFile = fs.existsSync(path.join(dir, d, 'STYLE.md')) ? path.join(dir, d, 'STYLE.md') : path.join(dir, d, 'README.md');
      const md = fs.readFileSync(mdFile, 'utf-8');
      return {
        ...row,
        img: refs[0] ? rel(path.join(dir, d, 'refs', refs[0])) : null,
        imgs: refs.map((f) => rel(path.join(dir, d, 'refs', f))),
        html: mdToHtml(md),
        essence: row.own ? row.uses : essenceOf(md),
        ...(() => {
          // 自有风格的样片：refs/demo.mp4（大文件用软链指向原片，不复制）
          const ownDemo = path.join(dir, d, 'refs', 'demo.mp4');
          if (!fs.existsSync(path.join(dir, d, 'DEMO.md'))) return { video: fs.existsSync(ownDemo) ? rel(ownDemo) : null, hd: null };
          const slug = d.replace(/-opuscar$/, '');
          const local = path.join(LOCAL_VIDEO_DIR(root), `${slug}.mp4`);
          return { video: fs.existsSync(local) ? rel(local) : WEB_VIDEO(slug), hd: HD_VIDEO(slug) };
        })(),
      };
    });
  const own = cards.filter((c) => c.own);
  const lib = cards.filter((c) => !c.own);
  const cats = [...new Set(lib.map((c) => c.category!))].sort((a, b) => (CATEGORY_ORDER.indexOf(a) + 99) % 99 - (CATEGORY_ORDER.indexOf(b) + 99) % 99);
  const groups: [string, Card[]][] = [['我的风格', own], ...cats.map((c): [string, Card[]] => [`${c} · ${lib.find((x) => x.category === c)!.categoryEn}`, lib.filter((x) => x.category === c)])];
  const card = (c: Card) =>
    `<button class="card" data-id="${c.id}" data-q="${esc((c.title + ' ' + c.id + ' ' + c.uses + ' ' + c.essence).toLowerCase())}">` +
    (c.img ? `<img loading="lazy" src="${esc(c.img)}" alt="">` : '<div class="noimg">无参考帧</div>') +
    `<div class="t">${esc(c.title)}</div><div class="id">${c.id}</div><div class="u">${esc(c.uses)}</div></button>`;
  const data = Object.fromEntries(cards.map((c) => [c.id, { title: c.title, html: c.html, imgs: c.imgs, video: c.video, hd: c.hd, essence: c.essence }]));
  const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>风格库</title>
<style>
:root{--bg:#F5F2EC;--fg:#1B1A18;--mid:#6E6A63;--line:#DDD7CC;--card:#FFFFFF;--acc:#B5532E}
@media (prefers-color-scheme:dark){:root{--bg:#141414;--fg:#ECE8E1;--mid:#9A958C;--line:#2C2B29;--card:#1E1E1D;--acc:#E0895F}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 "PingFang SC","Hiragino Sans GB",-apple-system,sans-serif}
header{position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line);padding:16px 28px;display:flex;gap:20px;align-items:baseline;flex-wrap:wrap}
h1{margin:0;font-size:22px}header .n{color:var(--mid)}#q{margin-left:auto;font:inherit;padding:7px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);width:min(320px,100%)}
main{padding:8px 28px 60px}section h2{font-size:17px;margin:28px 0 12px}section h2 span{color:var(--mid);font-weight:400;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
.card{all:unset;cursor:pointer;background:var(--card);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.card:hover{border-color:var(--acc)}.card img,.noimg{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:var(--line)}
.noimg{display:flex;align-items:center;justify-content:center;color:var(--mid);font-size:13px}
.card .t{padding:10px 12px 0;font-weight:600}.card .id{padding:0 12px;color:var(--mid);font:12px Menlo,monospace}.card .u{padding:4px 12px 12px;color:var(--mid);font-size:13px}
#d{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;z-index:5}#d.on{display:block}
#p{position:absolute;right:0;top:0;bottom:0;width:min(880px,100%);background:var(--bg);overflow:auto;padding:24px 32px 60px;border-left:1px solid var(--line)}
#p .x{position:sticky;top:0;float:right;font-size:22px;cursor:pointer;background:none;border:0;color:var(--fg)}
#p .v{width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;display:block;margin:6px 0 10px}
#p .imgs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:12px 0}#p .imgs img{width:100%;border-radius:6px}
#p .acts{display:flex;gap:12px;flex-wrap:wrap;margin:6px 0 4px}#p .acts a,#p .acts code{font-size:14px}
#p h2,#p h3{margin:22px 0 8px}#p blockquote{margin:6px 0;padding:6px 12px;border-left:3px solid var(--line);color:var(--mid)}
#p table{border-collapse:collapse;margin:8px 0;font-size:13px;display:block;overflow-x:auto}#p td,#p th{border:1px solid var(--line);padding:4px 8px;vertical-align:top}
#p code{font:13px Menlo,monospace;background:var(--line);padding:1px 4px;border-radius:4px}#p li.sub{margin-left:18px}a{color:var(--acc)}
</style>
<header><h1>风格库</h1><span class="n">${cards.length} 个 · 自有 ${own.length} · 收录 ${lib.length}（lemo-opuscar 完整风格）</span><input id="q" placeholder="搜：名字 / id / 适合做什么"></header>
<main>${groups
    .filter(([, cs]) => cs.length)
    .map(([g, cs]) => `<section><h2>${esc(g)} <span>${cs.length}</span></h2><div class="grid">${cs.map(card).join('')}</div></section>`)
    .join('\n')}</main>
<div id="d"><div id="p"></div></div>
<script>
const D=${JSON.stringify(data).replace(/</g, '\\u003c')};
const p=document.getElementById('p'),d=document.getElementById('d');
function open(id){const s=D[id];p.innerHTML='<button class="x" onclick="shut()">×</button>'+
 (s.video?'<video class="v" controls playsinline preload="metadata" poster="'+(s.imgs[0]||'')+'" src="'+s.video+'"></video>':'')+
 '<div class="acts">'+(s.hd?'<a href="'+s.hd+'" target="_blank">下载高清原片</a>':'')+'<code>用法：做片时说「用 '+id+' 风格」</code><code>改成自己的：vw style fork '+id+' --id=…</code></div>'+
 (s.imgs.length>1||!s.video?'<div class="imgs">'+s.imgs.map(i=>'<img src="'+i+'">').join('')+'</div>':'')+s.html;d.classList.add('on');p.scrollTop=0;history.replaceState(null,'','#'+id)}
function shut(){const v=p.querySelector('video');if(v)v.pause();d.classList.remove('on')}
document.querySelectorAll('.card').forEach(c=>c.onclick=()=>open(c.dataset.id));
d.onclick=e=>{if(e.target===d)shut()};document.onkeydown=e=>{if(e.key==='Escape')shut()};
document.getElementById('q').oninput=e=>{const v=e.target.value.trim().toLowerCase();document.querySelectorAll('.card').forEach(c=>c.style.display=!v||c.dataset.q.includes(v)?'':'none');
 document.querySelectorAll('section').forEach(s=>s.style.display=[...s.querySelectorAll('.card')].some(c=>c.style.display!=='none')?'':'none')};
if(location.hash&&D[location.hash.slice(1)])open(location.hash.slice(1));
</script></html>`;
  const file = path.join(outDir, 'gallery.html');
  fs.writeFileSync(file, html);
  return { file, count: cards.length };
}
