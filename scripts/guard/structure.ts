/**
 * 结构检查：钩子、高潮落点、能量曲线、镜头时长（vw brief / vw review / vw critic 共用）。
 *
 *   · 钩子：前 3 秒有没有信息点（计划）、开场是不是全片最平的一段（成片）
 *   · 高潮落点：配乐高潮（music.json 的 cue.climax / climax2）那一刻有没有信息点落下
 *   · 能量曲线：每秒的画面运动量 + 音轨响度，看全片有没有起伏、高潮前有没有「压」
 *   · 镜头时长：硬切数、平均 / 最长镜头（只给数，不判好坏——汇报片和预告片的标准不同）
 * 只给提示，不拦出片。纯函数在前，读文件的在最后。
 */
import { spawnSync } from 'node:child_process';
import type { ReviewItem } from './review.js';
import type { BriefRow } from './brief.js';

export const HOOK_SEC = 3;
/** 高潮前多长一段里要有一次回落（秒） */
export const PRE_CLIMAX_SEC = 4;

const T = '结构';

/**
 * 计划层（纯函数）：前 3 秒有没有信息点、配乐高潮那一刻有没有信息点落下。
 * 开场的口播（问题、反差）常常就是钩子但不算信息点，列出来给模型自己判断。
 */
export function planStructureReview(rows: BriefRow[], climaxes: number[], vo: { id: string; text: string; sec: number }[] = [], tolSec = 1): ReviewItem[] {
  if (!rows.length) return [];
  const out: ReviewItem[] = [];
  const first = Math.min(...rows.map((r) => r.from));
  const openVo = vo.filter((l) => l.sec <= HOOK_SEC);
  out.push(first <= HOOK_SEC
    ? { level: 'ok', topic: T, text: `钩子：第一个信息点 ${first}s 出现（前 ${HOOK_SEC} 秒内）` }
    : { level: 'hint', topic: T, text: `钩子：第一个信息点 ${first}s 才出现——前 ${HOOK_SEC} 秒拿什么留住人？一个问题、一个反差、或者结论本身${openVo.length ? `（开场口播 ${openVo.map((l) => `${l.id}「${l.text}」`).join('')}：如果它就是钩子，写进自检记录）` : ''}` });
  for (const c of climaxes) {
    const hit = rows.filter((r) => Math.abs(r.from - c) <= tolSec);
    const near = [...rows].sort((a, b) => Math.abs(a.from - c) - Math.abs(b.from - c))[0];
    out.push(hit.length
      ? { level: 'ok', topic: T, text: `配乐高潮 ${c.toFixed(1)}s 落下的是：${hit.map((r) => `${r.level}「${r.point}」`).join('、')}` }
      : { level: 'hint', topic: T, text: `配乐高潮 ${c.toFixed(1)}s 前后 ${tolSec}s 没有信息点落下（最近的是${near.level}「${near.point}」${near.from}s，差 ${(near.from - c).toFixed(1)}s）——最大的揭示要放在音乐最强的点，否则高潮是空响` });
  }
  return out;
}

/** 按秒取平均（纯函数）：hz 个取样一秒 */
export function perSecond(values: number[], hz: number): number[] {
  const n = Math.floor(values.length / hz);
  const out: number[] = [];
  for (let s = 0; s < n; s++) {
    const seg = values.slice(Math.round(s * hz), Math.round((s + 1) * hz));
    out.push(seg.length ? seg.reduce((a, b) => a + b, 0) / seg.length : 0);
  }
  return out;
}

const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};

/** 把一列数按全片的 5% / 95% 分位拉到 0..1（纯函数） */
export function normalize(xs: number[]): number[] {
  const lo = quantile(xs, 0.05);
  const hi = quantile(xs, 0.95);
  return xs.map((x) => (hi > lo ? Math.min(1, Math.max(0, (x - lo) / (hi - lo))) : 0));
}

/**
 * 每秒能量（纯函数）：画面运动量（帧差均值）和音轨响度（dB）各自拉到 0..1 再平均。
 * 两列长短不一时按短的截；只有一列时就用那一列。
 */
export function energyCurve(motionPerSec: number[], loudDbPerSec: number[]): number[] {
  const m = normalize(motionPerSec);
  const a = normalize(loudDbPerSec);
  if (!a.length) return m;
  if (!m.length) return a;
  const n = Math.min(m.length, a.length);
  return Array.from({ length: n }, (_, i) => (m[i] + a[i]) / 2);
}

/** 一行字符画（纯函数）：每个值一格，▁ 到 █ */
export function sparkline(xs: number[]): string {
  const bars = '▁▂▃▄▅▆▇█';
  return xs.map((x) => bars[Math.min(7, Math.max(0, Math.round(x * 7)))]).join('');
}

