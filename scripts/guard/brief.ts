/**
 * 内容策划检查（vw brief <片>）：这段时长里讲哪些核心信息、讲不讲得下、结论出来得够不够早。
 *
 * 读决策单「内容策划」一节的信息表（层级 / 信息点 / 起 / 止 / 承载）和口播 voice.json，给出：
 *   · 信息容量：按时长算口播字数上限（中文约 4 字/秒，留 15% 给静默和过场）和读点上限（约 9 秒一个结论或支撑点）
 *   · 结构：恰好一个结论、支撑点不超过 3 个、每个支撑点至少一个证据
 *   · 时间：结论在前 1/4 出现、每个点在屏幕上停够读完、每个支撑点占多少秒、多长时间没有承载任何信息点
 *   · 纸面稿：口播和屏幕上的字按时间排成一份稿子——不看画面也要能讲通那一句话
 *   · 事实溯源（verify.ts）：屏幕字和口播里的数字要能在决策单「事实清单」里找到出处
 *   · 结构（structure.ts）：前 3 秒有没有信息点、配乐高潮那一刻落下的是哪个信息点
 * 只给提示（vw review 汇总），不拦出片。纯函数在前，读文件的入口在最后。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewItem } from './review.js';
import { planStructureReview, climaxesOf } from './structure.js';
import { factTrace } from './verify.js';

export const VO_CHARS_PER_SEC = 4;
export const VO_FILL = 0.85;
export const SEC_PER_POINT = 9;
/** 中文读字时间：字数 ÷ 4.5 + 1.5 秒（和 vw readcheck 同一个口径） */
export const readSec = (chars: number) => chars / 4.5 + 1.5;

export type Level = '结论' | '支撑' | '证据';
export interface BriefRow {
  level: Level;
  point: string;
  from: number;
  to: number;
  /** 承载：口播句 id（L1、L2…）和屏幕上的字（写在「」里） */
  carry: string;
  voIds: string[];
  screen: string[];
}

const hanCount = (s: string) => [...s].filter((c) => /[\p{L}\p{N}]/u.test(c)).length;

/** 从决策单里取「内容策划」一节的信息表（纯函数）。表头要有 层级 / 信息点 / 起 / 止 / 承载 */
export function parseBriefTable(director: string): BriefRow[] {
  const i = director.indexOf('## 内容策划');
  if (i < 0) return [];
  const rest = director.slice(i + 1);
  const j = rest.search(/\n## /);
  const sec = j < 0 ? rest : rest.slice(0, j);
  const lines = sec.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  const col = (name: string) => head.findIndex((h) => h.includes(name));
  const [cL, cP, cF, cT, cC] = [col('层级'), col('信息点'), col('起'), col('止'), col('承载')];
  if ([cL, cP, cF, cT, cC].some((c) => c < 0)) return [];
  return lines
    .slice(2)
    .map(cells)
    .filter((c) => ['结论', '支撑', '证据'].includes(c[cL]))
    .map((c) => {
      const carry = c[cC] ?? '';
      return {
        level: c[cL] as Level,
        point: c[cP],
        from: Number(c[cF]),
        to: Number(c[cT]),
        carry,
        voIds: [...carry.matchAll(/\bL\d+\b/g)].map((m) => m[0]),
        screen: [...carry.matchAll(/「([^」]+)」/g)].map((m) => m[1]),
      };
    });
}

export interface VoLine {
  id: string;
  text: string;
  sec: number;
  durSec?: number;
}

export type FilmKind = '信息型' | '感受型' | '混合';
export type Span = [number, number];
export interface KindDecl {
  /** null = 决策单没声明片型 */
  kind: FilmKind | null;
  /** 混合片的感受段（乐谱秒）：这些时段不要求承载信息点 */
  spans: Span[];
}

/** 取决策单「内容策划」一节里某个「- 名称（说明）：值」的值（纯函数）；说明括号里可以有冒号 */
export function fieldOf(director: string, name: string): string | undefined {
  const i = director.indexOf('## 内容策划');
  if (i < 0) return undefined;
  const rest = director.slice(i + 1);
  const j = rest.search(/\n## /);
  const sec = j < 0 ? rest : rest.slice(0, j);
  const line = sec.split('\n').find((l) => new RegExp(`^\\s*-\\s*${name}`).test(l));
  if (!line) return undefined;
  const bare = line.replace(/（[^）]*）|\([^)]*\)/g, '');
  const k = bare.search(/[：:]/);
  return k < 0 ? undefined : bare.slice(k + 1).replace(/\*/g, '').trim();
}

/** 片型声明（纯函数）：信息型 / 感受型 / 混合（混合要在「感受段」写时间段，如 0–8s、30–40s；写了感受段没写片型也按混合） */
export function kindOf(director: string): KindDecl {
  const declared = fieldOf(director, '片型')?.match(/信息型|感受型|混合/)?.[0] as FilmKind | undefined;
  // 感受段可以单独一行，也可以跟在片型后面（「混合；感受段：0–6s、30–40s」）
  const segText = (director.split('\n').map((l) => l.replace(/（[^）]*）|\([^)]*\)/g, '').match(/感受段\s*[：:]\s*(.*)$/)?.[1]).find(Boolean)) ?? '';
  const spans = [...segText.matchAll(/(\d+(?:\.\d+)?)\s*s?\s*[-–—~到至]\s*(\d+(?:\.\d+)?)/g)]
    .map((m): Span => [Number(m[1]), Number(m[2])])
    .filter(([a, b]) => b > a);
  return { kind: declared ?? (spans.length ? '混合' : null), spans };
}

