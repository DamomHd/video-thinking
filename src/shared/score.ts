/**
 * 按片作曲：模型为这部片逐音符写谱（lemo-opuscar 每部样片的 mix.py 都是这样做的）。两种写法：
 *   · 网格先行（grid.lock 缺省 true）：先定配乐网格，画面锁在网格上
 *   · 画面先行（grid.lock: false）：画面已经排好，谱贴着画面上有名字的时刻写——g.hit('拍点或动作事件 id')
 *     取那一刻的秒数（lemo 的 HIT['lightOn']），vw check 不要求拍点在网格上；网格只给律动和段落用
 *
 * 和 vw music match（通用模板作曲 / 曲库改编 + 弹性对拍拉伸画面）不同，这里每部片的调性、和声、动机、配器、律动都由模型按内容定。
 * 网格先行的做法（借鉴 lemo-opuscar DIRECTOR §7、TECHNIQUE §3、§5）：
 *   1. 片子写 audio/score.ts：defineScore({ grid, notes(g) })——网格（速度、拍号、调、按小节分段）是全片唯一的时间来源
 *   2. 画面的每个落点从 g.sec(段, 小节, 拍) 取；成组元素踩 g.beatGrid()（和 shared/beats 同一种 BeatGrid）
 *   3. notes(g) 用代码生成音符事件（循环、琶音、按数据发声都行），乐器按风格的声音调色板挑
 *   4. vw music score <片> 渲出配乐、写回 music.json（track.source = 'score'）、对拍映射清成恒等
 *   5. vw check 查每个画面拍点都落在网格上（容差 1 帧）
 * 纯函数，可在 Node 里跑、有测试。
 */
import { BeatGrid, camelotTonic } from './beats';

export interface ScoreSection {
  id: string;
  /** 这一段几小节 */
  bars: number;
  label?: string;
}

export interface ScoreGridSpec {
  bpm: number;
  /** 每小节几拍，缺省 4 */
  beatsPerBar?: number;
  /** 调（Camelot，如 8B = C 大调、8A = A 小调），写进 music.json，音效按它走调内 */
  key: string;
  sections: ScoreSection[];
  /** 第一小节从第几秒开始（前面留一点空），缺省 0 */
  startSec?: number;
  /** 画面是否锁在网格上：缺省 true（网格先行，vw check 查拍点在网格上）；false = 画面先行，谱用 g.hit() 贴着画面写 */
  lock?: boolean;
}

/**
 * 一个音：
 *   inst  采样乐器名（violins、piano、marimba、harp、timpani…，见 vendor/lemo-opuscar/core/audio/INSTRUMENTS.md）
 *         · `pluck:<preset>` 拨弦物理建模（guqin / pipa / shamisen / koto / banjo / harp / kalimba / music_box…，需要 numba）
 *         · `synth:<voice>` 内置合成（pad 暖垫 / bass 合成贝斯 / pluck 合成拨音 / bell 铃 / plonk 木到金属的「咚」/ sub 低频）
 *   pitch 'C4' / 60（可带小数 = 微分音）；无音高的打击乐写变体名或不写
 */
export interface ScoreNote {
  t: number;
  inst: string;
  pitch?: string | number | null;
  dur?: number;
  vel?: number;
  pan?: number;
  gain?: number;
  attack?: number;
  release?: number;
  /** 打击乐的变体名（如 snare 的 'roll'） */
  var?: string;
}

export interface ScoreDef {
  grid: ScoreGridSpec;
  /** 混响房间：size 0..1、mix 0..1；缺省 { size: 0.45, mix: 0.18 } */
  room?: { size: number; mix: number };
  /** 曲尾在最后一小节之后再留几秒让余音落下，缺省 2 */
  tailSec?: number;
  /** 给配乐段起的名字（写进 music.json） */
  title?: string;
  notes: (g: ScoreGrid) => ScoreNote[];
}