/** 能量曲线的提示（纯函数）：全片起伏、开场、每个高潮前有没有回落、高潮是不是峰 */
export function energyReview(curve: number[], climaxes: number[]): ReviewItem[] {
  if (curve.length < 6) return [];
  const out: ReviewItem[] = [];
  const spread = quantile(curve, 0.9) - quantile(curve, 0.1);
  const med = quantile(curve, 0.5);
  out.push({ level: 'ok', topic: T, text: `能量曲线（每格 1 秒）：${sparkline(curve)}` });
  if (spread < 0.35) out.push({ level: 'hint', topic: T, text: `全片能量起伏小（10%–90% 分位只差 ${spread.toFixed(2)}）——快与慢、密与疏、响与静的对比在哪？` });
  const open = Math.max(...curve.slice(0, HOOK_SEC));
  if (open < med) out.push({ level: 'hint', topic: T, text: `开场 ${HOOK_SEC} 秒的能量（最高 ${open.toFixed(2)}）低于全片中位（${med.toFixed(2)}）——是有意的安静开场吗？安静也要有一个钩子` });
  for (const c of climaxes) {
    const at = Math.round(c);
    if (at < 1 || at >= curve.length) continue;
    const before = curve.slice(Math.max(0, at - PRE_CLIMAX_SEC), at);
    const peak = Math.max(...curve.slice(at, Math.min(curve.length, at + 2)));
    const dip = Math.min(...before);
    if (peak < quantile(curve, 0.75)) out.push({ level: 'hint', topic: T, text: `配乐高潮 ${c.toFixed(1)}s 不在能量的高处（${peak.toFixed(2)}，全片 75% 分位 ${quantile(curve, 0.75).toFixed(2)}）——画面和声音没有一起爆` });
    else if (peak - dip < 0.3) out.push({ level: 'hint', topic: T, text: `配乐高潮 ${c.toFixed(1)}s 之前 ${PRE_CLIMAX_SEC} 秒没有回落（最低 ${dip.toFixed(2)} → 高潮 ${peak.toFixed(2)}）——重击之前先抽空半拍，重击才重` });
    else out.push({ level: 'ok', topic: T, text: `配乐高潮 ${c.toFixed(1)}s：先回落到 ${dip.toFixed(2)}、再到 ${peak.toFixed(2)}` });
  }
  return out;
}

/** 镜头时长（纯函数）：只给数。硬切之间算一个镜头；相邻 0.2s 内的切点算同一刀 */
export function shotStats(cuts: number[], durationSec: number): { count: number; meanSec: number; longestSec: number; longestAt: number } {
  const merged: number[] = [];
  for (const c of [...cuts].sort((a, b) => a - b)) if (!merged.length || c - merged[merged.length - 1] > 0.2) merged.push(c);
  const edges = [0, ...merged.filter((c) => c > 0 && c < durationSec), durationSec];
  let longestSec = 0;
  let longestAt = 0;
  for (let i = 1; i < edges.length; i++) if (edges[i] - edges[i - 1] > longestSec) { longestSec = edges[i] - edges[i - 1]; longestAt = edges[i - 1]; }
  const count = edges.length - 1;
  return { count, meanSec: durationSec / Math.max(1, count), longestSec, longestAt };
}

export function shotReview(cuts: number[], durationSec: number): ReviewItem[] {
  const s = shotStats(cuts, durationSec);
  return [{ level: 'ok', topic: T, text: `镜头：${s.count} 个（硬切 ${s.count - 1} 处），平均 ${s.meanSec.toFixed(1)}s，最长 ${s.longestSec.toFixed(1)}s（${s.longestAt.toFixed(1)}s 起）——标准看片型：汇报要读得完，预告要切得碎` }];
}

/** 成片音轨每 stepSec 一个 RMS（dB），ffmpeg astats；读不到返回空 */
export function audioRmsLevels(audio: string, stepSec = 0.1): number[] {
  const n = Math.round(48000 * stepSec);
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-i', audio, '-af', `aresample=48000,asetnsamples=${n},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level`, '-f', 'null', '-'], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  return [...String(r.stderr).matchAll(/RMS_level=(-?[\d.]+|-inf)/g)].map((m) => (m[1] === '-inf' ? -120 : Number(m[1])));
}

/** 配乐的高潮时刻（乐谱秒）：music.json 每段的 climax / climax2 */
export function climaxesOf(music: { cues?: { climax?: { sec: number }; climax2?: { sec: number } }[] } | null | undefined): number[] {
  return (music?.cues ?? []).flatMap((c) => [c.climax?.sec, c.climax2?.sec]).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
}