/** 没声明按信息型 */
export const filmKindOf = (director: string): FilmKind => kindOf(director).kind ?? '信息型';

/** 感受段合并后的总秒数（落在 0..totalSec 内）（纯函数） */
export function spanSec(spans: Span[], totalSec: number): number {
  const sorted = spans.map(([a, b]): Span => [Math.max(0, a), Math.min(totalSec, b)]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let sum = 0;
  let end = 0;
  for (const [a, b] of sorted) {
    sum += Math.max(0, b - Math.max(a, end));
    end = Math.max(end, b);
  }
  return sum;
}

/** t 秒之前（含）有多少秒在感受段里（纯函数）：把全片时间换算成「只数信息段」的有效时间 */
export function feelSecBefore(spans: Span[], t: number): number {
  return spanSec(spans.map(([a, b]): Span => [a, Math.min(b, t)]), t);
}

export const inSpans = (spans: Span[], t: number) => spans.some(([a, b]) => t >= a && t < b);

/** 感受型 / 混合片的内容策划检查（纯函数）：不要求感受段里有信息点，只要求写清观众的感受怎么走 */
export function feelingCheck(director: string, totalSec = 0): ReviewItem[] {
  const T = '内容策划';
  const { kind, spans } = kindOf(director);
  const line = fieldOf(director, '感受线');
  const head: ReviewItem = kind === '混合'
    ? { level: spans.length ? 'ok' : 'hint', topic: T, text: spans.length ? `片型：混合——感受段 ${spans.map(([a, b]) => `${a}–${b}s`).join('、')}${totalSec ? `（共 ${spanSec(spans, totalSec).toFixed(1)}s）` : ''}，这些时段不要求承载信息点；其余按信息型检查` : '片型写了混合，但「感受段」没写时间段（如 0–8s、30–40s）——工程不知道哪几段不用查信息点' }
    : { level: 'ok', topic: T, text: '片型：感受型——不查信息容量、结论位置和读点；工程只给基础能力，画面怎么走由内容决定' };
  return [
    head,
    line
      ? { level: 'ok', topic: T, text: `感受线：${line}` }
      : { level: 'hint', topic: T, text: '感受型 / 混合片要在「内容策划」写清「感受线」：观众起点感受 → 终点感受，靠什么推进（意象、音乐、空间、节奏）' },
  ];
}

/** 内容策划检查（纯函数） */
export function briefCheck(rows: BriefRow[], totalSec: number, vo: VoLine[] = [], spans: Span[] = []): ReviewItem[] {
  const out: ReviewItem[] = [];
  const T = '内容策划';
  if (!rows.length) return [{ level: 'warn', topic: T, text: '决策单没有「内容策划」信息表（层级 / 信息点 / 起 / 止 / 承载）——先定这段时长讲哪些核心信息，再选风格和画面' }];

  const concl = rows.filter((r) => r.level === '结论');
  const sup = rows.filter((r) => r.level === '支撑');
  // 混合片：感受段不算信息容量；结论出现时刻换算成「只数信息段」的有效时间
  const infoSec = totalSec - spanSec(spans, totalSec);
  const maxPoints = Math.max(2, Math.floor(infoSec / SEC_PER_POINT));
  const voBudget = Math.round(totalSec * VO_CHARS_PER_SEC * VO_FILL);

  out.push({ level: 'ok', topic: T, text: `${totalSec.toFixed(1)}s${infoSec < totalSec ? `（信息段 ${infoSec.toFixed(1)}s）` : ''} 的容量：结论 + 支撑最多 ${maxPoints} 个读点、口播最多约 ${voBudget} 字` });

  // 结构
  if (concl.length !== 1) out.push({ level: 'warn', topic: T, text: `结论要恰好 1 个（现在 ${concl.length} 个）：看完只能记住一句话` });
  if (sup.length > 3) out.push({ level: 'warn', topic: T, text: `支撑点 ${sup.length} 个，超过 3 个——删到最能撑住结论的三个` });
  if (concl.length + sup.length > maxPoints) out.push({ level: 'warn', topic: T, text: `结论 + 支撑共 ${concl.length + sup.length} 个读点，${totalSec.toFixed(0)}s 只装得下 ${maxPoints} 个——删点或加长` });
  let cur: BriefRow | null = null;
  const evidenceOf = new Map<BriefRow, number>();
  for (const r of rows) {
    if (r.level === '支撑') { cur = r; evidenceOf.set(r, 0); }
    else if (r.level === '证据' && cur) evidenceOf.set(cur, (evidenceOf.get(cur) ?? 0) + 1);
  }
  const bare = sup.filter((s) => !evidenceOf.get(s));
  if (bare.length) out.push({ level: 'hint', topic: T, text: `这些支撑点没有证据（下面紧跟一行「证据」）：${bare.map((s) => s.point).join('、')}` });

  // 时间
  const bad = rows.filter((r) => !(r.to > r.from) || r.from < 0 || r.to > totalSec + 0.01);
  if (bad.length) out.push({ level: 'warn', topic: T, text: `起止不对（要 0 ≤ 起 < 止 ≤ ${totalSec.toFixed(1)}）：${bad.map((r) => r.point).join('、')}` });
  const conclEff = concl[0] ? concl[0].from - feelSecBefore(spans, concl[0].from) : 0;
  if (concl[0] && conclEff > infoSec / 4) out.push({ level: 'warn', topic: T, text: `结论 ${concl[0].from}s 才第一次出现（${infoSec < totalSec ? `信息段 ${infoSec.toFixed(0)}s，扣掉前面的感受段后是 ${conclEff.toFixed(1)}s` : `全片 ${totalSec.toFixed(0)}s`}）——放进前 1/4（${(infoSec / 4).toFixed(1)}s 内），后面的都是在证明它` });
  else if (concl[0]) out.push({ level: 'ok', topic: T, text: `结论 ${concl[0].from}s 出现（前 1/4 内${infoSec < totalSec ? '，不数感受段' : ''}）` });
  const short = rows.filter((r) => r.screen.length && r.to - r.from < readSec(hanCount(r.screen.join(''))));
  if (short.length) out.push({ level: 'warn', topic: T, text: `屏幕上的字停不够读完：${short.map((r) => `${r.point}（${(r.to - r.from).toFixed(1)}s，要 ${readSec(hanCount(r.screen.join(''))).toFixed(1)}s）`).join('、')}` });
  if (sup.length) out.push({ level: 'ok', topic: T, text: `支撑点时长：${sup.map((s) => `${s.point} ${(s.to - s.from).toFixed(1)}s（${Math.round(((s.to - s.from) / totalSec) * 100)}%）`).join(' · ')}` });

  // 没有承载任何信息点的时长
  const covered = new Array(Math.ceil(totalSec * 10)).fill(false);
  for (const [a, b] of spans) for (let k = Math.max(0, Math.floor(a * 10)); k < Math.min(covered.length, Math.ceil(b * 10)); k++) covered[k] = true; // 感受段算有承载
  for (const r of rows) for (let k = Math.max(0, Math.floor(r.from * 10)); k < Math.min(covered.length, Math.ceil(r.to * 10)); k++) covered[k] = true;
  const idle = covered.filter((c) => !c).length / 10;
  if (idle > totalSec * 0.15) out.push({ level: 'hint', topic: T, text: `有 ${idle.toFixed(1)}s（${Math.round((idle / totalSec) * 100)}%）没有承载任何信息点——是有意的过场 / 留白吗？` });

  // 口播
  if (vo.length) {
    const chars = vo.reduce((a, l) => a + hanCount(l.text), 0);
    if (chars > voBudget) out.push({ level: 'warn', topic: T, text: `口播 ${chars} 字，超过 ${totalSec.toFixed(0)}s 的容量（约 ${voBudget} 字）——删句子，不要加快语速` });
    else out.push({ level: 'ok', topic: T, text: `口播 ${chars} 字（容量约 ${voBudget} 字）` });
    const ids = new Set(vo.map((l) => l.id));
    const used = new Set(rows.flatMap((r) => r.voIds));
    const missing = [...used].filter((id) => !ids.has(id));
    if (missing.length) out.push({ level: 'warn', topic: T, text: `信息表引用了不存在的口播句：${missing.join('、')}` });
    const idleVo = vo.filter((l) => !used.has(l.id));
    if (idleVo.length) out.push({ level: 'hint', topic: T, text: `这些口播不承载任何信息点（纸面稿里可以删吗？）：${idleVo.map((l) => `${l.id}「${l.text}」`).join('、')}` });
  }
  return out;
}

/** 纸面稿：口播 + 屏幕上的字按时间排（纯函数）——不看画面，这份稿子要能讲通结论 */
export function paperScript(rows: BriefRow[], vo: VoLine[]): string {
  const items: { t: number; kind: string; text: string }[] = [
    ...vo.map((l) => ({ t: l.sec, kind: `口播 ${l.id}`, text: l.text })),
    ...rows.flatMap((r) => r.screen.map((s) => ({ t: r.from, kind: `屏幕 · ${r.level}`, text: s }))),
  ].sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));
  const concl = rows.find((r) => r.level === '结论');
  return [
    concl ? `一句话：${concl.point}` : '一句话：（信息表里没有结论）',
    '',
    ...items.map((x) => `${x.t.toFixed(1).padStart(5)}s  ${x.kind.padEnd(8, '　')}  ${x.text}`),
  ].join('\n');
}

