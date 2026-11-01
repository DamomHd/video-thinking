import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getFilm } from '../../src/films.js';
import { TruthManager } from '../spot/truth.js';
import { camelotTonic } from '../../src/shared/beats.js';
import { buildTimeWarp } from '../../src/shared/timewarp.js';
import { audioRmsLevels, climaxesOf, energyCurve, energyReview, perSecond, shotReview } from './structure.js';
import { acceptanceReview, type Evidence } from './verify.js';
import { filmKindOf } from './brief.js';

/**
 * 导演自检（vw review <片>）：出片后由模型自己跑，对照导演决策单逐项给出提示。
 * 不拦出片（守门是 vw check）；这里的每一条都是「请模型再想一想」的质量提示。
 *
 *   1. 决策单是否填完（src/films/<片>/director.md）
 *   2. 决策与实现是否一致（例：写了要 3D 主镜头，代码里没有 3D）
 *   3. 所有有音高的声音是否在配乐的调内（音高 + 变调 → 音名，调外的报出来）
 *   4. 声音疏密：5 秒窗口里点缀过密 / 长时间没有任何点缀
 *   5. 画面最长静止段（读最近一次成片的运动分析）
 *   6. 外部素材许可证：计划里用到的 freesound / kenney 文件，manifest 里必须记着 CC0 许可证和来源页
 *   7. 设计评审（docs/method/taste.md）：六维各 1–10 分、低分项提醒、分数要配具体缺陷（自查，只提示）；
 *      出过片的话拼一张成片缩略图（out/<片>/sheet.png），模型看过再写评审
 *   8. 结构（structure.ts）：能量曲线、高潮前有没有回落、镜头时长；冷看（critic.ts）的复述对不对得上结论
 */

export interface ReviewItem {
  level: 'ok' | 'hint' | 'warn';
  topic: string;
  text: string;
}

const REQUIRED = ['## 内容策划', '## 标杆', '## 风格与方向', '## 语言与结构', '## 节奏', '## 声音', '## 海报帧', '## 设计评审'];
export const DESIGN_DIMS = ['风格一致性', '视觉层级', '细节工艺', '信息清晰度', '原创性', '冲击力'] as const;
const PASS = 7;
const NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];

/** 决策单检查（纯函数：给文本出条目） */
export function reviewDirector(text: string | null): ReviewItem[] {
  if (text === null) return [{ level: 'warn', topic: '决策单', text: '没有 director.md —— 先按 docs/templates/director.md 写导演决策单（先读 docs/capabilities.md）' }];
  const out: ReviewItem[] = [];
  for (const h of REQUIRED) if (!text.includes(h)) out.push({ level: 'warn', topic: '决策单', text: `缺少一节：${h}` });
  // 设计评审的五个分数项由 reviewDesign 单独检查，这里不当「没填」报
  // 「和样片对照」只在沿用库里风格时检查（reviewDemoContrast）；「有角色时」「分镜（用户要了才做）」是可选项
  const body = text.split('## 自检记录')[0].split('## 设计评审')[0].split('## 和样片对照')[0];
  const OPTIONAL = /^- (有角色时|分镜|感受线|感受段|口播（默认没有|中段的「静 → 爆」)/;
  // 感受型片：事实清单 / 信息容量 / 纸面检验 / 一句话是信息型专属项，留空不算没填
  const FEELING_SKIP = /^- (事实清单|信息容量|纸面检验|一句话)/;
  const feeling = filmKindOf(text) === '感受型';
  const empties = body.split('\n').filter((l) => /^- [^：:]+[：:]\s*$/.test(l.trim()) && !OPTIONAL.test(l.trim()) && !(feeling && FEELING_SKIP.test(l.trim())));
  if (empties.length) out.push({ level: 'warn', topic: '决策单', text: `${empties.length} 项没填：${empties.map((l) => l.trim().replace(/^- /, '').replace(/[：:]\s*$/, '')).slice(0, 5).join('、')}` });
  if (/待定|TODO|<片名>|<style id>/.test(body)) out.push({ level: 'warn', topic: '决策单', text: '还有「待定 / TODO / 模板占位」没替换' });
  const hero = body.match(/主镜头[：:]\s*\**\s*(是|否)/);
  if (!hero) out.push({ level: 'warn', topic: '决策单', text: '「主镜头」没有明确写「是」或「否」' });
  if (!out.length) out.push({ level: 'ok', topic: '决策单', text: '各节都已填写' });
  return out;
}

