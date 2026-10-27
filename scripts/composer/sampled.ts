/**
 * 采样配乐：同一份结构化乐谱（structure.ts 写的 ABC），用真实乐器录音演奏（lemo-opuscar 的采样器，vendor/lemo-opuscar）
 *
 * 谱子（段落、和声、律动、起势、高潮小节）不变，只换音色：每个声部按「配器方案」映射到采样乐器，
 * 长短音分开配（分解和弦的八分音符给顿弓 / 马林巴，和弦长音给钢琴 / 竖琴），力度按离高潮的远近走（越近越强）。
 * 高潮那一刻加大鼓 + 吊镲，起势那一小节加吊镲渐强 —— 这是合成音色做不出来的「大片」部分。
 *
 * 渲染在 Python（scripts/py/render_score.py → 上游 sampler.render + room 混响），结果是 48 kHz 立体声 WAV；
 * 同一份谱每次渲出来一样（取样轮换的随机数固定）。署名行由上游 credits() 给出，写进 music.json 的 track.license。
 */
import path from 'node:path';
import { parseAbc, applyStops } from './abc.js';
import { runPy } from '../py/opuscar.js';

export type Orchestra = 'cinematic' | 'mallets' | 'chamber';
export const ORCHESTRAS: Orchestra[] = ['cinematic', 'mallets', 'chamber'];

export interface SampledEvent {
  t: number;
  inst: string;
  pitch: number | string | null;
  dur: number | null;
  vel: number;
  pan: number;
  gain?: number;
  attack?: number;
  release?: number;
}

/** 一条配器：乐器、移调（半音）、增益、声像、起音（弦乐铺底要慢起） */
interface Part {
  inst: string;
  shift?: number;
  gain?: number;
  pan?: number;
  attack?: number;
  /** 打击乐变体（无音高时作为 pitch 传） */
  hit?: string | null;
}

/** 声部角色 → 短音（< 1 拍）/ 长音的配器 */
type Plan = Record<'melody' | 'bass' | 'pad', { short: Part[]; long: Part[] }> & {
  kick: Part[];
  snare: Part[];
  hat: Part[];
  crash: Part[];
  /** 高潮那一刻额外加的 */
  drop: Part[];
  /** 起势小节（高潮前一小节）额外加的：从小节头开始、到高潮结束 */
  rise: Part[];
  room: { size: number; mix: number };
};

