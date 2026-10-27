/**
 * 节拍网格 + 序列音效（画面元素按拍入场、每个元素配一声在调内的音）
 *
 * 参考片的「灵动感」：卡片一张张进来、图标一格格亮起，每一下都踩在音乐的拍上，
 * 而且每一下配一声音高递进的轻音（像一段琶音）。这里提供工程衔接，编排由模型决定：
 *   · beatGrid      配乐段 → 每一拍的乐谱秒（只用 music.json / sync.json 已有字段：速度、入点、素材起点、对拍映射）
 *   · snapToBeat    把一个时刻吸到最近的拍（可细分到半拍 / 四分之一拍）
 *   · onBeats       从某时刻之后的第一拍起，每隔 every 拍取 n 个时刻 —— 一组元素的落点
 *   · sequenceSpots 一组落点 → 一串 SpotAnnotation，音高按配乐调性的音阶走（pitchSemis）
 * 选哪组元素配声、用什么音色、音阶上行还是下行，都由片子决定。
 */

import { MusicFile, SpotAnnotation, SyncFile, AudioLayer, SfxLayer } from './types';
import { buildTimeWarp, IDENTITY_WARP } from './timewarp';

export interface BeatGrid {
  /** 每一拍的乐谱秒 */
  beats: number[];
  /** 每小节第一拍的乐谱秒 */
  downbeats: number[];
  beatSec: number;
}

/**
 * 配乐段的节拍网格（乐谱秒）。配乐段本身就在放映时间轴上（FilmAudio 直接按 cue.in.sec 挂载）：
 * 第 k 拍的放映秒 = 入点 + k·拍长 − 素材起点，再经对拍映射换回乐谱秒 —— 画面编舞用的是乐谱秒。
 * 假设素材第 0 秒在拍上（本地作曲成立；外部曲目首拍有偏移时用 offsetSec 补）。
 */
export function beatGrid(music: MusicFile, sync?: SyncFile, options: { cue?: string; offsetSec?: number; beatsPerBar?: number } = {}): BeatGrid {
  const cue = options.cue ? music.cues.find((c) => c.id === options.cue) : music.cues[0];
  if (!cue?.track?.bpm) return { beats: [], downbeats: [], beatSec: 0 };
  const warp = sync && sync.knots?.length ? buildTimeWarp(sync) : IDENTITY_WARP;
  const toScore = (f: number) => (warp.IS_IDENTITY ? f : warp.toScore(f));
  const beatSec = 60 / cue.track.bpm;
  const filmIn = cue.in.sec;
  const filmOut = cue.out.sec;
  const phase = (options.offsetSec ?? 0) - (cue.startFromSec ?? 0);
  const perBar = options.beatsPerBar ?? 4;
  const beats: number[] = [];
  const downbeats: number[] = [];
  const k0 = Math.ceil((0 - phase) / beatSec - 1e-9);
  for (let k = k0; ; k++) {
    const f = filmIn + phase + k * beatSec;
    if (f > filmOut + 1e-9) break;
    if (f < filmIn - 1e-9) continue;
    const s = Math.round(toScore(f) * 10000) / 10000;
    beats.push(s);
    if (((k % perBar) + perBar) % perBar === 0) downbeats.push(s);
  }
  return { beats, downbeats, beatSec };
}

/** 细分后的拍点（sub = 2：半拍；sub = 4：四分之一拍），在相邻两拍之间线性插值 */
function subdivided(grid: BeatGrid, sub: number): number[] {
  if (sub <= 1) return grid.beats;
  const out: number[] = [];
  for (let i = 0; i < grid.beats.length; i++) {
    out.push(grid.beats[i]);
    const next = grid.beats[i + 1];
    if (next === undefined) break;
    for (let j = 1; j < sub; j++) out.push(grid.beats[i] + ((next - grid.beats[i]) * j) / sub);
  }
  return out;
}

/** 吸到最近的拍（或细分拍）；网格为空时原样返回 */
export function snapToBeat(t: number, grid: BeatGrid, sub = 1): number {
  const pts = subdivided(grid, sub);
  if (!pts.length) return t;
  let best = pts[0];
  for (const p of pts) if (Math.abs(p - t) < Math.abs(best - t)) best = p;
  return best;
}

/**
 * 从 from 之后（含）的第一个拍点起，每隔 every 个拍点取一个，共 n 个。
 * sub 决定「拍点」的颗粒：sub = 2 时 every = 1 就是每半拍一个。网格不够长时按最后的间隔外推。
 */