export interface ScoreGrid {
  spec: ScoreGridSpec;
  beatSec: number;
  barSec: number;
  beatsPerBar: number;
  /** 全部小节结束的时刻（不含 tail） */
  endSec: number;
  /** 某一段的起止秒和小节数 */
  section(id: string): { start: number; end: number; bars: number; firstBar: number };
  /** 段 id 内第 bar 小节（0 起）第 beat 拍（0 起，可带小数）的秒 */
  sec(sectionId: string, bar?: number, beat?: number): number;
  /** 全曲第 bar 小节（0 起）第 beat 拍的秒 */
  at(bar: number, beat?: number): number;
  /** 和 shared/beats 同一种拍网格：画面用 onBeats / snapToBeat 踩拍 */
  beatGrid(): BeatGrid;
  /** 调内第 n 级音（0 = 主音，可为负或超过 7，自动跨八度）的 MIDI 号；octave 是主音所在的八度（C4 = 60 那个记法） */
  degree(n: number, octave?: number): number;
  /** 以第 n 级为根的三和弦（调内）MIDI 号 */
  triad(n: number, octave?: number): [number, number, number];
  /** 画面上有名字的时刻（拍点 id、动作事件 id → 乐谱秒），vw music score 从适配器的 hits() / events() 取 */
  moments: Record<string, number>;
  /** 某个画面时刻的秒数；没有这个 id 就报错并列出有哪些 */
  hit(id: string): number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const r4 = (v: number) => Math.round(v * 10000) / 10000;

export function scoreGrid(spec: ScoreGridSpec, moments: Record<string, number> = {}): ScoreGrid {
  if (!(spec.bpm > 0)) throw new Error('score: bpm 要大于 0');
  if (!spec.sections.length) throw new Error('score: 至少要有一段');
  const ids = new Set<string>();
  for (const s of spec.sections) {
    if (ids.has(s.id)) throw new Error(`score: 段 id 重复：${s.id}`);
    if (!(s.bars > 0)) throw new Error(`score: 段 ${s.id} 的小节数要大于 0`);
    ids.add(s.id);
  }
  const beatsPerBar = spec.beatsPerBar ?? 4;
  const beatSec = 60 / spec.bpm;
  const barSec = beatSec * beatsPerBar;
  const start = spec.startSec ?? 0;
  const firstBar: Record<string, number> = {};
  let acc = 0;
  for (const s of spec.sections) {
    firstBar[s.id] = acc;
    acc += s.bars;
  }
  const totalBars = acc;
  const at = (bar: number, beat = 0) => r4(start + bar * barSec + beat * beatSec);
  const section = (id: string) => {
    const s = spec.sections.find((x) => x.id === id);
    if (!s) throw new Error(`score: 没有段 ${id}（有：${spec.sections.map((x) => x.id).join('、')}）`);
    return { start: at(firstBar[id]), end: at(firstBar[id] + s.bars), bars: s.bars, firstBar: firstBar[id] };
  };
  const { semisFromA, minor } = camelotTonic(spec.key);
  const scale = minor ? MINOR : MAJOR;
  const tonicPc = (9 + semisFromA) % 12;
  const degree = (n: number, octave = 4) => {
    const o = Math.floor(n / 7);
    const i = ((n % 7) + 7) % 7;
    return 12 * (octave + 1 + o) + tonicPc + scale[i];
  };
  return {
    spec,
    beatSec,
    barSec,
    beatsPerBar,
    endSec: at(totalBars),
    section,
    sec: (id, bar = 0, beat = 0) => at(section(id).firstBar + bar, beat),
    at,
    beatGrid: () => {
      const beats: number[] = [];
      const downbeats: number[] = [];
      for (let b = 0; b < totalBars * beatsPerBar; b++) {
        const s = r4(start + b * beatSec);
        beats.push(s);
        if (b % beatsPerBar === 0) downbeats.push(s);
      }
      return { beats, downbeats, beatSec };
    },
    degree,
    triad: (n, octave = 4) => [degree(n, octave), degree(n + 2, octave), degree(n + 4, octave)],
    moments,
    hit: (id) => {
      if (!(id in moments)) throw new Error(`score: 画面上没有时刻 ${id}（有：${Object.keys(moments).slice(0, 20).join('、') || '无——vw music score 从适配器的 hits() / events() 取'}）`);
      return moments[id];
    },
  };
}

export function defineScore(def: ScoreDef): ScoreDef {
  return def;
}

/** 画面上有名字的时刻（纯函数）：拍点取 sec，动作事件取落定时刻（land，缺省 at）；同名时动作事件优先 */
export function filmMoments(hits: { id: string; sec: number }[], events: { id: string; at: number; land?: number }[] = []): Record<string, number> {
  const out: Record<string, number> = {};
  for (const h of hits) out[h.id] = h.sec;
  for (const e of events) out[e.id] = e.land ?? e.at;
  return out;
}

/** 渲染前的整理：按时间排序、夹住范围、检查明显的错（纯函数，vw music score 用） */
export function scoreEvents(def: ScoreDef, moments: Record<string, number> = {}): { grid: ScoreGrid; notes: ScoreNote[]; durSec: number; problems: string[] } {
  const grid = scoreGrid(def.grid, moments);
  const durSec = r4(grid.endSec + (def.tailSec ?? 2));
  const problems: string[] = [];
  const notes = def
    .notes(grid)
    .filter((n, i) => {
      if (!n.inst) { problems.push(`第 ${i + 1} 个音没写乐器`); return false; }
      if (!(n.t >= 0) || n.t >= durSec) { problems.push(`第 ${i + 1} 个音（${n.inst}）时刻 ${n.t} 不在 0–${durSec} 秒内`); return false; }
      return true;
    })
    .map((n) => ({ ...n, t: r4(n.t), vel: Math.max(0.01, Math.min(1, n.vel ?? 0.8)), pan: Math.max(-1, Math.min(1, n.pan ?? 0)) }))
    .sort((a, b) => a.t - b.t || a.inst.localeCompare(b.inst));
  if (!notes.length) problems.push('谱里一个音都没有');
  return { grid, notes, durSec, problems };
}

/**
 * 画面拍点是否落在网格上（vw check 用）：want = downbeat / drop 要在小节头，beat 要在拍上，其余在 1/4 拍上；
 * 容差缺省 1 帧。返回没落上的拍点和差多少毫秒。
 */
export function offGridHits(
  hits: { id: string; sec: number; want?: string }[],
  grid: ScoreGrid,
  fps = 30
): { id: string; sec: number; nearest: number; errMs: number; want: string }[] {
  const tol = 1 / fps + 1e-6;
  const bg = grid.beatGrid();
  const quarter: number[] = [];
  bg.beats.forEach((b) => [0, 0.25, 0.5, 0.75].forEach((f) => quarter.push(r4(b + f * grid.beatSec))));
  const out: { id: string; sec: number; nearest: number; errMs: number; want: string }[] = [];
  for (const h of hits) {
    const want = h.want ?? 'beat';
    const pts = want === 'downbeat' || want === 'drop' ? bg.downbeats : want === 'beat' ? bg.beats : quarter;
    let best = pts[0] ?? 0;
    for (const p of pts) if (Math.abs(p - h.sec) < Math.abs(best - h.sec)) best = p;
    if (Math.abs(best - h.sec) > tol) out.push({ id: h.id, sec: h.sec, nearest: best, errMs: Math.round((h.sec - best) * 1000), want });
  }
  return out;
}
