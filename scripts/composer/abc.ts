/**
 * ABC 乐谱解析与事件流派发 (ABC Score Parser)
 * 继承自 huashu-motion 的 ABC 语法规范
 */

export interface AbcVoice {
  id: string;
  inst: string;
  role: 'melody' | 'accomp' | 'bass' | 'pad' | 'drums';
  gain: number;
}

export interface AbcNoteEvent {
  voice: string;
  beat: number;      // 相对起点的拍数
  durBeats: number;  // 持续拍数
  midi: number;      // MIDI 音高 (60 = C4)
  vel: number;       // 力度 (0.0 ~ 1.0)
  accent?: boolean;
}

export interface AbcCueEvent {
  type: 'hit' | 'rise' | 'mark' | 'stop';
  name?: string;     // mark 名字
  beat: number;
  durBeats?: number;
}

export interface ParsedAbcScore {
  title: string;
  bpm: number;
  meter: [number, number];
  voices: Record<string, AbcVoice>;
  events: AbcNoteEvent[];
  cues: AbcCueEvent[];
  totalBeats: number;
}

const LETTER_TO_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  c: 12, d: 14, e: 16, f: 17, g: 19, a: 21, b: 23,
};

// MIDI 音高转赫兹频率
export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * 解析轻量 ABC 乐谱文本
 */
export function parseAbc(text: string): ParsedAbcScore {
  const lines = text.split(/\r?\n/);
  let title = 'Untitled';
  let bpm = 105;
  let meter: [number, number] = [4, 4];
  const voices: Record<string, AbcVoice> = {};
  const events: AbcNoteEvent[] = [];
  const cues: AbcCueEvent[] = [];

  let curVoice = '1';
  voices['1'] = { id: '1', inst: 'piano', role: 'melody', gain: 1.0 };
  let cursorBeats: Record<string, number> = { '1': 0 };

  for (const raw of lines) {
    const line = raw.replace(/%.*$/, '').trim();
    if (!line) continue;

    if (line.startsWith('T:')) {
      title = line.slice(2).trim();
      continue;
    }
    if (line.startsWith('Q:')) {
      // 速度可以带小数（结构化谱会为对齐高潮把速度微调到 85.18 这种值；只读整数会让 hit 漂掉 0.1s 以上）
      const qm = line.match(/(?:1\/4=)?(\d+(?:\.\d+)?)/);
      if (qm) bpm = Number(qm[1]);
      continue;
    }
    if (line.startsWith('M:')) {
      const mm = line.match(/(\d+)\/(\d+)/);
      if (mm) meter = [Number(mm[1]), Number(mm[2])];
      continue;
    }
    if (line.startsWith('V:')) {
      const parts = line.slice(2).trim().split(/\s+/);
      const vid = parts[0];
      const instPart = line.match(/inst=([\w-]+)/);
      const rolePart = line.match(/role=([\w-]+)/);
      const gainPart = line.match(/gain=([\d.]+)/);

      curVoice = vid;
      voices[vid] = {
        id: vid,
        inst: instPart ? instPart[1] : 'piano',
        role: (rolePart ? rolePart[1] : (instPart?.[1] === 'drums' ? 'drums' : 'accomp')) as any,
        gain: gainPart ? Number(gainPart[1]) : 1.0,
      };
      if (cursorBeats[vid] === undefined) cursorBeats[vid] = 0;
      continue;
    }

    // 解析当前行的音符与标记
    let i = 0;
    while (i < line.length) {
      const ch = line[i];

      // 跳过小节线和空格
      if (ch === '|' || ch === ' ' || ch === '\t') {
        i++;
        continue;
      }

      // 宏/标记解析: !mark:name!, !hit!, !rise(!
      if (ch === '!') {
        const nextBang = line.indexOf('!', i + 1);
        if (nextBang > i) {
          const tag = line.slice(i + 1, nextBang);
          const beat = cursorBeats[curVoice] ?? 0;
          if (tag.startsWith('mark:')) {
            cues.push({ type: 'mark', name: tag.slice(5), beat });
          } else if (tag === 'hit') {
            cues.push({ type: 'hit', beat });
          } else if (tag === 'rise(' || tag === 'rise') {
            cues.push({ type: 'rise', beat, durBeats: 4 });
          } else if (tag.startsWith('stop')) {
            // !stop:N! —— 从这里起全体静默 N 拍（缺省 2）：渲染端把这段里的音符去掉、把延续进来的音符截断
            const n = Number(tag.split(':')[1]);
            cues.push({ type: 'stop', beat, durBeats: Number.isFinite(n) && n > 0 ? n : 2 });
          }
          i = nextBang + 1;
          continue;
        }
      }

      // 休止符 z, x
      if (ch === 'z' || ch === 'x') {
        i++;
        let dur = 1.0;
        const durMatch = line.slice(i).match(/^(\d+(?:\/\d+)?|\/+)/);
        if (durMatch) {
          dur = parseFraction(durMatch[1]);
          i += durMatch[1].length;
        }
        cursorBeats[curVoice] = (cursorBeats[curVoice] ?? 0) + dur;
        continue;
      }

      // 和弦 [CEG]
      if (ch === '[') {
        const close = line.indexOf(']', i);
        if (close > i) {
          const chordStr = line.slice(i + 1, close);
          i = close + 1;
          let dur = 1.0;
          const durMatch = line.slice(i).match(/^(\d+(?:\/\d+)?|\/+)/);
          if (durMatch) {
            dur = parseFraction(durMatch[1]);
            i += durMatch[1].length;
          }

          const notes = parseChordNotes(chordStr);
          const beat = cursorBeats[curVoice] ?? 0;
          for (const midi of notes) {
            events.push({
              voice: curVoice,
              beat,
              durBeats: dur,
              midi,
              vel: 0.65,
            });
          }
          cursorBeats[curVoice] = beat + dur;
          continue;
        }
      }

      // 单个音符 A-G, a-g
      if (LETTER_TO_SEMITONE[ch] !== undefined) {
        let midi = 60 + LETTER_TO_SEMITONE[ch];
        i++;
        // 八度微调
        while (line[i] === "'") {
          midi += 12;
          i++;
        }
        while (line[i] === ',') {
          midi -= 12;
          i++;
        }
        // 时长
        let dur = 1.0;
        const durMatch = line.slice(i).match(/^(\d+(?:\/\d+)?|\/+)/);
        if (durMatch) {
          dur = parseFraction(durMatch[1]);
          i += durMatch[1].length;
        }

        const beat = cursorBeats[curVoice] ?? 0;
        events.push({
          voice: curVoice,
          beat,
          durBeats: dur,
          midi,
          vel: 0.72,
        });
        cursorBeats[curVoice] = beat + dur;
        continue;
      }

      i++;
    }
  }

  const maxBeat = Math.max(...Object.values(cursorBeats), 1);
  return {
    title,
    bpm,
    meter,
    voices,
    events,
    cues,
    totalBeats: maxBeat,
  };
}