export function onBeats(from: number, n: number, grid: BeatGrid, options: { every?: number; sub?: number; downbeatsOnly?: boolean } = {}): number[] {
  const pts = options.downbeatsOnly ? grid.downbeats : subdivided(grid, options.sub ?? 1);
  const every = Math.max(1, Math.round(options.every ?? 1));
  if (!pts.length) return Array.from({ length: n }, (_, i) => from + i * 0.25);
  let i = pts.findIndex((p) => p >= from - 1e-6);
  if (i < 0) i = pts.length - 1;
  const step = pts.length > 1 ? pts[pts.length - 1] - pts[pts.length - 2] : 0.5;
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const idx = i + k * every;
    out.push(idx < pts.length ? pts[idx] : pts[pts.length - 1] + (idx - pts.length + 1) * step);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* 调性与音阶                                                            */
/* ------------------------------------------------------------------ */

/** Camelot 调号 → 主音（相对 A 的半音数，0–11）与大小调 */
export function camelotTonic(camelot: string | undefined): { semisFromA: number; minor: boolean } {
  const m = camelot?.match(/^(\d{1,2})([AB])$/i);
  if (!m) return { semisFromA: 3, minor: false }; // 缺省 C 大调
  const n = Number(m[1]);
  const minor = m[2].toUpperCase() === 'A';
  // 8B = C 大调、8A = A 小调；顺时针每格上行纯五度（+7 半音）
  const base = minor ? 0 : 3; // A = 0，C = 3
  return { semisFromA: (((base + (n - 8) * 7) % 12) + 12) % 12, minor };
}

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

/**
 * 第 i 个音的半音偏移（相对 A4，给 pitchSemis 用；音色素材必须调在 A4 = 440Hz）。
 * contour：up 逐个上行、down 逐个下行、updown 上去再回来；degree0 = 从音阶第几级开始。
 */
export function scaleSemis(
  i: number,
  n: number,
  options: { key?: string; scale?: keyof typeof SCALES | 'auto'; contour?: 'up' | 'down' | 'updown'; degree0?: number; octave?: number } = {}
): number {
  const { semisFromA, minor } = camelotTonic(options.key);
  const scaleName = !options.scale || options.scale === 'auto' ? (minor ? 'minorPentatonic' : 'pentatonic') : options.scale;
  const sc = SCALES[scaleName];
  const contour = options.contour ?? 'up';
  let step = i;
  if (contour === 'down') step = n - 1 - i;
  if (contour === 'updown') step = i < n / 2 ? i : n - 1 - i;
  const deg = (options.degree0 ?? 0) + step;
  const oct = Math.floor(deg / sc.length);
  const within = ((deg % sc.length) + sc.length) % sc.length;
  // 主音放在 A4 往上的那个八度（0…+11 半音，C 调就是 C5）：UI 轻音在这个音区清亮；
  // 素材按 A4 合成，往下变调会变闷变长，所以默认只往上走，要低沉用 octave: -1
  return semisFromA + sc[within] + 12 * (oct + (options.octave ?? 0));
}

export interface SequenceSpotOptions {
  /** 语义前缀，每条 id 为「前缀 1/2/3…」 */
  id: string;
  /** 每个元素的落点（乐谱秒），通常来自 onBeats */
  times: number[];
  slot: string;
  layer: SfxLayer;
  what: string;
  /** 配乐调号（music.json 的 track.key，Camelot） */
  key?: string;
  scale?: 'major' | 'minor' | 'pentatonic' | 'minorPentatonic' | 'auto';
  contour?: 'up' | 'down' | 'updown';
  degree0?: number;
  octave?: number;
  /** 每声的时长（秒） */
  len?: number;
}

/** 一组落点 → 一串逐个配声的 SpotAnnotation（音高在调内按音阶走） */
export function sequenceSpots(o: SequenceSpotOptions): SpotAnnotation[] {
  const n = o.times.length;
  return o.times.map((t, i) => ({
    id: `${o.id} ${i + 1}`,
    fromSec: t,
    toSec: t + (o.len ?? 0.4),
    layer: o.layer,
    slot: o.slot,
    what: `${o.what}（第 ${i + 1}/${n} 个）`,
    pitchSemis: scaleSemis(i, n, { key: o.key, scale: o.scale, contour: o.contour, degree0: o.degree0, octave: o.octave }),
  }));
}
