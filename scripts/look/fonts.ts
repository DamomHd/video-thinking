/**
 * 字体落地（借鉴 lemo-opuscar TECHNIQUE.md §11）：风格提示词点名的字体从 Google Fonts 取到本地，渲染不依赖网络
 *
 *   vw font fetch "Cormorant Garamond" [--weights=400,600] [--italic]          拉丁字体：整套下载（按 Google 的 unicode-range 分片）
 *   vw font fetch "Noto Serif SC" --weights=700 --film=<片>                     中日韩字体：只取这部片里用到的字（子集，几十 KB）
 *   vw font list
 *
 * 落盘 public/fonts/<slug>/（中日韩字体是 <slug>--<片>/，每部片一份子集）：*.woff2 + faces.json（family / weight / style / unicodeRange / file）+ LICENSE.txt（从 google/fonts 仓库取）。
 * 片子里用 components/fonts 的 useLocalFonts(['<slug>']) 加载（带渲染锁），CSS 里按 family 名字用。
 * 只收 OFL / Apache / UFL 授权的字体（Google Fonts 上的都是）；授权文件取不到就报出来。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;

export interface FontFaceEntry {
  family: string;
  weight: string;
  style: string;
  unicodeRange?: string;
  file: string;
}

export const fontSlug = (family: string) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** 名字看起来是中日韩字体（Noto Sans SC、ZCOOL、LXGW、Ma Shan Zheng…）：要按片子取子集 */
export function isCjkFamily(family: string): boolean {
  return /\b(SC|TC|HK|JP|KR)\b|ZCOOL|LXGW|Ma Shan|Zhi Mang|Long Cang|Liu Jian|Noto (Sans|Serif) (SC|TC|JP|KR)|Mochiy|Kosugi|Sawarabi|Shippori|Zen /i.test(family);
}

/** 解析 Google Fonts CSS2 的 @font-face 块（纯函数） */
export function parseFontCss(css: string): { family: string; weight: string; style: string; unicodeRange?: string; url: string }[] {
  const out: { family: string; weight: string; style: string; unicodeRange?: string; url: string }[] = [];
  for (const m of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const b = m[1];
    const get = (k: string) => b.match(new RegExp(`${k}:\\s*([^;]+);`))?.[1].trim();
    const url = b.match(/url\(([^)]+)\)/)?.[1];
    if (!url) continue;
    out.push({ family: (get('font-family') ?? '').replace(/['"]/g, ''), weight: get('font-weight') ?? '400', style: get('font-style') ?? 'normal', unicodeRange: get('unicode-range'), url });
  }
  return out;
}

/** 一部片里用到的中日韩字符（源码 + 真值 JSON 里出现的），去重排序 */
export function filmCjkText(filmId: string, root = process.cwd()): string {
  const dir = path.join(root, 'src/films', filmId);
  if (!fs.existsSync(dir)) throw new Error(`没有片子 ${filmId}`);
  const set = new Set<string>();
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    const p = path.join(dir, String(f));
    if (!/\.(tsx?|json|md)$/.test(p) || !fs.statSync(p).isFile()) continue;
    for (const ch of fs.readFileSync(p, 'utf-8').match(CJK) ?? []) set.add(ch);
  }
  // 常用标点和数字也带上（字幕、数字常用）
  for (const ch of '，。、：；！？「」『』（）《》—…·0123456789%') set.add(ch);
  return [...set].sort().join('');
}

function curl(url: string, out?: string): string {
  const args = ['-sSfL', '--retry', '2', '-A', UA, url];
  if (out) {
    execFileSync('curl', [...args, '-o', out]);
    return out;
  }
  return execFileSync('curl', args, { encoding: 'utf-8', maxBuffer: 1 << 24 });
}

function fetchLicense(family: string, dest: string): string | null {
  const key = family.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [dir, name] of [['ofl', 'OFL.txt'], ['apache', 'LICENSE.txt'], ['ufl', 'UFL.txt']] as const) {
    try {
      curl(`https://raw.githubusercontent.com/google/fonts/main/${dir}/${key}/${name}`, dest);
      return dir === 'ofl' ? 'SIL OFL 1.1' : dir === 'apache' ? 'Apache 2.0' : 'Ubuntu Font Licence';
    } catch {
      fs.rmSync(dest, { force: true });
    }
  }
  return null;
}

export function fetchFont(family: string, options: { weights?: number[]; italic?: boolean; film?: string; root?: string } = {}): { slug: string; dir: string; faces: FontFaceEntry[]; license: string | null; subset: number | null } {
  const root = options.root ?? process.cwd();
  const weights = options.weights?.length ? options.weights : [400];
  const cjk = isCjkFamily(family);
  if (cjk && !options.film) throw new Error(`「${family}」是中日韩字体，整套太大：加 --film=<片>，只取这部片用到的字`);
  const axis = options.italic ? `ital,wght@${weights.flatMap((w) => [`0,${w}`, `1,${w}`]).join(';')}` : `wght@${weights.join(';')}`;
  const text = cjk ? filmCjkText(options.film!, root) : '';
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:${axis}&display=block${text ? `&text=${encodeURIComponent(text)}` : ''}`;
  let css: string;
  try {
    css = curl(url);
  } catch {
    throw new Error(`Google Fonts 上找不到「${family}」（或这些字重 ${weights.join('/')}）`);
  }
  // 中日韩字体是按片子取的子集：每部片一份（public/fonts/<字体>--<片>/），互不覆盖
  const slug = cjk ? `${fontSlug(family)}--${options.film}` : fontSlug(family);
  const dir = path.join(root, 'public/fonts', slug);
  fs.mkdirSync(dir, { recursive: true });
  // 拉丁字体只留常用的分片（latin / latin-ext），其它文字的分片（西里尔、越南文…）不下
  const faces = parseFontCss(css).filter((f) => cjk || !f.unicodeRange || /U\+0000-00FF|U\+0100-02BA/i.test(f.unicodeRange));
  const out: FontFaceEntry[] = faces.map((f, i) => {
    const file = `${slug}-${f.weight}${f.style === 'italic' ? 'i' : ''}${cjk ? '-subset' : ''}-${i}.woff2`;
    curl(f.url, path.join(dir, file));
    return { family, weight: f.weight, style: f.style, ...(f.unicodeRange && !cjk ? { unicodeRange: f.unicodeRange } : {}), file };
  });
  fs.writeFileSync(path.join(dir, 'faces.json'), JSON.stringify(out, null, 1));
  const license = fetchLicense(family, path.join(dir, 'LICENSE.txt'));
  return { slug, dir, faces: out, license, subset: cjk ? [...text].length : null };
}
