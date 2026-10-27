/**
 * ClaudeAnimationBase 引擎的类型化入口：在 <PaintCanvas draw={…}> 的绘制函数里用
 *
 *   const draw = (t: number) => {
 *     const { paint, inkLine, glow, clawd, emotions, PAL, ellPts } = cab();
 *     paint(ellPts(960, 900, 900, 160, 40, 3), { fill: PAL.sap, fillOp: 140, ink: null });
 *     clawd(960, 860, 26, emotions(t, [[0, 'sleepy'], [1.8, 'surprised']]));
 *   };
 *
 * 函数的语义、参数和画法规矩全在上游指南（docs/method/animation-guide.md「Engine」「Clawd」两节），这里只给类型。
 * 只能在引擎加载完之后、绘制函数里调用（PaintCanvas 保证这一点）。
 */

export type Pt = [number, number];
export type Pts = Pt[];

/** paint() 的选项：wash 平涂 / fill 水彩 / hatch 排线 / ink 描边（null = 不描边） */
export interface PaintOpts {
  wash?: string;
  washOp?: number;
  fill?: string;
  fillOp?: number;
  bleed?: number;
  tex?: number;
  border?: number;
  hatch?: { d: number; a: number; o?: { rand?: number; gradient?: number }; b?: string; c?: string; w?: number };
  ink?: string | null;
  sw?: number;
  br?: string;
  curv?: number;
}

/** 角色的姿态 / 表情选项（上游 clawd() 的 options，字段很多，见指南「Options」表） */
export type CharOpts = Record<string, any>;

type Fn<A extends any[] = any[], R = any> = (...a: A) => R;

export interface CabApi {
  readonly T: number;
  W: number;
  H: number;
  BPM: number;
  BEAT: number;
  OFF: number;
  BOIL: number;
  DUR: number;
  TAU: number;
  PAL: Record<'paper' | 'ink' | 'clay' | 'clayDk' | 'clayLt' | 'night' | 'indigo' | 'rose' | 'ochre' | 'sap' | 'teal' | 'violet' | 'cream' | 'sky', string>;
  EMO: Record<string, any>;
  VIEWS: string[];
  LOOPS: Record<string, Fn & { len?: number }>;
  SHOTS: [number, Fn][];

  // 时间与缓动（全是 t 的纯函数）
  clamp: Fn<[number, number?, number?], number>;
  lerp: Fn<[number, number, number], number>;
  ease: Fn<[number], number>;
  easeIn: Fn<[number], number>;
  easeOut: Fn<[number], number>;
  backOut: Fn<[number], number>;
  elasticOut: Fn<[number], number>;
  seg: Fn<[number, number, number], number>;
  frac: Fn<[number], number>;
  kf: Fn<[number, [number, number | number[]][], Fn<[number], number>?], any>;
  wob: Fn<[number, number?, number?], number>;
  bpOf: Fn<[number], number>;
  beatN: Fn<[number], number>;
  pulse: Fn<[number, number?], number>;
  pulse2: Fn<[number, number?], number>;
  onTwos: Fn<[number], number>;

  // 随机（boil 每秒 12 次换种子；hash 给按编号稳定的值）
  hash: Fn<[number], number>;
  jit: Fn<[number], number>;
  boilSeed: Fn<[string | number], void>;
  mixCol: Fn<[string, string, number], string>;

  // 表演
  spring: Fn<[number, number, number?, number?], number>;
  ring: Fn<[number, number[], number?, number?], number>;
  arcPt: Fn<[Pt, Pt, number, number], Pt>;
  jump: Fn<[number, number, number, number?], { dy: number; sq: number }>;
  take: Fn<[number, number, number?], { dy: number; sq: number }>;
  stroll: Fn<[number, number, number, number, number, number], CharOpts>;

  // 镜头与整屏效果
  camBegin: Fn<[number?, number?, number?, number?], void>;
  camEnd: Fn<[], void>;
  toScreen: Fn<[number, number, any?], Pt>;
  shakeXY: Fn<[number, number], Pt>;
  flash: Fn<[number, string?], void>;
  glow: Fn<[number, number, number, string?, number?], void>;
  iris: Fn<[number, number, number, string?], void>;
  irisShape: Fn<[Pts, string?, number?], void>;
  brushWipe: Fn<[number, [string, string]?], void>;

  // 形状与绘制
  rectPts: Fn<[number, number, number, number, number?], Pts>;
  ellPts: Fn<[number, number, number, number, number?, number?, number?], Pts>;
  rrPts: Fn<[number, number, number, number, number, number?], Pts>;
  starPts: Fn<[number, number, number, number?, number?, number?], Pts>;
  heartPts: Fn<[number, number, number], Pts>;
  through: Fn<[Pts, number?], Pts>;
  ribbon: Fn<[Pts, number, number?], Pts>;
  paint: Fn<[Pts, PaintOpts?], void>;
  inkLine: Fn<[Pts, number?, string?, string?, number?], void>;
  letter: Fn<[string, number, number, number, string, Record<string, any>?], void>;
  sfx: Fn<[string, number, number, number, string, number, Record<string, any>?], void>;
  flushLetters: Fn<[], void>;
  flushBrush: Fn<[], void>;

  // 角色
  clawd: Fn<[number, number, number, CharOpts?], void>;
  spinView: Fn<[number], CharOpts>;
  turn: Fn<[number, number, number, number, number], CharOpts>;
  feel: Fn<[string, number, CharOpts?], CharOpts>;
  emotions: Fn<[number, [number, string, CharOpts?][], { take?: number }?], CharOpts>;
  move: Fn<[string, number, number?], CharOpts>;
  dancer: Fn<[number, number, number, string, number, CharOpts?], void>;
  emote: Fn<[string, number, number, number, number?, number?], void>;
  shots: Fn<[[number, Fn<[number, number, number], void>][]], void>;
}

export function cab(): CabApi {
  const api = (window as unknown as { __cab?: CabApi }).__cab;
  if (!api) throw new Error('ClaudeAnimationBase 引擎还没加载：只能在 <PaintCanvas> 的绘制函数里调用 cab()');
  return api;
}