function parseFraction(s: string): number {
  if (s === '/') return 0.5;
  if (s === '//') return 0.25;
  if (s.includes('/')) {
    const [num, den] = s.split('/');
    return (Number(num) || 1) / (Number(den) || 2);
  }
  return Number(s) || 1;
}

function parseChordNotes(s: string): number[] {
  const notes: number[] = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (LETTER_TO_SEMITONE[ch] !== undefined) {
      let midi = 60 + LETTER_TO_SEMITONE[ch];
      i++;
      while (s[i] === "'") {
        midi += 12;
        i++;
      }
      while (s[i] === ',') {
        midi -= 12;
        i++;
      }
      notes.push(midi);
      continue;
    }
    i++;
  }
  return notes;
}

/**
 * 把乐谱里的 !stop:N! 落到音符上（纯函数）：静默窗口 [stop, stop + N) 里起音的音符去掉，
 * 从窗口前延续进来的音符截断到窗口起点。合成和采样两种渲染都先过这一步，静默才是真的静默。
 */
export function applyStops(score: ParsedAbcScore): AbcNoteEvent[] {
  const wins = score.cues.filter((c) => c.type === 'stop').map((c) => [c.beat, c.beat + (c.durBeats ?? 2)] as const);
  if (!wins.length) return score.events;
  const out: AbcNoteEvent[] = [];
  for (const ev of score.events) {
    if (wins.some(([a, b]) => ev.beat >= a - 1e-9 && ev.beat < b - 1e-9)) continue;
    let dur = ev.durBeats;
    for (const [a] of wins) if (ev.beat < a && ev.beat + dur > a) dur = a - ev.beat;
    out.push(dur === ev.durBeats ? ev : { ...ev, durBeats: dur });
  }
  return out;
}
