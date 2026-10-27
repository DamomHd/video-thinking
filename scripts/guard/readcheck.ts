/**
 * 读字检查：屏幕上的每段字，完整可读的时间够不够观众读完（借鉴 lemo-opuscar core/render/readcheck.mjs）
 *
 *   vw readcheck <片> [--step=0.2]
 *
 * 需要的时间 = 中日韩字数 ÷ 4.5 + 其它非空白字符 ÷ 15 + 1.5 秒（不少于 1.5 秒）。
 * 做法：按 step 抽帧（renderFrames，不截图，只跑页面），由 FilmShell 挂的 ReadProbe 每帧报告「哪些文字块完整可读」，
 * 这里把同一段字的连续可读区间连起来，和需要的时间比。数字会跳的字（计数）把数字当成同一段字。
 * 结果写 out/<片>/readcheck.json，vw review 读它给提示（只提示，不拦出片）。
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ReadSample } from '../../src/components/ReadProbe';

export const READCHECK_TAG = '[readcheck]';
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;

export function readNeedSec(text: string, min = 1.5): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    if (CJK.test(ch)) cjk++;
    else other++;
  }
  return Math.max(min, cjk / 4.5 + other / 15 + 1.5);
}

export interface FrameSample {
  sec: number;
  texts: ReadSample[];
}

export interface ReadRun {
  text: string;
  from: number;
  to: number;
  held: number;
  need: number;
  /** 最后一帧的包围盒（判断「同一位置被别的字接替」用） */
  box?: number[];
}

/** 计数类文字：数字统一成 #，同一段字跨帧能认出来 */
export const readKey = (text: string) => text.replace(/[0-9０-９]/g, '#');

const iou = (a: number[], b: number[]) => {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const i = w * h;
  const u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i;
  return u > 0 ? i / u : 0;
};

/**
 * 每段字的连续可读区间（相隔不超过一个 step 的空隙算连着；区间时长 = 最后一帧 − 第一帧 + step）。
 * 同一段字：文字相同（数字当成同一个），或者文字变了但位置基本没动（包围盒重合 ≥ 60%：翻牌、计数、逐字打出）——
 * 后者区间的文字取最后一帧的（最终要读的是落定的字）。
 */
export function readRuns(frames: FrameSample[], stepSec: number): ReadRun[] {
  const sorted = [...frames].sort((a, b) => a.sec - b.sec);
  type Open = { text: string; from: number; last: number; box: number[] };
  const open: Open[] = [];
  const runs: ReadRun[] = [];
  const gap = stepSec * 2 + 1e-6;
  const close = (r: Open) => {
    runs.push({ text: r.text, from: round(r.from), to: round(r.last + stepSec), held: round(r.last - r.from + stepSec), need: round(readNeedSec(r.text)), box: r.box });
    open.splice(open.indexOf(r), 1);
  };
  for (const f of sorted) {
    const used = new Set<Open>();
    for (const t of f.texts) {
      if (!t.readable || t.sub) continue; // 字幕的时长按口播定（vw voice film），不在这里查
      const alive = open.filter((r) => !used.has(r) && f.sec - r.last <= gap);
      const r = alive.find((o) => readKey(o.text) === readKey(t.text)) ?? alive.find((o) => iou(o.box, t.box) >= 0.6);
      if (r) {
        r.last = f.sec;
        r.text = t.text;
        r.box = t.box;
        used.add(r);
      } else {
        const n: Open = { text: t.text, from: f.sec, last: f.sec, box: t.box };
        open.push(n);
        used.add(n);
      }
    }
    for (const r of [...open]) if (f.sec - r.last > gap) close(r);
  }
  for (const r of [...open]) close(r);
  return runs.sort((a, b) => a.from - b.from);
}

/**
 * 不够时间的区间：差距超过一个 step 才报（抽样的误差）。不报的两种：
 *   · 同一段字在片中出现多次，只要有一次够长就算读到了
 *   · 过渡态：结束后两个 step 内，同一位置（包围盒重合 ≥ 30%）就换成了别的字（翻牌、换字的中间状态，本来就不是给人读的）
 */
