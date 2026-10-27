/**
 * 结构化配乐谱生成器 —— 按段长与高潮位置写一首「铺满全程、有律动」的曲子
 *
 * 为什么要有它（2026-10-25 对比 loomcare.mp4 / 迁移汇报.mp4 实测）：
 *   旧的本地作曲只有三份写死的谱子，片长 / 高潮参数全被忽略。anlan-report 60 秒的配乐只响了前 23 秒，
 *   后 37 秒是静音；谱子里也只有钢琴、贝斯、铺底的整小节长音 —— 没有鼓，没有八分音符的推进。
 *   成片听起来就是「有音效的节拍，没有音乐的律动」。参考片的低频和中频一样厚（−2.5 / −4.5 dB），我们是 −5.7 / −1.8。
 *
 * 结构（以小节为单位，高潮小节由 dropSec 决定）：
 *   前奏      铺底 + 钢琴二分音符                                   —— 留出开场的呼吸
 *   律动起    + 八分音符贝斯 + 八分踩镲 + 1、3 拍底鼓                    —— 从这里开始一直有脉冲
 *   推进      + 2、4 拍军鼓 + 钢琴八分分解和弦
 *   起势      高潮前一小节：军鼓八分滚奏 + 上行 riser，底鼓抽掉制造悬空
 *   高潮      !hit! + 镲片，四拍底鼓全开
 *   收尾      最后 1–2 小节回到铺底 + 长和弦
 *
 * 高潮对齐：先按名义速度算出最近的小节头，再在 ±8% 内微调速度，让那个小节头**正好**落在 dropSec 上。
 * 调性：C 大调（I–V–vi–IV），全部用自然音，不依赖解析器的升降号。
 */

export interface StructuredScoreOptions {
  bpm: number;
  totalSec: number;
  /** 高潮（hit）要落的位置，秒；不给就放在 70% 处 */
  dropSec?: number;
  /**
   * 第二高潮（音乐真值 cue.climax2）：在它之前全体静默 stopBeats 拍，到它时镲片 + 重拍再起（中段的「静 → 爆」）。
   * 落在最近的拍上（速度已经为主高潮对齐过）；太靠前、或进了主高潮的起势小节就不写
   */
  climax2Sec?: number;
  /** 第二高潮前静默几拍，缺省 2（半小节） */
  stopBeats?: number;
  title?: string;
}

export interface StructuredScore {
  abc: string;
  /** 为对齐高潮微调后的实际速度 */
  bpm: number;
  bars: number;
  dropBar: number;
  /** 高潮小节头的实际秒数 */
  dropAtSec: number;
  /** 第二高潮实际落点（秒）与之前静默的起点；没写就没有 */
  climax2AtSec?: number;
  stopAtSec?: number;
}

const BEATS = 4;

/** MIDI → ABC 音名（只用自然音）：60 = C，72 = c，48 = C, */
export function abcNote(midi: number): string {
  const NAMES: Record<number, string> = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
  const pc = ((midi % 12) + 12) % 12;
  const name = NAMES[pc];
  if (!name) throw new Error(`abcNote: ${midi} 不是自然音`);
  const oct = Math.floor(midi / 12) - 5; // 60 → 0
  if (oct >= 1) return name.toLowerCase() + "'".repeat(oct - 1);
  return name + ','.repeat(-oct);
}

