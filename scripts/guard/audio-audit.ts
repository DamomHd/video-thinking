/**
 * 音效反查（vw audio audit <片>）：计划里的每个音效落点，在渲好的成片音轨里是不是真的响了、响在哪。
 *
 * 借鉴 chaojifeng-video-design 的 audio_event_audit：声音计划不能只信 JSON，要拿渲出来的音轨反查。
 * 做法：对每个「点」类音效（跳过 TEX 底色 / BG / 配乐 / 口播 / 循环 / 长于 3 秒的），按
 *   预期落点 = toFilm(fromSec + offsets[key]) + max(0, 素材可听起点 − startFromSec)
 * 在成片音轨的 20ms RMS 曲线上量两件事：
 *   · 抬升：落点附近的最大电平 − 落点前一小段的中位电平。小于 3 dB 说明没响出来 / 被配乐盖住
 *   · 起音偏移：电平首次比之前高 3 dB 的时刻 − 预期落点。超过 ±3 帧说明声画不同步
 * 连发（间隔 < 0.25s，如打字咔哒）只测每组第一个。
 * 量的是整条混音（配乐在响时只能测相对抬升），所以结论是提示：「没响」不等于「音效没挂」，要听。
 * 只给提示（vw review 汇总），不拦出片。纯函数在前，读文件的入口在最后。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewItem } from './review.js';
import { audioRmsLevels } from './structure.js';

export const STEP = 0.02;
const MIN_RISE_DB = 3;
const MAX_SHIFT_SEC = 0.1;

export interface Hit {
  key: string;
  layer: string;
  /** 预期落点（放映秒） */
  sec: number;
}

export interface HitResult extends Hit {
  riseDb: number;
  /** 起音偏移（秒）；正 = 比预期晚。没抬升时为 undefined */
  shiftSec?: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : -120;
};

/** 连发（相邻落点间隔 < 0.25s）合成一组，只留每组第一个：后一声的「之前电平」被前一声抬高，单独量会误判成没响（纯函数） */
export function firstOfBursts(hits: Hit[], gapSec = 0.25): Hit[] {
  const sorted = [...hits].sort((a, b) => a.sec - b.sec);
  return sorted.filter((h, i) => i === 0 || h.sec - sorted[i - 1].sec >= gapSec);
}

/** 在 RMS 曲线上量一个落点（纯函数） */
export function measureHit(levels: number[], hit: Hit, step = STEP): HitResult {
  const i = (t: number) => Math.max(0, Math.min(levels.length - 1, Math.round(t / step)));
  const before = median(levels.slice(i(hit.sec - 0.4), i(hit.sec - 0.06) + 1));
  const from = i(hit.sec - 0.1);
  const to = i(hit.sec + 0.25);
  let max = -120;
  for (let k = from; k <= to; k++) max = Math.max(max, levels[k]);
  const riseDb = max - before;
  if (riseDb < MIN_RISE_DB) return { ...hit, riseDb };
  let on = from;
  while (on < to && levels[on] < before + MIN_RISE_DB) on++;
  return { ...hit, riseDb, shiftSec: on * step - hit.sec };
}

/** 只查「点」类音效：底色 / 氛围 / 配乐 / 口播 / 循环 / 长于 3 秒的不查（纯函数） */
export function isPointSfx(it: { layer: string; durSec: number; loop?: boolean }): boolean {
  return !['TEX', 'BG', 'MUSIC', 'VO'].includes(it.layer) && !it.loop && it.durSec <= 3;
}

/** 反查结论（纯函数） */
export function auditReview(results: HitResult[], totalSec: number): ReviewItem[] {
  const T = '音效反查';
  const rs = results.filter((r) => r.sec > 0.3 && r.sec < totalSec - 0.3);
  if (!rs.length) return [{ level: 'hint', topic: T, text: '没有可反查的点类音效' }];
  const weak = rs.filter((r) => r.riseDb < MIN_RISE_DB);
  const late = rs.filter((r) => r.shiftSec !== undefined && Math.abs(r.shiftSec) > MAX_SHIFT_SEC);
  const heard = rs.length - weak.length;
  const shifts = rs.flatMap((r) => (r.shiftSec === undefined ? [] : [r.shiftSec])).sort((a, b) => a - b);
  const med = shifts.length ? shifts[Math.floor(shifts.length / 2)] : 0;
  const out: ReviewItem[] = [];
  const list = (xs: HitResult[], f: (r: HitResult) => string) => xs.slice(0, 6).map(f).join('、') + (xs.length > 6 ? `…共 ${xs.length} 个` : '');
  if (weak.length) out.push({ level: weak.length / rs.length > 0.3 ? 'warn' : 'hint', topic: T, text: `${weak.length}/${rs.length} 个落点在成片里抬升不到 ${MIN_RISE_DB} dB（没响出来，或被配乐盖住）：${list(weak, (r) => `${r.sec.toFixed(2)}s ${r.key}`)}——听一下，被盖住就让位或抬音量` });
  if (late.length) out.push({ level: 'warn', topic: T, text: `${late.length} 个音效起音和计划落点差超过 ${MAX_SHIFT_SEC * 1000}ms：${list(late, (r) => `${r.sec.toFixed(2)}s ${r.key}（${r.shiftSec! > 0 ? '晚' : '早'} ${Math.round(Math.abs(r.shiftSec!) * 1000)}ms）`)}` });
  if (!weak.length && !late.length) out.push({ level: 'ok', topic: T, text: `${rs.length} 个点类音效都在成片里响了，起音偏移中位 ${Math.round(med * 1000)}ms` });
  else out.push({ level: 'hint', topic: T, text: `${heard}/${rs.length} 个响出来了，起音偏移中位 ${Math.round(med * 1000)}ms` });
  return out;
}

/** vw audio audit 的入口：读真值 + 成片音轨（out/<片>/audio.wav） */
export async function runAudioAudit(filmId: string, root = process.cwd()): Promise<ReviewItem[]> {
  const T = '音效反查';
  const audio = path.join(root, 'out', filmId, 'audio.wav');
  if (!fs.existsSync(audio)) return [{ level: 'hint', topic: T, text: `还没有成片音轨 out/${filmId}/audio.wav，出片后再反查` }];
  const { getFilm } = await import('../../src/films.js');
  const { TruthManager } = await import('../spot/truth.js');
  const { EnvelopeProbe } = await import('../audio/envelope.js');
  const { buildTimeWarp } = await import('../../src/shared/timewarp.js');
  const truth = new TruthManager(filmId).readAll();
  const total = (await getFilm(filmId).getAdapter()).timeline.totalSeconds;
  const warp = buildTimeWarp(truth.sync);
  const probe = new EnvelopeProbe(filmId);
  const hits: Hit[] = [];
  for (const it of truth.plan.filter(isPointSfx)) {
    const env = probe.measure(it.file);
    if (env.source === 'missing') continue;
    const start = warp.toFilm(it.fromSec + (truth.offsets[it.key] ?? 0));
    hits.push({ key: it.key, layer: it.layer, sec: start + Math.max(0, env.onsetSec - it.startFromSec) });
  }
  probe.flush();
  const levels = audioRmsLevels(audio, STEP);
  return auditReview(firstOfBursts(hits).map((h) => measureHit(levels, h)), total);
}
