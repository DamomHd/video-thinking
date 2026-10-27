/**
 * 镜头清单编译器 (Shot List → Camera Rail)
 *
 * 分工：镜头「去哪、停多久、怎么过去」是创作决定，由模型（或人）写成镜头清单；
 * 工程只负责衔接 —— 把清单编译成 CamKey、报出移动 / 硬切区间给声音和守门、检查清单自洽。
 * 这里不内置任何编排规则（何时起步、要不要拉远、段与段共不共用机位，都由清单写明）。
 *
 * 词汇：
 *   停留 hold   still   完全静止
 *               push    缓推：停留结束时 z × amount（<1 推近，>1 拉远）
 *               drift   慢漂：停留期间平移 dx / dy（世界像素）
 *   过渡 out    glide   两头缓的直推
 *               arc     先拉远再推近（中点 z × lift），两半在中点速度连续
 *               whip    甩镜：起步急、到位急停（时长通常 0.3–0.5s）
 *               cut     硬切：start 那一刻直接跳到下一个镜头
 *
 * 用什么镜头语言（漫游 / 舞台 / 蒙太奇…）由模型按内容选，见 docs/library/。
 */

import { CamKey } from './camera';
import { Rect } from './morph';
import { frameRect, Framing } from './shot';
import { camInOut, clamp01 } from './anim';


export type HoldStyle = { kind: 'still' } | { kind: 'push'; amount: number } | { kind: 'drift'; dx: number; dy: number };
export type MoveKind = 'glide' | 'arc' | 'whip' | 'cut';

export interface Shot {
  id?: string;
  /** 取景：世界里的矩形，或直接给机位 */
  frame: Rect | Framing;
  /** 到位时刻（秒）—— 第一个镜头就是起始时刻 */
  at: number;
  /** 到位后怎么停；缺省 still */
  hold?: HoldStyle;
  /** 怎么去下一个镜头；最后一个镜头不写。start = 起步时刻（cut 时就是切的时刻） */
  out?: { kind: MoveKind; start: number; lift?: number; ease?: (p: number) => number };
  /** Rect 取景的留白比例，缺省 0 */
  margin?: number;
}

export interface CompiledCamera {
  keys: CamKey[];
  /** 移动区间（不含 cut） */
  moves: { from: number; to: number; kind: Exclude<MoveKind, 'cut'>; shot: number }[];
  /** 硬切时刻（闪帧扫描据此把它们当成预期的切点） */
  cuts: number[];
}

const camIn = (p: number) => Math.pow(clamp01(p), 3.5);
const camOutOnly = (p: number) => 1 - Math.pow(1 - clamp01(p), 3.5);
/** 甩镜：两头都陡（指数 6），中段几乎一闪而过 */
const whipEase = (p: number) => {
  const x = clamp01(p);
  return x < 0.5 ? Math.pow(2 * x, 6) / 2 : 1 - Math.pow(2 * (1 - x), 6) / 2;
};

const isRect = (f: Rect | Framing): f is Rect => 'w' in f;
const toFraming = (s: Shot, stage?: [number, number]): Framing =>
  isRect(s.frame) ? frameRect(s.frame, { margin: s.margin ?? 0, stage }) : s.frame;

function endOfHold(f: Framing, hold: HoldStyle | undefined): Framing {
  if (!hold || hold.kind === 'still') return f;
  if (hold.kind === 'push') return { ...f, z: f.z * hold.amount };
  return { ...f, x: f.x + hold.dx, y: f.y + hold.dy };
}

/** 检查清单自洽：时刻递增、起步不早于到位、到位不早于起步。返回问题列表（空 = 通过） */
export function validateShots(shots: Shot[]): string[] {
  const errs: string[] = [];
  shots.forEach((s, i) => {
    const name = s.id ?? `#${i}`;
    const next = shots[i + 1];
    if (next && !s.out) errs.push(`镜头 ${name} 后面还有镜头，但没写 out（怎么过去）`);
    if (!next && s.out) errs.push(`镜头 ${name} 是最后一个，不该写 out`);
    if (s.out && s.out.start < s.at - 1e-9) errs.push(`镜头 ${name} 的起步 ${s.out.start}s 早于到位 ${s.at}s`);
    if (next && s.out && s.out.kind !== 'cut' && next.at < s.out.start + 1e-6) errs.push(`镜头 ${name} → ${next.id ?? `#${i + 1}`}：到位 ${next.at}s 不晚于起步 ${s.out.start}s`);
    if (next && s.out?.kind === 'cut' && Math.abs(next.at - s.out.start) > 1e-6) errs.push(`镜头 ${name} 硬切：下一个镜头的 at 应等于切的时刻 ${s.out.start}s`);
  });
  return errs;
}

export function compileShots(shots: Shot[], options: { stage?: [number, number] } = {}): CompiledCamera {
  const errs = validateShots(shots);
  if (errs.length) throw new Error(`镜头清单不自洽:\n  ${errs.join('\n  ')}`);
  const keys: CamKey[] = [];
  const moves: CompiledCamera['moves'] = [];
  const cuts: number[] = [];

  shots.forEach((s, i) => {
    const f = toFraming(s, options.stage);
    const next = shots[i + 1];
    const leave = s.out ? s.out.start : s.at;
    const held = endOfHold(f, s.hold);
    // 停留段：线性走到停留终点（缓推 / 慢漂）
    keys.push({ t: s.at, ...f, ease: (p) => p });
    if (leave > s.at + 1e-6) keys.push({ t: leave, ...held });
    if (!next || !s.out) return;
    const nf = toFraming(next, options.stage);
    const last = keys[keys.length - 1];
    if (s.out.kind === 'cut') {
      // 切的那一刻之前保持停留终点，到点直接换成下一个机位
      last.ease = () => 0;
      cuts.push(s.out.start);
      return;
    }
    if (s.out.kind === 'arc') {
      last.ease = camIn;
      keys.push({
        t: (leave + next.at) / 2,
        x: (held.x + nf.x) / 2,
        y: (held.y + nf.y) / 2,
        z: Math.max(held.z, nf.z) * (s.out.lift ?? 1.25),
        ease: camOutOnly,
      });
    } else {
      last.ease = s.out.ease ?? (s.out.kind === 'whip' ? whipEase : camInOut);
    }
    moves.push({ from: leave, to: next.at, kind: s.out.kind, shot: i });
  });
  return { keys, moves, cuts };
}