/** I–V–vi–IV：每个和弦给根音（贝斯八度）和三个和弦音（中音区） */
const PROGRESSION = [
  { root: 36, tones: [60, 64, 67] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
];

const KICK = 36; // C,,
const SNARE = 38; // D,,
const HAT = 41; // F,,
const CRASH = 45; // A,,

type Level = 'intro' | 'groove' | 'push' | 'rise' | 'drop' | 'outro';

export function generateStructuredScoreAbc(o: StructuredScoreOptions): StructuredScore {
  let bpm = o.bpm;
  let barSec = (BEATS * 60) / bpm;
  let bars = Math.max(4, Math.ceil(o.totalSec / barSec - 1e-6));
  let dropBar = Math.round(((o.dropSec ?? o.totalSec * 0.7) / barSec));
  dropBar = Math.max(2, Math.min(bars - 1, dropBar));

  // 微调速度让高潮小节头正好落在 dropSec（±8% 以内，超了就不调，接受半小节以内的误差）
  if (o.dropSec !== undefined && dropBar > 0) {
    const snapped = (BEATS * 60 * dropBar) / o.dropSec;
    if (Math.abs(snapped / bpm - 1) <= 0.08) {
      bpm = Math.round(snapped * 100) / 100;
      barSec = (BEATS * 60) / bpm;
      bars = Math.max(dropBar + 1, Math.ceil(o.totalSec / barSec - 1e-6));
    }
  }

  const outroBars = Math.min(2, Math.max(0, bars - dropBar - 1));
  const introBars = Math.max(1, Math.min(4, Math.floor(dropBar / 4)));
  const pushFrom = Math.max(introBars + 1, Math.floor(dropBar * 0.55));

  const levelOf = (b: number): Level => {
    if (b >= bars - outroBars && b > dropBar) return 'outro';
    if (b >= dropBar) return 'drop';
    if (b === dropBar - 1) return 'rise';
    if (b < introBars) return 'intro';
    if (b < pushFrom) return 'groove';
    return 'push';
  };

  // 第二高潮：落在最近的拍上，之前静默 stopBeats 拍（要在第 2 小节之后、主高潮起势小节之前）
  const beatSec = barSec / BEATS;
  const stopBeats = o.stopBeats ?? 2;
  let k2: number | null = null;
  if (o.climax2Sec !== undefined) {
    const k = Math.round(o.climax2Sec / beatSec);
    if (k - stopBeats >= BEATS * 2 && k < (dropBar - 1) * BEATS) k2 = k;
  }
  /** 一小节里在第 o 拍挂标记 / 放一个音：拆成「休止 o 拍 + 内容 + 补齐的休止」 */
  const barAt = (items: { o: number; token: string; beats: number }[]) => {
    let pos = 0;
    const parts: string[] = [];
    for (const it of [...items].sort((a, b) => a.o - b.o)) {
      if (it.o > pos) parts.push(`z${it.o - pos}`);
      parts.push(it.token);
      pos = Math.max(pos, it.o + it.beats);
    }
    if (pos < BEATS) parts.push(`z${BEATS - pos}`);
    return parts.join(' ');
  };

  const piano: string[] = [];
  const bass: string[] = [];
  const pad: string[] = [];
  const kick: string[] = [];
  const snare: string[] = [];
  const hat: string[] = [];
  const crash: string[] = [];
  const marks: string[] = []; // 挂 !hit! / !rise(! 的空声部（只占时值）

  const n = abcNote;
  const E = '1/2'; // 八分音符
  for (let b = 0; b < bars; b++) {
    const lv = levelOf(b);
    const ch = PROGRESSION[b % PROGRESSION.length];
    const [t1, t3, t5] = ch.tones;
    const chord = `[${n(t1)}${n(t3)}${n(t5)}]`;
    const padChord = `[${n(t1 - 12)}${n(t3 - 12)}${n(t5 - 12)}]`;

    // 铺底：每小节一个长和弦，全程都在（收尾也在）
    pad.push(`${padChord}4`);

    // 钢琴
    if (lv === 'intro' || lv === 'outro' || lv === 'groove') {
      piano.push(`${chord}2 ${chord}2`);
    } else {
      // 八分分解和弦：根 五 八度 三 | 八度 五 根 五
      const arp = [t1, t5, t1 + 12, t3 + 12, t1 + 12, t5, t1, t5];
      piano.push(arp.map((m) => `${n(m)}${E}`).join(' '));
    }

    // 贝斯
    if (lv === 'intro' || lv === 'outro') bass.push(`${n(ch.root)}4`);
    else bass.push(Array.from({ length: 8 }, () => `${n(ch.root)}${E}`).join(' '));

    // 鼓组
    const kickPat =
      lv === 'drop' ? `${n(KICK)}1 ${n(KICK)}1 ${n(KICK)}1 ${n(KICK)}1`
      : lv === 'groove' || lv === 'push' ? `${n(KICK)}1 z1 ${n(KICK)}1 z1`
      : 'z4';
    kick.push(kickPat);
    const snarePat =
      lv === 'push' || lv === 'drop' ? `z1 ${n(SNARE)}1 z1 ${n(SNARE)}1`
      : lv === 'rise' ? Array.from({ length: 8 }, () => `${n(SNARE)}${E}`).join(' ')
      : 'z4';
    snare.push(snarePat);
    hat.push(lv === 'intro' || lv === 'outro' || lv === 'rise' ? 'z4' : Array.from({ length: 8 }, () => `${n(HAT)}${E}`).join(' '));
    // 第二高潮那一拍加镲片；静默和第二高潮的标记挂在标记声部上（静默由渲染端落实）
    const inBar = (k: number) => k >= b * BEATS && k < (b + 1) * BEATS;
    const crashItems = b === dropBar ? [{ o: 0, token: `${n(CRASH)}1`, beats: 1 }] : [];
    const markItems: { o: number; token: string; beats: number }[] = b === dropBar ? [{ o: 0, token: '!hit!', beats: 0 }] : b === dropBar - 1 ? [{ o: 0, token: '!rise(!', beats: 0 }] : [];
    if (k2 !== null) {
      if (inBar(k2)) {
        crashItems.push({ o: k2 - b * BEATS, token: `${n(CRASH)}1`, beats: 1 });
        markItems.push({ o: k2 - b * BEATS, token: '!mark:hit2!', beats: 0 });
      }
      if (inBar(k2 - stopBeats)) markItems.push({ o: k2 - stopBeats - b * BEATS, token: `!stop:${stopBeats}!`, beats: 0 });
    }
    crash.push(crashItems.length ? barAt(crashItems) : 'z4');
    marks.push(markItems.length ? barAt(markItems) : 'z4');
  }

  const line = (bars: string[]) => bars.join(' | ') + ' |';
  const abc = [
    'X:1',
    `T:${o.title ?? 'Structured Score'}`,
    'M:4/4',
    `Q:1/4=${bpm}`,
    'K:C',
    'V:M role=accomp inst=marks gain=0',
    line(marks),
    'V:P role=melody inst=piano gain=0.9',
    line(piano),
    'V:B role=bass inst=synbass gain=1.25',
    line(bass),
    'V:S role=pad inst=warmpad gain=0.8',
    line(pad),
    'V:K role=drums inst=drums gain=1.0',
    line(kick),
    'V:N role=drums inst=drums gain=0.55',
    line(snare),
    'V:H role=drums inst=drums gain=0.22',
    line(hat),
    'V:C role=drums inst=drums gain=0.45',
    line(crash),
    '',
  ].join('\n');

  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  return {
    abc, bpm, bars, dropBar, dropAtSec: r3(dropBar * barSec),
    ...(k2 !== null ? { climax2AtSec: r3(k2 * beatSec), stopAtSec: r3((k2 - stopBeats) * beatSec) } : {}),
  };
}
