/**
 * 经验（vw learn）：每部片教会的东西，下一部片开工前先读。
 *
 * 存在 docs/experience.md，一条一行：
 *   - [kind] (主题, 主题) 内容 —— 证据：… （日期）
 * kind 三种，不混用：
 *   preference  用户自己的话，原话引用；对这个用户一直成立，直到他改口
 *   observed    一部片里看到的
 *   verified    两部片以上复现过，或量过
 * 经验只说「怎么做」，不扩大权限；和眼前这部片冲突时，以片子为准，并回头改这条经验。
 */

import fs from 'node:fs';
import path from 'node:path';

export type LearnKind = 'preference' | 'observed' | 'verified';

export interface LearnEntry {
  kind: LearnKind;
  topics: string[];
  text: string;
  line: string;
}

const FILE = () => path.join(process.cwd(), 'docs', 'experience.md');
const RE = /^- \[(preference|observed|verified)\] \(([^)]*)\) (.+)$/;

export function parseExperience(md: string): LearnEntry[] {
  return md
    .split('\n')
    .map((line) => {
      const m = line.match(RE);
      return m ? { kind: m[1] as LearnKind, topics: m[2].split(/[,，]\s*/).map((s) => s.trim()).filter(Boolean), text: m[3], line } : null;
    })
    .filter((e): e is LearnEntry => e !== null);
}

/** 按主题筛（不给主题 = 全部）；用户偏好排最前 */
export function selectEntries(entries: LearnEntry[], topics: string[]): LearnEntry[] {
  const order: Record<LearnKind, number> = { preference: 0, verified: 1, observed: 2 };
  const hit = topics.length ? entries.filter((e) => e.topics.some((t) => topics.includes(t))) : entries;
  return [...hit].sort((a, b) => order[a.kind] - order[b.kind]);
}

export function formatEntry(kind: LearnKind, topics: string[], text: string, evidence: string, date: string): string {
  if (!text.trim()) throw new Error('经验内容不能为空');
  if (!evidence.trim()) throw new Error('要写证据（哪部片、哪句话、哪一帧）');
  return `- [${kind}] (${topics.join(', ')}) ${text.trim()} —— 证据：${evidence.trim()}（${date}）`;
}

export function readEntries(): LearnEntry[] {
  return fs.existsSync(FILE()) ? parseExperience(fs.readFileSync(FILE(), 'utf-8')) : [];
}

export function addEntry(kind: LearnKind, topics: string[], text: string, evidence: string, date: string): string {
  const line = formatEntry(kind, topics, text, evidence, date);
  const cur = fs.existsSync(FILE()) ? fs.readFileSync(FILE(), 'utf-8') : '# 经验\n';
  fs.writeFileSync(FILE(), cur.replace(/\n*$/, '\n') + line + '\n', 'utf-8');
  return line;
}