/** 片子沿用了库里的哪个风格：theme.ts 里 extendStyle 了、并从 styles/<id>/style 导入（没有就是自定主题） */
export function libraryStyleOf(themeSrc: string | null): string | null {
  if (!themeSrc || !/extendStyle\s*\(/.test(themeSrc)) return null;
  return themeSrc.match(/from\s+['"][./]*(?:src\/)?styles\/([a-z0-9-]+)\/style['"]/)?.[1] ?? null;
}

/**
 * 沿用库里风格的片子：「和样片对照」六项都要写，至少四项「不同」（借鉴 lemo-opuscar DIRECTOR.md §11「Not the demo again」）。
 * 每项写成「不同：…」或「相同：…」。
 */
export function reviewDemoContrast(text: string | null, styleId: string | null): ReviewItem[] {
  if (!styleId) return [];
  const sec = text ? section(text, '## 和样片对照') : null;
  if (!sec) return [{ level: 'warn', topic: '和样片对照', text: `沿用了风格 ${styleId}，决策单要写「和样片对照」：结构 / 开场 / 标志镜头 / 镜头路线 / 配乐形状 / 结尾，至少四项和样片不同` }];
  const items = ['结构', '开场', '标志镜头', '镜头路线', '配乐形状', '结尾'];
  const lines = sec.split('\n');
  const val = (k: string) => lines.find((l) => l.trim().startsWith(`- ${k}`))?.split(/[：:]/).slice(1).join('：').trim() ?? '';
  const empty = items.filter((k) => !val(k));
  if (empty.length) return [{ level: 'warn', topic: '和样片对照', text: `没写：${empty.join('、')}（每项写「不同：…」或「相同：…」）` }];
  const diff = items.filter((k) => /^不同/.test(val(k))).length;
  return diff >= 4
    ? [{ level: 'ok', topic: '和样片对照', text: `六项里 ${diff} 项和 ${styleId} 的样片不同` }]
    : [{ level: 'warn', topic: '和样片对照', text: `只有 ${diff} 项和样片不同（要至少 4 项）：别又拍成 ${styleId} 的样片，重想相同的那几项` }];
}

/** 取决策单里的某一节（到下一个 ## 为止） */
function section(text: string, head: string): string | null {
  const i = text.indexOf(head);
  if (i < 0) return null;
  const rest = text.slice(i + head.length);
  const j = rest.search(/\n## /);
  return j < 0 ? rest : rest.slice(0, j);
}

/**
 * 配乐是不是为这部片写的（纯函数）：vw music match --local 的本地作曲是一份通用模板
 * （C 大调 / A 小调、I–V–vi–IV、固定的段落和鼓型，只按速度、片长、高潮伸缩；--sampled 只换音色），
 * 每部片听起来是同一首。按片作曲（audio/score.ts）或外部曲目才算这部片自己的配乐。
 */
export function musicOriginReview(tracks: { title?: string; source?: string; key?: string; bpm?: number }[]): ReviewItem[] {
  const T = '配乐';
  if (!tracks.length) return [];
  const tpl = tracks.filter((t) => t.source === 'local-sampled' || t.title === '本地合成配乐');
  if (tpl.length) return [{ level: 'warn', topic: T, text: `配乐用的是通用模板（${tpl.map((t) => t.title).join('、')}）：调性、和弦进行、段落、鼓型每部片都一样，只有速度和长度不同——为这部片写 audio/score.ts（shared/score 的 defineScore；画面已排好就用 grid.lock: false + g.hit() 贴着画面写），再跑 vw music score` }];
  const own = tracks.filter((t) => t.source === 'score');
  return [{ level: 'ok', topic: T, text: own.length ? `按片作曲（${own.map((t) => `${t.key ?? '?'} · ${t.bpm ?? '?'} BPM`).join('、')}）` : `外部曲目：${tracks.map((t) => t.title).join('、')}` }];
}

/**
 * 设计评审检查（纯函数）：六维都要有 1–10 的分（同一维写了两轮时取最后一个，即交付前那轮），
 * 低于 7 的提醒「建议先改」，「缺陷与处理」不能空。评审是自查工具，不限制设计：这里只给提示（hint），不报警告。
 */
export function reviewDesign(text: string | null): ReviewItem[] {
  if (text === null) return [];
  const sec = section(text, '## 设计评审');
  if (sec === null) return [{ level: 'hint', topic: '设计评审', text: '决策单没有「设计评审」一节（按 docs/method/taste.md 的评审表，海报帧和交付前各评一轮）' }];
  const scores: Record<string, number> = {};
  for (const line of sec.split('\n')) {
    for (const d of DESIGN_DIMS) {
      const m = line.match(new RegExp(`${d}[^\\d\\n]*?(\\d+(?:\\.\\d+)?)`));
      if (m && line.includes(d)) scores[d] = Number(m[1]);
    }
  }
  const out: ReviewItem[] = [];
  const missing = DESIGN_DIMS.filter((d) => !(d in scores));
  if (missing.length) out.push({ level: 'hint', topic: '设计评审', text: `没打分：${missing.join('、')}` });
  const low = DESIGN_DIMS.filter((d) => d in scores && scores[d] < PASS);
  if (low.length) out.push({ level: 'hint', topic: '设计评审', text: `低于 ${PASS} 分，建议先改：${low.map((d) => `${d} ${scores[d]}`).join('、')}` });
  const defects = sec.match(/缺陷与处理[：:]\s*([^\n]*)/)?.[1]?.trim() ?? '';
  if (defects.length < 8) out.push({ level: 'hint', topic: '设计评审', text: '「缺陷与处理」没写具体内容：分数要配具体缺陷（哪一帧 / 哪个元素 / 怎么改）' });
  if (!out.length) out.push({ level: 'ok', topic: '设计评审', text: DESIGN_DIMS.map((d) => `${d} ${scores[d]}`).join(' · ') });
  return out;
}

/** 声音疏密（纯函数）：按 win 秒窗口统计点缀（UI / IMPACT / WHOOSH / RISER），给出过密窗口和最长空档 */
/** 往期片：有海报的其他片子，按出片时间从新到旧取 n 部（纯函数） */
export function recentFilms(entries: { id: string; mtimeMs: number }[], exclude: string, n = 3): string[] {
  return entries.filter((e) => e.id !== exclude).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, n).map((e) => e.id);
}

/** 质感床（TEX 层）覆盖了多少：空着只提示（有的片子就是要干净），不拦 */
export function bedReview(items: { layer: string; fromSec: number; durSec?: number }[], totalSec: number): ReviewItem[] {
  const tex = items.filter((i) => i.layer === 'TEX');
  if (!tex.length) return [{ level: 'hint', topic: '质感床', text: '质感床是空的：段落底下没有铺长音色（shared/beds.ts 的 sectionBeds）——是有意让它干净吗？在决策单「声音 · 质感床」写明' }];
  const covered = new Array(Math.ceil(totalSec * 10)).fill(false);
  for (const t of tex) for (let k = Math.max(0, Math.floor(t.fromSec * 10)); k < Math.min(covered.length, Math.ceil((t.fromSec + (t.durSec ?? 0)) * 10)); k++) covered[k] = true;
  const pct = Math.round((covered.filter(Boolean).length / Math.max(1, covered.length)) * 100);
  return [{ level: 'ok', topic: '质感床', text: `质感床 ${tex.length} 段，铺了全片的 ${pct}%` }];
}

export function densityReview(items: { layer: string; fromSec: number }[], totalSec: number, options: { win?: number; maxPerWin?: number; maxGapSec?: number } = {}): ReviewItem[] {
  const win = options.win ?? 5;
  const maxPerWin = options.maxPerWin ?? 16;
  const maxGap = options.maxGapSec ?? 5;
  const accents = items.filter((i) => i.layer !== 'BG' && i.layer !== 'TEX').map((i) => i.fromSec).sort((a, b) => a - b);
  const out: ReviewItem[] = [];
  for (let a = 0; a < totalSec; a += win) {
    const n = accents.filter((t) => t >= a && t < a + win).length;
    if (n > maxPerWin) out.push({ level: 'hint', topic: '声音疏密', text: `${a.toFixed(0)}–${(a + win).toFixed(0)}s 有 ${n} 个点缀，可能太密（重点会被淹没）` });
  }
  const pts = [0, ...accents, totalSec];
  let gap = 0;
  let at = 0;
  for (let i = 1; i < pts.length; i++) if (pts[i] - pts[i - 1] > gap) { gap = pts[i] - pts[i - 1]; at = pts[i - 1]; }
  if (gap > maxGap) out.push({ level: 'hint', topic: '声音疏密', text: `${at.toFixed(1)}s 起有 ${gap.toFixed(1)}s 没有任何点缀 —— 是有意留白吗？` });
  if (!out.length) out.push({ level: 'ok', topic: '声音疏密', text: `点缀 ${accents.length} 个，疏密正常` });
  return out;
}

/** 许可证核对（纯函数）：planFiles = 计划里用到的文件；manifest 条目带 source / license / url */
export function licenseReview(planFiles: string[], entries: { file: string; source?: string; license?: string; url?: string }[]): ReviewItem[] {
  const byFile = new Map(entries.map((e) => [e.file, e]));
  const external = [...new Set(planFiles)].filter((f) => /^sfx-lib\/(freesound|kenney)\//.test(f) || byFile.get(f)?.source === 'freesound');
  if (!external.length) return [{ level: 'ok', topic: '许可证', text: '没有用到外部素材（本地合成 / Epidemic）' }];
  const bad = external.filter((f) => {
    const e = byFile.get(f);
    return !e || !/publicdomain\/zero/.test(e.license ?? '') || !e.url;
  });
  if (bad.length) return [{ level: 'warn', topic: '许可证', text: `${bad.length} 个外部素材没有 CC0 许可证或来源页记录：${bad.slice(0, 4).join('、')}` }];
  const n = (src: string) => external.filter((f) => f.startsWith(`sfx-lib/${src}/`)).length;
  const m = external.filter((f) => f.startsWith('music/')).length;
  return [{ level: 'ok', topic: '许可证', text: `外部素材 ${external.length} 个（freesound ${n('freesound')} · kenney ${n('kenney')}${m ? ` · 配乐 ${m}` : ''}）全部 CC0，来源页已记录` }];
}

/** 口播（可选层）：没有口播表就不提；有就看是否都配好、都核对过、有没有前句没念完后句就开口 */
export function voiceReview(file: string): ReviewItem[] {
  if (!fs.existsSync(file)) return [];
  const v = JSON.parse(fs.readFileSync(file, 'utf-8')) as { engine: string; lines: { id: string; file?: string; durSec?: number; checked?: boolean; sec: number }[] };
  const missing = v.lines.filter((l) => !l.file);
  const unchecked = v.lines.filter((l) => l.file && !l.checked);
  const s = [...v.lines].filter((l) => l.durSec).sort((a, b) => a.sec - b.sec);
  const overlaps = s.slice(0, -1).filter((l, i) => l.sec + l.durSec! > s[i + 1].sec + 1e-3).length;
  if (missing.length || unchecked.length || overlaps)
    return [{ level: 'warn', topic: '口播', text: `${missing.length ? `${missing.length} 句还没配音（vw voice film）` : ''}${unchecked.length ? ` ${unchecked.length} 句没通过转写核对：${unchecked.map((l) => l.id).join('、')}` : ''}${overlaps ? ` ${overlaps} 处前句没念完后句就开口` : ''}`.trim() }];
  return [{ level: 'ok', topic: '口播', text: `${v.lines.length} 句口播（${v.engine}）都配好、都通过转写核对` }];
}

/**
 * 声音规则（借鉴 lemo-opuscar DIRECTOR §6）：只提示。
 *   silences      成片音轨里的静默段（秒），至少两处：转折 / 情绪顶点前要有真静默
 *   crossings     有几个段落交界是被声音「带过去」的（一个声音在交界前就响起、并越过交界）
 *   designLayers  决策单「声音设计表」里提到的层，各有几个片段
 */
export function soundRulesReview(o: { silences: [number, number][]; deepest?: number; crossings: number; boundaries: number; designLayers: { name: string; count: number }[] }): ReviewItem[] {
  const out: ReviewItem[] = [];
  const T = '声音规则';
  out.push(o.silences.length >= 2
    ? { level: 'ok', topic: T, text: `真静默 ${o.silences.length} 处（${o.silences.slice(0, 4).map(([a]) => `${a.toFixed(1)}s`).join('、')}）` }
    : { level: 'hint', topic: T, text: `真静默只有 ${o.silences.length} 处${o.deepest !== undefined ? `（最安静的一处只比平时低 ${o.deepest} dB）` : ''}：转折或情绪顶点前至少留两处（比平时低 12 dB 以上、≥ 0.3s，底噪和配乐尾巴也要收），静默后的第一个声音要是最重要的声音之一` });
  if (o.boundaries > 0)
    out.push(o.crossings >= 2
      ? { level: 'ok', topic: T, text: `${o.crossings} 个段落交界由声音带过去（下一段的声音先进来 / 上一段的拖过去）` }
      : { level: 'hint', topic: T, text: `只有 ${o.crossings} 个段落交界由声音带过去：至少两处让下一段的声音提前进来，或让上一段的声音拖过交界` });
  const empty = o.designLayers.filter((l) => l.count === 0);
  if (empty.length) out.push({ level: 'hint', topic: T, text: `决策单声音设计表里写了，混音里却是空的：${empty.map((l) => l.name).join('、')}` });
  else if (o.designLayers.length) out.push({ level: 'ok', topic: T, text: `声音设计表里写到的层都在混音里（${o.designLayers.map((l) => `${l.name} ${l.count}`).join('、')}）` });
  return out;
}

/** 近乎静默的段（纯函数）：电平比全片中位数低 belowDb 以上、持续 ≥ minSec；顺带给出最安静的一处比中位数低多少 */
export function quietRuns(levels: number[], stepSec: number, belowDb = 12, minSec = 0.3): { runs: [number, number][]; deepestBelowMedian: number } {
  if (!levels.length) return { runs: [], deepestBelowMedian: 0 };
  const sorted = [...levels].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const th = median - belowDb;
  const runs: [number, number][] = [];
  let start = -1;
  levels.forEach((l, i) => {
    if (l <= th && start < 0) start = i;
    if ((l > th || i === levels.length - 1) && start >= 0) {
      const end = l > th ? i : i + 1;
      if ((end - start) * stepSec >= minSec) runs.push([Math.round(start * stepSec * 10) / 10, Math.round(end * stepSec * 10) / 10]);
      start = -1;
    }
  });
  // 最安静的一处：去掉开头结尾各 0.5 秒（淡入淡出不算）
  const inner = levels.slice(Math.ceil(0.5 / stepSec), Math.max(Math.ceil(0.5 / stepSec) + 1, levels.length - Math.ceil(0.5 / stepSec)));
  return { runs, deepestBelowMedian: Math.round((median - Math.min(...inner)) * 10) / 10 };
}

/** 被声音带过的段落交界（纯函数）：片段在交界前 ≥ 0.15s 开始、在交界后 ≥ 0.15s 才结束；铺底层（BG / TEX 床）不算 */
export function soundCrossings(spots: { layer: string; fromSec: number; durSec: number; loop?: boolean }[], boundaries: number[]): number {
  return boundaries.filter((b) => spots.some((s) => s.layer !== 'BG' && !s.loop && s.fromSec < b - 0.15 && s.fromSec + s.durSec > b + 0.15)).length;
}

/** 人声比配乐高多少（纯函数）：每句 = 口播平均电平 − 同一时段（让位后）配乐的平均电平；目标约 10 dB，低于 8 提示 */
export function voiceBalanceReview(rows: { id: string; voiceDb: number; musicDb: number }[], target = 10): ReviewItem[] {
  const r = rows.filter((x) => isFinite(x.voiceDb) && isFinite(x.musicDb)).map((x) => ({ ...x, d: Math.round((x.voiceDb - x.musicDb) * 10) / 10 }));
  if (!r.length) return [];
  const low = r.filter((x) => x.d < target - 2);
  const min = Math.min(...r.map((x) => x.d));
  if (low.length) return [{ level: 'hint', topic: '口播', text: `${low.length} 句人声只比配乐高 ${low.map((x) => `${x.id} ${x.d} dB`).join('、')}（建议约 ${target} dB）：加大 voice.json 的 duckDb 让配乐多退一点，或抬 mix.json 的 VO 层` }];
  return [{ level: 'ok', topic: '口播', text: `人声比配乐高 ${min}–${Math.max(...r.map((x) => x.d))} dB（目标约 ${target} dB）` }];
}

/** 读字检查的结果（vw readcheck 写的 out/<片>/readcheck.json）：只提示，列最差的几段 */
export function readReview(file: string): ReviewItem[] {
  if (!fs.existsSync(file)) return [{ level: 'hint', topic: '读字', text: '还没跑读字检查：vw readcheck <片>（每段字完整可读的时间够不够读完）' }];
  const r = JSON.parse(fs.readFileSync(file, 'utf-8')) as { runs: { text: string; from: number; held: number; need: number }[]; violations: { text: string; from: number; held: number; need: number }[]; covers?: { from: number; text: string }[] };
  const coverItems: ReviewItem[] = r.covers?.length ? [{ level: 'warn', topic: '字幕', text: `字幕压住了画面上的字 ${r.covers.length} 处：${r.covers.slice(0, 3).map((c) => `${c.from.toFixed(1)}s「${c.text.slice(0, 12)}」`).join('；')}（挪字幕或挪画面上的字）` }] : [];
  if (!r.violations.length) return [{ level: 'ok', topic: '读字', text: `${r.runs.length} 段字都停够了读完的时间` }, ...coverItems];
  const worst = [...r.violations].sort((a, b) => a.held / a.need - b.held / b.need).slice(0, 4);
  return [{
    level: 'hint',
    topic: '读字',
    text: `${r.violations.length} / ${r.runs.length} 段字停留不够读完（中文 字数÷4.5+1.5s）。最差：${worst.map((v) => `${v.from.toFixed(1)}s「${v.text.slice(0, 14)}」${v.held.toFixed(1)}/${v.need.toFixed(1)}s`).join('；')}`,
  }, ...coverItems];
}

/** 采样乐器演奏的配乐：署名行要在；用到 CC BY 的库（钢琴 Salamander、鼓组 MuldjordKit）时提醒交付时署名 */
export function sampledMusicReview(entries: { file: string; source?: string; license?: string }[]): ReviewItem[] {
  const s = entries.filter((e) => e.source === 'local-sampled' || e.source === 'score');
  if (!s.length) return [];
  const missing = s.filter((e) => !e.license);
  if (missing.length) return [{ level: 'warn', topic: '许可证', text: `采样配乐没有记录署名行：${missing.map((e) => e.file).join('、')}（重跑 vw music match --local --sampled，按片作曲重跑 vw music score）` }];
  const ccby = s.filter((e) => /CC BY/i.test(e.license ?? ''));
  if (ccby.length) return [{ level: 'hint', topic: '许可证', text: `采样配乐用到了要署名的库，交付时附上：${ccby.map((e) => e.license).join(' / ')}` }];
  return [{ level: 'ok', topic: '许可证', text: `采样配乐 ${s.length} 段，采样库全部 CC0（${s[0].license}）` }];
}

/** 调内音阶（自然大调 / 自然小调的音名集合，A=0） */
export function keyPitchClasses(camelot: string | undefined): Set<number> {
  const { semisFromA, minor } = camelotTonic(camelot);
  const sc = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  return new Set(sc.map((d) => (semisFromA + d) % 12));
}

/** 估计一个音频文件的基频：返回 [周期性 0..1, 频率 Hz]（周期性低 = 没有明确音高） */
function estimatePitch(abs: string): [number, number] {
  const SR = 16000;
  let buf: Buffer;
  try {
    buf = execFileSync('ffmpeg', ['-v', 'error', '-i', abs, '-ac', '1', '-ar', String(SR), '-t', '1.2', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
  } catch {
    return [0, 0];
  }
  const x = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
  // 从峰值后 20ms 开始取 2048 点
  let pk = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > Math.abs(x[pk])) pk = i;
  const s0 = Math.min(x.length - 4096, pk + Math.round(0.02 * SR));
  if (s0 < 0) return [0, 0];
  const L = 2048;
  let e = 0;
  for (let k = 0; k < L; k++) e += x[s0 + k] * x[s0 + k];
  if (e <= 0) return [0, 0];
  let best = 0;
  let lag0 = 0;
  for (let lag = Math.round(SR / 2000); lag < Math.round(SR / 70); lag++) {
    let c = 0;
    for (let k = 0; k < L; k++) c += x[s0 + k] * x[s0 + k + lag];
    if (c / e > best) { best = c / e; lag0 = lag; }
  }
  return [best, lag0 ? SR / lag0 : 0];
}

export async function runReview(filmId: string): Promise<ReviewItem[]> {
  const root = process.cwd();
  const dir = path.join(root, 'src', 'films', filmId);
  const items: ReviewItem[] = [];

  // 1. 决策单
  const dPath = path.join(dir, 'director.md');
  const dText = fs.existsSync(dPath) ? fs.readFileSync(dPath, 'utf-8') : null;
  items.push(...reviewDirector(dText));
  // 内容策划：这段时长里讲哪些核心信息（vw brief 同一套检查）
  {
    const { runBrief } = await import('./brief.js');
    const total = (await getFilm(filmId).getAdapter()).timeline.totalSeconds;
    items.push(...runBrief(filmId, total, root).items.filter((i) => i.level !== 'ok' || /结论 .*出现/.test(i.text) || i.topic === '事实溯源'));
  }
  const early = items.length;
  items.push(...reviewDemoContrast(dText, libraryStyleOf(fs.existsSync(path.join(dir, 'theme.ts')) ? fs.readFileSync(path.join(dir, 'theme.ts'), 'utf-8') : null)));

  // 2. 决策与实现：主镜头
  if (dText) {
    const hero = dText.split('## 自检记录')[0].match(/主镜头[：:]\s*\**\s*(是|否)/)?.[1];
    // directions/ 是开工前的方向关键帧（探索记录），不算片子的实现
    const src = walk(dir).filter((f) => /\.tsx?$/.test(f) && !f.includes(`${path.sep}directions${path.sep}`)).map((f) => fs.readFileSync(f, 'utf-8')).join('\n');
    const uses3d = /BridgeStage|FilmCanvas|ThreeCanvas|GlbAsset/.test(src);
    if (hero === '是' && !uses3d) items.push({ level: 'warn', topic: '决策 ↔ 实现', text: '决策单写了要 3D 主镜头，但片子代码里没有用到 3D（BridgeStage / FilmCanvas …）' });
    else if (hero === '否' && uses3d) items.push({ level: 'hint', topic: '决策 ↔ 实现', text: '决策单写了不要主镜头，但代码里用到了 3D —— 决策单要不要更新？' });
    else if (hero) items.push({ level: 'ok', topic: '决策 ↔ 实现', text: `主镜头「${hero}」与实现一致` });
  }

  // 3. 调内检查
  const truth = new TruthManager(filmId).readAll();
  const key = truth.music?.cues?.[0]?.track?.key;
  const pcs = keyPitchClasses(key);
  const cache = new Map<string, [number, number]>();
  const off: string[] = [];
  let tonal = 0;
  for (const it of truth.plan) {
    const abs = path.join(root, 'public', it.file);
    if (!fs.existsSync(abs)) continue;
    if (!cache.has(it.file)) cache.set(it.file, estimatePitch(abs));
    const [periodicity, f] = cache.get(it.file)!;
    if (periodicity < 0.6 || !f) continue; // 没有明确音高（噪声、咔哒）不查
    tonal++;
    const pc = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12) % 12; // 文件已变调过，直接测的就是最终音高
    if (!pcs.has(pc)) off.push(`${it.key}（${NAMES[pc]}）`);
  }
  if (!key) items.push({ level: 'hint', topic: '调内', text: '配乐没有调号（music.json track.key），无法检查音效是否在调内' });
  else if (off.length) items.push({ level: 'warn', topic: '调内', text: `${off.length} 个有音高的音效不在配乐调（${key}）内：${off.slice(0, 6).join('、')}${off.length > 6 ? '…' : ''}` });
  else items.push({ level: 'ok', topic: '调内', text: `${tonal} 个有音高的音效全部在配乐调（${key}）内` });

  // 4. 声音疏密
  const adapter = await getFilm(filmId).getAdapter();
  items.push(...densityReview(truth.plan, adapter.timeline.totalSeconds));
  items.push(...bedReview(truth.plan, adapter.timeline.totalSeconds));
  let soundItems: ReviewItem[] = [];
  let audioAudit: ReviewItem[] = [];
  let criticState: Evidence['critic'] = 'none';
  {
    // 声音规则：静默（成片音轨）、段落交界的声音转场、声音设计表里的层
    const boundaries = adapter.timeline.scenes.slice(1).map((s) => s.start);
    const audio = path.join(root, 'out', filmId, 'audio.wav');
    let silences: [number, number][] = [];
    let deepest: number | undefined;
    if (fs.existsSync(audio)) {
      // 每 0.1 秒一个 RMS（ffmpeg astats），交给 quietRuns 找「比全片中位数低 12 dB 以上、持续 ≥ 0.3s」的段
      const levels = audioRmsLevels(audio, 0.1);
      const q = quietRuns(levels, 0.1);
      silences = q.runs.filter(([a, b]) => a > 0.5 && b < levels.length * 0.1 - 0.5);
      deepest = q.deepestBelowMedian;
    }
    const table = (dText ?? '').match(/声音设计表[^：:\n]*[：:]([^\n]*)/)?.[1] ?? '';
    const LAYER_WORDS: [string, string, RegExp][] = [['底噪 / 氛围', 'BG', /底噪|氛围|环境声/], ['质感床', 'TEX', /质感床/], ['配乐', 'MUSIC', /配乐|音乐/], ['口播', 'VO', /口播|旁白/]];
    const count = (layer: string) =>
      layer === 'MUSIC' ? truth.music.cues.filter((c) => c.track?.file).length
        : layer === 'VO' ? ((truth as { voice?: { lines: unknown[] } }).voice?.lines.length ?? (fs.existsSync(path.join(dir, 'audio', 'voice.json')) ? 1 : 0))
          : truth.plan.filter((p) => p.layer === layer).length;
    const designLayers = LAYER_WORDS.filter(([, , re]) => re.test(table)).map(([name, layer]) => ({ name, count: count(layer) }));
    soundItems = soundRulesReview({ silences, deepest, crossings: soundCrossings(truth.plan, boundaries), boundaries: boundaries.length, designLayers });
    items.push(...soundItems);
  }

  // 音效反查：计划里的点类音效，在成片音轨里真的响了吗（需要先出片）
  {
    const { runAudioAudit } = await import('./audio-audit.js');
    const a = await runAudioAudit(filmId, root);
    items.push(...a);
    audioAudit = a;
  }

  // 6. 外部素材许可证
  const { readManifest } = await import('../spot/plan.js');
  const manifest = readManifest(filmId);
  // 配乐也算：music/ 下的 Freesound 配乐要在 music.json 的 track 上记着 CC0 与来源页
  const musicEntries = (truth.music?.cues ?? []).filter((c) => c.track?.file).map((c) => ({ file: c.track!.file, source: c.track!.source, license: c.track!.license, url: c.track!.url }));
  const musicFiles = musicEntries.filter((e) => e.source === 'freesound').map((e) => e.file);
  items.push(...licenseReview([...truth.plan.map((p) => p.file), ...musicFiles], [...Object.values(manifest).flat(), ...musicEntries]));
  items.push(...sampledMusicReview(musicEntries));
  items.push(...musicOriginReview((truth.music?.cues ?? []).filter((c) => c.track?.file).map((c) => c.track!)));
  items.push(...readReview(path.join(root, 'out', filmId, 'readcheck.json')));
  items.push(...voiceReview(path.join(root, 'src', 'films', filmId, 'audio', 'voice.json')));
  // 人声比配乐高多少：按真值算（口播文件电平 + VO 层 / 单句增益；配乐文件同一时段电平 + 段音量 + 让位 + 配乐层）
  {
    const vPath = path.join(root, 'src', 'films', filmId, 'audio', 'voice.json');
    if (fs.existsSync(vPath)) {
      const { meanVolumeDb } = await import('../py/voice-film.js');
      const v = JSON.parse(fs.readFileSync(vPath, 'utf-8')) as { duckDb?: number; lines: { id: string; file?: string; sec: number; durSec?: number }[] };
      const mix = truth.mix;
      const rows = v.lines.filter((l) => l.file && l.durSec).map((l) => {
        const cue = (truth.music.cues || []).find((c) => c.track?.file && l.sec >= c.in.sec && l.sec < c.out.sec);
        const voiceDb = meanVolumeDb(path.join(root, 'public', l.file!)) + (mix.layers.VO ?? 0) + (truth.gains[`vo:${l.id}`] ?? 0);
        const musicDb = cue
          ? meanVolumeDb(path.join(root, 'public', cue.track!.file), l.sec - cue.in.sec + (cue.startFromSec ?? 0), l.durSec) + 20 * Math.log10(Math.max(1e-6, cue.volume)) + (v.duckDb ?? -10) + (mix.layers.MUSIC ?? 0)
          : -Infinity;
        return { id: l.id, voiceDb, musicDb };
      });
      items.push(...voiceBalanceReview(rows));
    }
  }

  // 7. 设计评审 + 成片缩略图
  items.push(...reviewDesign(dText));

  // 5. 画面最长静止段（最近一次成片）
  const final = path.join(root, 'out', filmId, 'final-60.mp4');
  if (fs.existsSync(final)) {
    const { checkMotion } = await import('./motion-guard.js');
    const m = checkMotion(final);
    const acts = [...m.actions].sort((a, b) => a.fromSec - b.fromSec);
    const pts = [{ fromSec: 0, toSec: 0 }, ...acts, { fromSec: m.durationSec, toSec: m.durationSec }];
    let gap = 0;
    let at = 0;
    for (let i = 1; i < pts.length; i++) {
      const g = pts[i].fromSec - pts[i - 1].toSec;
      if (g > gap) { gap = g; at = pts[i - 1].toSec; }
    }
    const { contactSheet } = await import('../look/stills.js');
    const sheet = contactSheet(final, path.join(root, 'out', filmId, 'sheet.png'), { n: 12, cols: 4 });
    items.push({ level: 'hint', topic: '设计评审', text: `成片缩略图 ${path.relative(root, sheet.file)} —— 看过再写（或更新）决策单「设计评审」` });
    // 沿用库里风格：成片缩略图和样片海报拼在一起（左样片海报、右成片），对照「别又拍成样片」
    const styleId = libraryStyleOf(fs.existsSync(path.join(dir, 'theme.ts')) ? fs.readFileSync(path.join(dir, 'theme.ts'), 'utf-8') : null);
    const poster = styleId ? path.join(root, 'src/styles', styleId, 'refs/poster.jpg') : '';
    if (styleId && fs.existsSync(poster)) {
      const vs = path.join(root, 'out', filmId, 'vs-demo.png');
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', poster, '-i', sheet.file, '-filter_complex', '[0]scale=-2:900[a];[1]scale=-2:900[b];[a][b]hstack=inputs=2', '-frames:v', '1', vs]);
      items.push({ level: 'hint', topic: '和样片对照', text: `${path.relative(root, vs)}：左 ${styleId} 的样片海报、右成片 —— 对照决策单「和样片对照」六项` });
    }
    // 和我们自己的往期片对照：左边最近几部片的海报、右边这部片 —— 防止每部片都长成「房子风格」
    // 有海报用海报；早期没出海报的片子，从它的成片里取一帧代表画面（放在本片的 out 目录里，不动别的片子）
    const filmsDir = path.join(root, 'src', 'films');
    const repOf = (id: string) => [path.join(root, 'out', id, 'poster.jpg'), path.join(root, 'out', id, 'final-60.mp4')].find((f) => fs.existsSync(f));
    const past = recentFilms(
      fs.readdirSync(filmsDir)
        .filter((id) => repOf(id))
        .map((id) => ({ id, mtimeMs: fs.statSync(repOf(id)!).mtimeMs })),
      filmId
    );
    if (past.length) {
      const vsPast = path.join(root, 'out', filmId, 'vs-past.png');
      const thumbs = past.map((id) => {
        const src = repOf(id)!;
        if (src.endsWith('.jpg')) return src;
        const t = path.join(root, 'out', filmId, 'past', `${id}.jpg`);
        fs.mkdirSync(path.dirname(t), { recursive: true });
        if (!fs.existsSync(t) || fs.statSync(t).mtimeMs < fs.statSync(src).mtimeMs) {
          execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', '8', '-i', src, '-vf', 'thumbnail=120', '-frames:v', '1', t]);
        }
        return t;
      });
      const inputs = thumbs.flatMap((f) => ['-i', f]);
      const k = past.length;
      const left = past.map((_, i) => `[${i}]scale=-2:${Math.floor(900 / k)}[p${i}]`).join(';');
      const stack = k > 1 ? `${past.map((_, i) => `[p${i}]`).join('')}vstack=inputs=${k}[l]` : '[p0]copy[l]';
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...inputs, '-i', sheet.file, '-filter_complex', `${left};${stack};[${k}]scale=-2:900[r];[l]scale=-2:900[l2];[l2][r]hstack=inputs=2`, '-frames:v', '1', vsPast]);
      items.push({ level: 'hint', topic: '和往期片对照', text: `${path.relative(root, vsPast)}：左边是最近的 ${past.join('、')}，右边是这部片 —— 是不是又长成了同一个样子？写进决策单「设计评审 · 原创性」` });
    }
    items.push(
      gap > 4
        ? { level: 'hint', topic: '画面', text: `最长静止 ${gap.toFixed(1)}s（${at.toFixed(1)}s 起）—— 是有意停住读字吗？可以加缓推 / 光点流动` }
        : { level: 'ok', topic: '画面', text: `最长静止 ${gap.toFixed(1)}s；静止 ${(m.bands.still * 100).toFixed(0)}% / 细微 ${(m.bands.subtle * 100).toFixed(0)}%` }
    );
    // 结构：能量曲线（画面运动 + 音轨响度，每秒一格）、高潮前有没有回落、镜头时长；高潮从乐谱秒换到放映秒
    const audio = path.join(root, 'out', filmId, 'audio.wav');
    const loud = fs.existsSync(audio) ? perSecond(audioRmsLevels(audio, 0.1), 10) : [];
    const motion = m.series ? perSecond(m.series.diffs, m.series.hz) : [];
    const warp = buildTimeWarp(truth.sync);
    items.push(...energyReview(energyCurve(motion, loud), climaxesOf(truth.music).map((c) => warp.toFilm(c))));
    items.push(...shotReview(m.cuts, m.durationSec));
    // 冷看（vw critic + 不带上下文的子代理）：复述的一句话对不对得上信息表的结论
    const { criticReview, readCritic } = await import('./critic.js');
    const { parseBriefTable } = await import('./brief.js');
    const concl = parseBriefTable(dText ?? '').find((r) => r.level === '结论')?.point;
    const ci = criticReview(readCritic(root, filmId), concl, fs.statSync(final).mtimeMs, filmId);
    items.push(...ci);
    criticState = ci.some((i) => /还没冷看/.test(i.text)) ? 'none' : ci.some((i) => /比成片旧/.test(i.text)) ? 'stale' : ci.some((i) => i.level === 'warn') ? 'warn' : 'ok';
  } else {
    items.push({ level: 'hint', topic: '画面', text: '还没有成片，画面相关的提示要出片后再看' });
  }
  // 验收状态：把上面的证据归成六个维度（没看没听没冷看的不标通过）
  {
    const early0 = items.slice(0, early);
    const trace = early0.filter((i) => i.topic === '事实溯源');
    items.push(...acceptanceReview({
      briefOk: !early0.some((i) => i.level === 'warn'),
      facts: !trace.length ? 'none' : trace.some((i) => i.level === 'warn') ? 'warn' : 'ok',
      readcheck: fs.existsSync(path.join(root, 'out', filmId, 'readcheck.json')),
      designScored: !reviewDesign(dText).some((i) => /没打分|没有「设计评审」/.test(i.text)),
      rendered: fs.existsSync(final),
      audioWav: fs.existsSync(path.join(root, 'out', filmId, 'audio.wav')),
      soundWarn: [...soundItems, ...audioAudit].some((i) => i.level === 'warn'),
      listened: /听审|试听/.test((dText ?? '').split('## 自检记录')[1] ?? ''),
      critic: criticState,
    }));
  }
  return items;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