/** vw brief 的入口：读决策单、口播、幕表总长 */
export function runBrief(filmId: string, totalSec: number, root = process.cwd()): { items: ReviewItem[]; paper: string } {
  const dir = path.join(root, 'src', 'films', filmId);
  const dPath = path.join(dir, 'director.md');
  const director = fs.existsSync(dPath) ? fs.readFileSync(dPath, 'utf-8') : '';
  const vPath = path.join(dir, 'audio', 'voice.json');
  const vo: VoLine[] = fs.existsSync(vPath) ? (JSON.parse(fs.readFileSync(vPath, 'utf-8')).lines ?? []) : [];
  const mPath = path.join(dir, 'audio', 'music.json');
  const climaxes = climaxesOf(fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf-8')) : null);
  const rows = parseBriefTable(director);
  const { kind, spans } = kindOf(director);
  if (kind === '感受型') {
    const line = fieldOf(director, '感受线');
    return { items: [...feelingCheck(director), ...factTrace(director, rows, vo)], paper: `（感受型：不出信息纸面稿）${line ? `\n感受线：${line}` : ''}` };
  }
  const note: ReviewItem[] = kind === null
    ? [{ level: 'hint', topic: '内容策划', text: '没声明片型：先判一下——看完要观众复述一句话（信息型），还是留下一种感觉（感受型）？两者都有就写「混合」+「感受段」时间段。现在按信息型检查' }]
    : kind === '混合' ? feelingCheck(director, totalSec) : [];
  return { items: [...note, ...briefCheck(rows, totalSec, vo, spans), ...factTrace(director, rows, vo), ...planStructureReview(rows, climaxes, vo, 1, spans)], paper: paperScript(rows, vo) };
}