export function readViolations(runs: ReadRun[], stepSec: number): ReadRun[] {
  const best = new Map<string, number>();
  for (const r of runs) best.set(readKey(r.text), Math.max(best.get(readKey(r.text)) ?? 0, r.held));
  const replaced = (r: ReadRun) =>
    !!r.box && runs.some((o) => o !== r && o.box && o.from >= r.to - stepSec - 1e-6 && o.from <= r.to + stepSec * 2 + 1e-6 && iou(o.box, r.box!) >= 0.3);
  return runs.filter((r) => r.held + stepSec < r.need && (best.get(readKey(r.text)) ?? 0) + stepSec < r.need && !replaced(r));
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** 字幕压住别的字：字幕框和画面上某段（非字幕、看得见的）字的重叠超过那段字面积的 10%，连续的帧合成一段 */
export function subtitleCovers(frames: FrameSample[], stepSec: number): { from: number; to: number; text: string }[] {
  const hits: { sec: number; text: string }[] = [];
  for (const f of frames) {
    const subs = f.texts.filter((t) => t.sub);
    if (!subs.length) continue;
    for (const t of f.texts) {
      if (t.sub) continue;
      const area = Math.max(1, (t.box[2] - t.box[0]) * (t.box[3] - t.box[1]));
      for (const s of subs) {
        const w = Math.max(0, Math.min(t.box[2], s.box[2]) - Math.max(t.box[0], s.box[0]));
        const h = Math.max(0, Math.min(t.box[3], s.box[3]) - Math.max(t.box[1], s.box[1]));
        if ((w * h) / area > 0.1) hits.push({ sec: f.sec, text: t.text });
      }
    }
  }
  hits.sort((a, b) => a.sec - b.sec);
  const out: { from: number; to: number; text: string }[] = [];
  for (const h of hits) {
    const last = out.find((o) => o.text === h.text && h.sec - o.to <= stepSec * 2 + 1e-6);
    if (last) last.to = round(h.sec + stepSec);
    else out.push({ from: round(h.sec), to: round(h.sec + stepSec), text: h.text });
  }
  return out;
}

export async function runReadcheck(filmId: string, options: { step?: number; entry?: string } = {}): Promise<{ file: string; runs: ReadRun[]; violations: ReadRun[]; covers: { from: number; to: number; text: string }[] }> {
  const step = options.step ?? 0.2;
  const { bundle } = await import('@remotion/bundler');
  const { selectComposition, renderFrames } = await import('@remotion/renderer');
  const serveUrl = await bundle({ entryPoint: path.resolve(options.entry ?? 'src/Root.tsx') });
  const chromiumOptions = { gl: 'angle' as const };
  const inputProps = { readcheck: true };
  const comp = await selectComposition({ serveUrl, id: filmId, inputProps, chromiumOptions });
  const every = Math.max(1, Math.round(step * comp.fps));
  const frames: number[] = [];
  for (let f = 0; f < comp.durationInFrames; f += every) frames.push(f);
  const samples: FrameSample[] = [];
  await renderFrames({
    composition: comp,
    serveUrl,
    inputProps,
    chromiumOptions,
    frames,
    imageFormat: 'none',
    outputDir: null,
    concurrency: 1,
    logLevel: 'error',
    onStart: () => undefined,
    onFrameUpdate: () => undefined,
    onBrowserLog: (log) => {
      const i = log.text.indexOf(READCHECK_TAG);
      if (i < 0) return;
      const d = JSON.parse(log.text.slice(i + READCHECK_TAG.length)) as { f: number; t: ReadSample[] };
      samples.push({ sec: d.f / comp.fps, texts: d.t });
    },
  });
  const stepSec = every / comp.fps;
  const runs = readRuns(samples, stepSec);
  const violations = readViolations(runs, stepSec);
  const covers = subtitleCovers(samples, stepSec);
  const file = path.join(process.cwd(), 'out', filmId, 'readcheck.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ film: filmId, stepSec, frames: samples.length, runs, violations, covers }, null, 1));
  return { file, runs, violations, covers };
}