export const PLANS: Record<Orchestra, Plan> = {
  // 电影感：弦乐组顿弓推进 + 低音提琴 + 定音鼓式的大鼓，铺底是大提琴 / 小提琴长音
  cinematic: {
    melody: { short: [{ inst: 'violins_spic', gain: 0.75, pan: -0.3 }, { inst: 'upright', gain: 0.3, pan: 0.2 }], long: [{ inst: 'upright', gain: 0.7, pan: 0.15 }] },
    bass: { short: [{ inst: 'cellos_spic', shift: 12, gain: 0.6, pan: 0.25 }, { inst: 'contrabass_pizz', gain: 0.55, pan: 0.1 }], long: [{ inst: 'contrabass', gain: 0.7, pan: 0.1, attack: 0.15 }] },
    pad: { short: [], long: [{ inst: 'cellos', gain: 0.4, pan: 0.3, attack: 0.35 }, { inst: 'violins', shift: 12, gain: 0.28, pan: -0.35, attack: 0.45 }] },
    kick: [{ inst: 'bass_drum', hit: null, gain: 0.95 }],
    snare: [{ inst: 'snare', hit: 'on', gain: 0.6, pan: -0.1 }],
    hat: [{ inst: 'hihat', hit: 'closed', gain: 0.3, pan: 0.35 }],
    crash: [{ inst: 'crash', hit: null, gain: 0.7, pan: 0.2 }],
    drop: [{ inst: 'gran_cassa', hit: 'hit', gain: 1.0 }, { inst: 'timpani', shift: 0, gain: 0.8 }, { inst: 'crash', hit: null, gain: 0.6, pan: -0.25 }],
    rise: [{ inst: 'sus_cymbal', hit: 'cresc', gain: 0.4, pan: -0.2 }],
    room: { size: 0.55, mix: 0.2 },
  },
  // 木琴类：轻、亮、科技感（发布会、产品）
  mallets: {
    melody: { short: [{ inst: 'marimba', gain: 0.7, pan: -0.25 }], long: [{ inst: 'vibraphone', gain: 0.6, pan: 0.2 }] },
    bass: { short: [{ inst: 'contrabass_pizz', gain: 0.5 }], long: [{ inst: 'contrabass_pizz', gain: 0.5 }] },
    pad: { short: [], long: [{ inst: 'vibraphone_bowed', shift: 12, gain: 0.35, pan: 0.3 }] },
    kick: [{ inst: 'bass_drum', hit: null, gain: 0.45 }],
    snare: [{ inst: 'claps', hit: null, gain: 0.45 }],
    hat: [{ inst: 'shaker', hit: null, gain: 0.3, pan: 0.3 }],
    crash: [{ inst: 'sus_cymbal', hit: 'hit', gain: 0.5 }],
    drop: [{ inst: 'glockenspiel', shift: 24, gain: 0.5 }],
    rise: [{ inst: 'sus_cymbal', hit: 'cresc', gain: 0.45 }],
    room: { size: 0.4, mix: 0.16 },
  },
  // 室内乐：温暖、安静（叙事、人物）
  chamber: {
    melody: { short: [{ inst: 'harp', gain: 0.65, pan: -0.25 }], long: [{ inst: 'upright', gain: 0.65, pan: 0.15 }] },
    bass: { short: [{ inst: 'cellos_pizz', gain: 0.6 }], long: [{ inst: 'cellos', gain: 0.55, attack: 0.2 }] },
    pad: { short: [], long: [{ inst: 'violas', shift: 12, gain: 0.3, pan: 0.3, attack: 0.5 }, { inst: 'violins', shift: 12, gain: 0.22, pan: -0.3, attack: 0.6 }] },
    kick: [{ inst: 'gran_cassa', hit: 'hit', gain: 0.45 }],
    snare: [],
    hat: [{ inst: 'triangle', hit: null, gain: 0.18, pan: 0.3 }],
    crash: [{ inst: 'sus_cymbal', hit: 'hit', gain: 0.4 }],
    drop: [{ inst: 'timpani', shift: 0, gain: 0.7 }],
    rise: [{ inst: 'sus_cymbal', hit: 'cresc', gain: 0.4 }],
    room: { size: 0.6, mix: 0.22 },
  },
};

/** 力度：离高潮越近越强，高潮段最强，收尾回落；没有高潮就平 */
export function velocityAt(t: number, dropSec: number | null, totalSec: number): number {
  if (dropSec === null) return 0.7;
  if (t < dropSec) return 0.5 + 0.35 * Math.min(1, Math.max(0, t / dropSec)) ** 1.5;
  const after = (t - dropSec) / Math.max(0.1, totalSec - dropSec);
  return after < 0.75 ? 0.95 : 0.95 - 0.4 * ((after - 0.75) / 0.25);
}

const ROLE_OF: Record<string, keyof Pick<Plan, 'melody' | 'bass' | 'pad'>> = { melody: 'melody', accomp: 'melody', bass: 'bass', pad: 'pad' };

