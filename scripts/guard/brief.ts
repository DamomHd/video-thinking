/**
 * 内容策划检查（vw brief <片>）：这段时长里讲哪些核心信息、讲不讲得下、结论出来得够不够早。
 *
 * 读决策单「内容策划」一节的信息表（层级 / 信息点 / 起 / 止 / 承载）和口播 voice.json，给出：
 *   · 信息容量：按时长算口播字数上限（中文约 4 字/秒，留 15% 给静默和过场）和读点上限（约 9 秒一个结论或支撑点）
 *   · 结构：恰好一个结论、支撑点不超过 3 个、每个支撑点至少一个证据
 *   · 时间：结论在前 1/4 出现、每个点在屏幕上停够读完、每个支撑点占多少秒、多长时间没有承载任何信息点
 *   · 纸面稿：口播和屏幕上的字按时间排成一份稿子——不看画面也要能讲通那一句话
 * 只给提示（vw review 汇总），不拦出片。纯函数在前，读文件的入口在最后。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewItem } from './review.js';

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

/** 内容策划检查（纯函数） */
export function briefCheck(rows: BriefRow[], totalSec: number, vo: VoLine[] = []): ReviewItem[] {
  const out: ReviewItem[] = [];
  const T = '内容策划';
  if (!rows.length) return [{ level: 'warn', topic: T, text: '决策单没有「内容策划」信息表（层级 / 信息点 / 起 / 止 / 承载）——先定这段时长讲哪些核心信息，再选风格和画面' }];

  const concl = rows.filter((r) => r.level === '结论');
  const sup = rows.filter((r) => r.level === '支撑');
  const maxPoints = Math.max(2, Math.floor(totalSec / SEC_PER_POINT));
  const voBudget = Math.round(totalSec * VO_CHARS_PER_SEC * VO_FILL);

  out.push({ level: 'ok', topic: T, text: `${totalSec.toFixed(1)}s 的容量：结论 + 支撑最多 ${maxPoints} 个读点、口播最多约 ${voBudget} 字` });

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
  if (concl[0] && concl[0].from > totalSec / 4) out.push({ level: 'warn', topic: T, text: `结论 ${concl[0].from}s 才第一次出现（全片 ${totalSec.toFixed(0)}s）——放进前 1/4（${(totalSec / 4).toFixed(1)}s 内），后面的都是在证明它` });
  else if (concl[0]) out.push({ level: 'ok', topic: T, text: `结论 ${concl[0].from}s 出现（前 1/4 内）` });
  const short = rows.filter((r) => r.screen.length && r.to - r.from < readSec(hanCount(r.screen.join(''))));
  if (short.length) out.push({ level: 'warn', topic: T, text: `屏幕上的字停不够读完：${short.map((r) => `${r.point}（${(r.to - r.from).toFixed(1)}s，要 ${readSec(hanCount(r.screen.join(''))).toFixed(1)}s）`).join('、')}` });
  if (sup.length) out.push({ level: 'ok', topic: T, text: `支撑点时长：${sup.map((s) => `${s.point} ${(s.to - s.from).toFixed(1)}s（${Math.round(((s.to - s.from) / totalSec) * 100)}%）`).join(' · ')}` });

  // 没有承载任何信息点的时长
  const covered = new Array(Math.ceil(totalSec * 10)).fill(false);
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
  const rows = parseBriefTable(director);
  return { items: briefCheck(rows, totalSec, vo), paper: paperScript(rows, vo) };
}
