import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * 风格守门：片子代码里写死的颜色，是否都在它的色板里
 *
 * 色板 = 片子 theme.ts 导出的主题对象的 colors（从风格派生的片子，extendStyle 已把风格色板合并进来）。
 * 口径：
 *   · 只比 RGB，不比透明度 —— 同一个墨色的 12% / 36% 是同一个颜色的用法，放行
 *   · 纯黑 / 纯白算中性色（阴影、遮罩常用），放行
 *   · theme.ts 自己和 audio/ 目录不扫
 * 第一阶段只报警不拦（用户 2026-10-26 确认：先警告、稳了再改报错）。
 */

export interface StyleGuardReport {
  styleId: string | null;
  paletteSize: number;
  offenders: { color: string; uses: { file: string; line: number }[] }[];
  scannedFiles: number;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;

/** 颜色字面量 → 'rrggbb'（忽略透明度）；不认识的返回 null */
export function normColor(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (t.startsWith('#')) {
    let h = t.slice(1);
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) return h.slice(0, 6);
    return null;
  }
  const m = t.match(/rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.max(0, Math.min(255, Number(v))).toString(16).padStart(2, '0')).join('');
  return null;
}

const NEUTRAL = new Set(['000000', 'ffffff']);

/** 纯函数：给定色板与源码文本，找出不在色板里的颜色 */
export function findOffColors(palette: string[], sources: { file: string; text: string }[]): StyleGuardReport['offenders'] {
  const allowed = new Set(palette.map(normColor).filter((v): v is string => Boolean(v)));
  const hits = new Map<string, { file: string; line: number }[]>();
  for (const { file, text } of sources) {
    text.split('\n').forEach((lineText, i) => {
      // 注释行不算（说明文字里经常引用色值）
      const trimmed = lineText.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
      const found = [...lineText.matchAll(HEX)].map((m) => m[0]).concat([...lineText.matchAll(RGB)].map((m) => m[0]));
      for (const raw of found) {
        const n = normColor(raw);
        if (!n || allowed.has(n) || NEUTRAL.has(n)) continue;
        const key = `#${n}`;
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key)!.push({ file, line: i + 1 });
      }
    });
  }
  return [...hits.entries()].map(([color, uses]) => ({ color, uses })).sort((a, b) => b.uses.length - a.uses.length);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // audio：真值 JSON；directions：开工前的方向关键帧（探索记录，各用各的配色，不属于成片主题）
      if (e.name === 'audio' || e.name === 'directions') continue;
      walk(p, out);
    } else if (/\.(tsx?|css)$/.test(e.name) && e.name !== 'theme.ts') out.push(p);
  }
  return out;
}

export async function checkStyle(filmId: string): Promise<StyleGuardReport | null> {
  const root = process.cwd();
  const dir = path.join(root, 'src', 'films', filmId);
  const themePath = path.join(dir, 'theme.ts');
  if (!fs.existsSync(themePath)) return null;
  const mod = await import(pathToFileURL(themePath).href);
  const theme = Object.values(mod).find((v) => v && typeof v === 'object' && 'colors' in (v as object)) as
    | { colors: Record<string, string>; styleId?: string }
    | undefined;
  if (!theme) return null;
  const palette = Object.values(theme.colors).filter((v) => typeof v === 'string');
  const files = walk(dir);
  const sources = files.map((f) => ({ file: path.relative(root, f), text: fs.readFileSync(f, 'utf-8') }));
  return {
    styleId: theme.styleId ?? null,
    paletteSize: palette.length,
    offenders: findOffColors(palette, sources),
    scannedFiles: files.length,
  };
}
