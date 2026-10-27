/**
 * 拍网格 (Beat Grid)
 * 对标 architecture.html §6.5：预告片 / 短片的时间轴不按幕表走，而是按配乐的拍号走。
 *   预告片：DROP、BEAT、beat(n)、STOP = beat(32)
 *   短片：  按小节，bar(m) = DROP + m · BAR
 * 换配乐时只改 DROP / BPM 这几个数，所有镜头按拍号自动挪位。
 */

export interface BeatGridOptions {
  /** 主高潮（drop）在配乐里的秒数 —— 网格的原点 */
  dropSec: number;
  bpm: number;
  /** 每小节几拍，默认 4/4 */
  beatsPerBar?: number;
  /** 片子从配乐的哪一秒开始取（默认 0） */
  startSec?: number;
}

export interface BeatGrid {
  readonly DROP: number;
  readonly BEAT: number;
  readonly BAR: number;
  readonly bpm: number;
  readonly beatsPerBar: number;
  /** 第 n 拍的绝对秒数（n 可为负，表示 drop 之前） */
  beat(n: number): number;
  /** 第 m 小节头的绝对秒数 */
  bar(m: number): number;
  /** 把绝对秒数折回拍号（可能是小数） */
  beatOf(sec: number): number;
  /** 吸附到最近的拍 */
  snapBeat(sec: number): number;
  /** 吸附到最近的小节头 */
  snapBar(sec: number): number;
}

export function makeBeatGrid(options: BeatGridOptions): BeatGrid {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const BEAT = 60 / options.bpm;
  const BAR = BEAT * beatsPerBar;
  const DROP = options.dropSec;

  // 不在这里取整：BEAT 常常是无理数（90bpm → 2/3 秒），取整会让 beatOf 不再是精确逆函数。
  // 到帧的换算在装配时统一做 Math.round(sec * fps)，所以这里保留全精度。
  const beat = (n: number) => DROP + n * BEAT;
  const bar = (m: number) => DROP + m * BAR;

  return {
    DROP,
    BEAT,
    BAR,
    bpm: options.bpm,
    beatsPerBar,
    beat,
    bar,
    beatOf: (sec: number) => (sec - DROP) / BEAT,
    snapBeat: (sec: number) => beat(Math.round((sec - DROP) / BEAT)),
    snapBar: (sec: number) => bar(Math.round((sec - DROP) / BAR)),
  };
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/* ------------------------------------------------------------------ */
/* 镜头表                                                              */
/* ------------------------------------------------------------------ */

export interface ShotSpec {
  id: string;
  label: string;
  /** 入点（绝对秒）—— 一律用 grid.beat(n) / grid.bar(m) 写，不写死秒数 */
  fromSec: number;
  /** 出点（绝对秒） */
  toSec: number;
  /** 入场过渡在交叠的几秒里让本镜头浮现 */
  enterSec?: number;
}

export type ResolvedShot<T extends ShotSpec = ShotSpec> = T & {
  index: number;
  durSec: number;
};

/**
 * 把镜头表解析成有序序列，并校验：入点递增、每个镜头有正时长。
 * 镜头之间允许留白（预告片常见），所以不要求首尾相接。
 */
export function resolveShots<T extends ShotSpec>(shots: T[]): {
  shots: ResolvedShot<T>[];
  byId: Record<string, ResolvedShot<T>>;
  totalSec: number;
  errors: string[];
} {
  const errors: string[] = [];
  const sorted = [...shots].sort((a, b) => a.fromSec - b.fromSec);
  const resolved: ResolvedShot<T>[] = [];
  const byId: Record<string, ResolvedShot<T>> = {};

  sorted.forEach((s, index) => {
    const durSec = round4(s.toSec - s.fromSec);
    if (durSec <= 0) {
      errors.push(`镜头 '${s.id}' 时长非正: ${s.fromSec} → ${s.toSec}`);
    }
    if (byId[s.id]) errors.push(`镜头 id 重复: '${s.id}'`);
    const r = { ...s, index, durSec } as ResolvedShot<T>;
    resolved.push(r);
    byId[s.id] = r;
  });

  const totalSec = resolved.length
    ? round4(Math.max(...resolved.map((s) => s.toSec)))
    : 0;

  return { shots: resolved, byId, totalSec, errors };
}