/** ABC → 采样事件（纯函数：同一份谱、同一个配器方案，结果一样） */
export function sampledEvents(abcText: string, orchestra: Orchestra = 'cinematic', totalSec?: number): { events: SampledEvent[]; dur: number; dropSec: number | null; riseSec: number | null } {
  const plan = PLANS[orchestra];
  const score = parseAbc(abcText);
  const spb = 60 / score.bpm;
  const dur = totalSec ?? score.totalBeats * spb;
  const dropSec = score.cues.find((c) => c.type === 'hit')?.beat ?? null;
  const riseBeat = score.cues.find((c) => c.type === 'rise')?.beat ?? null;
  const drop = dropSec === null ? null : dropSec * spb;
  const rise = riseBeat === null ? null : riseBeat * spb;
  const out: SampledEvent[] = [];
  const push = (p: Part, t: number, pitch: number | null, d: number | null, vel: number) => {
    if (t >= dur) return;
    out.push({
      t: Math.round(t * 10000) / 10000,
      inst: p.inst,
      pitch: p.hit !== undefined ? p.hit : pitch === null ? null : pitch + (p.shift ?? 0),
      dur: d,
      vel: Math.min(1, vel),
      pan: p.pan ?? 0,
      ...(p.gain !== undefined ? { gain: p.gain } : {}),
      ...(p.attack ? { attack: p.attack } : {}),
    });
  };
  // 高潮前收一口气：起势小节里旋律、低音、铺底压到 55%，军鼓滚奏从弱渐强 —— 高潮那一下才是全曲最大的跳变
  //（分析器按能量跳变找高潮；起势比高潮跳得猛，高潮会被测到起势那一小节，对拍就错了）
  const inRise = (t: number) => rise !== null && drop !== null && t >= rise - 1e-6 && t < drop - 1e-6;
  for (const ev of applyStops(score)) {
    const v = score.voices[ev.voice];
    if (!v || v.gain <= 0) continue;
    const t = ev.beat * spb;
    const d = ev.durBeats * spb;
    let vel = velocityAt(t, drop, dur) * (0.85 + 0.15 * ev.vel);
    if (inRise(t)) vel *= v.role === 'drums' ? 0.35 + 0.55 * ((t - rise!) / (drop! - rise!)) : 0.55;
    if (v.role === 'drums') {
      const parts = ev.midi <= 36 ? plan.kick : ev.midi <= 40 ? plan.snare : ev.midi <= 44 ? plan.hat : plan.crash;
      parts.forEach((p) => push(p, t, null, null, vel));
      continue;
    }
    const role = ROLE_OF[v.role] ?? 'melody';
    const parts = ev.durBeats < 1 ? plan[role].short : plan[role].long;
    parts.forEach((p) => push(p, t, ev.midi, d, vel));
  }
  if (drop !== null && drop < dur) plan.drop.forEach((p) => push(p, drop, p.hit !== undefined ? null : 43, 3, 1));
  // 第二高潮（静默之后再起）：同一组重拍，力度轻一些 —— 主高潮仍是全曲最大的跳变
  const hit2 = score.cues.find((c) => c.type === 'mark' && c.name === 'hit2');
  if (hit2 && hit2.beat * spb < dur) plan.drop.forEach((p) => push({ ...p, gain: (p.gain ?? 1) * 0.7 }, hit2.beat * spb, p.hit !== undefined ? null : 43, 2, 0.85));
  if (rise !== null && drop !== null && rise < drop) plan.rise.forEach((p) => push(p, rise, null, drop - rise + 0.05, 0.8));
  out.sort((a, b) => a.t - b.t || a.inst.localeCompare(b.inst));
  return { events: out, dur, dropSec: drop, riseSec: rise };
}

/** 渲染成 WAV；返回署名行和用到的乐器 */
export function renderSampled(abcText: string, outWav: string, options: { orchestra?: Orchestra; totalSec?: number } = {}): { credits: string[]; instruments: string[]; dropSec: number | null } {
  const orchestra = options.orchestra ?? 'cinematic';
  const { events, dur, dropSec } = sampledEvents(abcText, orchestra, options.totalSec);
  const res = runPy([path.join(process.cwd(), 'scripts/py/render_score.py')], {
    input: JSON.stringify({ events, dur, out: path.resolve(outWav), room: PLANS[orchestra].room }),
  });
  const last = res.trim().split('\n').pop() ?? '{}';
  const parsed = JSON.parse(last) as { credits: string[]; instruments: string[] };
  return { ...parsed, dropSec };
}
