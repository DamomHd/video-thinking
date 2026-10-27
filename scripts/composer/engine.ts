import fs from 'node:fs';
import path from 'node:path';
import { RATE, N, osc, biquad, plateReverb, synthesizeDrum, encodeWav } from './dsp.js';
import { parseAbc, midiToFreq, ParsedAbcScore, applyStops } from './abc.js';
import { generateStructuredScoreAbc } from './structure.js';
import { getFilm } from '../../src/films.js';
import { renderSampled, Orchestra } from './sampled.js';

export interface RenderScoreOptions {
  durationSec?: number;
  gain?: number;
}

/**
 * 将 ABC 乐谱渲染为立体声 Float32Array PCM 数据
 */
export function renderScoreToPcm(abcText: string, options: RenderScoreOptions = {}): {
  L: Float32Array;
  R: Float32Array;
  durationSec: number;
  /** 乐谱里显式写下的标记位置（秒）—— 自己写的曲子，高潮位置是已知的，不用去猜 */
  cueSecs: { type: string; sec: number }[];
} {
  const score = parseAbc(abcText);
  const secPerBeat = 60 / score.bpm;
  const scoreDurationSec = score.totalBeats * secPerBeat;
  const targetDurationSec = options.durationSec ?? scoreDurationSec;

  const totalSamples = N(targetDurationSec);
  const busL = new Float32Array(totalSamples);
  const busR = new Float32Array(totalSamples);

  // 1. 渲染音符事件
  // 先落实 !stop:N! 静默（窗口里的音符去掉、延续进来的截断）
  for (const ev of applyStops(score)) {
    const startSec = ev.beat * secPerBeat;
    if (startSec >= targetDurationSec) continue;

    const durSec = ev.durBeats * secPerBeat;
    const freq = midiToFreq(ev.midi);
    const startSample = N(startSec);
    const voice = score.voices[ev.voice] ?? { role: 'melody', inst: 'piano', gain: 1.0 };

    // 音色渲染：区分钢琴、Pad垫音、低音
    let noteWave: Float32Array;
    if (voice.gain <= 0) continue; // 只占时值的标记声部
    if (voice.role === 'drums') {
      // 鼓声部：按 GM 音高区分 —— 36 底鼓、38 军鼓、41–44 踩镲、45+ 镲片（谱里用 C,, D,, F,, A,,）
      const type = ev.midi <= 36 ? 'kick' : ev.midi <= 40 ? 'snare' : ev.midi <= 44 ? 'hat' : 'crash';
      const len = type === 'crash' ? 2.2 : type === 'kick' ? 0.7 : type === 'snare' ? 0.45 : 0.12;
      const d = synthesizeDrum(type, len, ev.vel);
      noteWave = new Float32Array(d.L.length);
      for (let j = 0; j < noteWave.length; j++) noteWave[j] = (d.L[j] + d.R[j]) * 0.5 * voice.gain;
    } else if (voice.role === 'pad') {
      // 柔和温暖弦乐 Pad: 锯齿波低通滤波，慢起慢落
      const raw = osc('saw', freq, durSec + 0.8);
      noteWave = biquad(raw, 'lp', 1200, 0.8);
      // 淡入淡出包络
      for (let j = 0; j < noteWave.length; j++) {
        const u = j / noteWave.length;
        const env = Math.sin(u * Math.PI);
        noteWave[j] *= env * ev.vel * 0.35 * voice.gain;
      }
    } else if (voice.role === 'bass') {
      // 科技感饱满低音: 正弦 + 微量三角波
      const raw = osc('tri', freq, durSec);
      noteWave = biquad(raw, 'lp', 350, 1.2);
      for (let j = 0; j < noteWave.length; j++) {
        const t = j / RATE;
        const env = Math.exp(-t * 2.2);
        noteWave[j] *= env * ev.vel * 0.5 * voice.gain;
      }
    } else {
      // 钢琴/电钢琴: 正弦泛音衰减
      const nSamples = N(durSec + 0.4);
      noteWave = new Float32Array(nSamples);
      for (let j = 0; j < nSamples; j++) {
        const t = j / RATE;
        const h1 = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 3.5);
        const h2 = Math.sin(2 * Math.PI * freq * 2 * t) * 0.3 * Math.exp(-t * 6.0);
        const h3 = Math.sin(2 * Math.PI * freq * 3 * t) * 0.1 * Math.exp(-t * 9.0);
        noteWave[j] = (h1 + h2 + h3) * ev.vel * 0.55 * voice.gain;
      }
    }

    // 叠加到总线（加适度立体声声相展开）
    const pan = ev.midi < 60 ? -0.15 : 0.15;
    const gainL = (1 - pan) * 0.5;
    const gainR = (1 + pan) * 0.5;

    for (let j = 0; j < noteWave.length; j++) {
      const idx = startSample + j;
      if (idx >= totalSamples) break;
      busL[idx] += noteWave[j] * gainL;
      busR[idx] += noteWave[j] * gainR;
    }
  }

  // 2. 渲染 Cue 事件（!hit! 重音冲击、!rise! 起势等）
  for (const cue of score.cues) {
    const startSec = cue.beat * secPerBeat;
    if (startSec >= targetDurationSec) continue;

    if (cue.type === 'hit') {
      const drum = synthesizeDrum('impact', 2.0, 0.8);
      const startSample = N(startSec);
      for (let j = 0; j < drum.L.length; j++) {
        const idx = startSample + j;
        if (idx >= totalSamples) break;
        busL[idx] += drum.L[j] * 0.6;
        busR[idx] += drum.R[j] * 0.6;
      }
    } else if (cue.type === 'rise') {
      const durSec = (cue.durBeats ?? 4) * secPerBeat;
      const riser = synthesizeDrum('riser', durSec, 0.6);
      const startSample = N(startSec);
      for (let j = 0; j < riser.L.length; j++) {
        const idx = startSample + j;
        if (idx >= totalSamples) break;
        busL[idx] += riser.L[j] * 0.45;
        busR[idx] += riser.R[j] * 0.45;
      }
    }
  }

  // 3. 通道混响
  const wet = plateReverb(busL, busR, 0.22);

  // 4. 软限幅防破音
  const masterGain = options.gain ?? 0.85;
  for (let i = 0; i < totalSamples; i++) {
    wet.L[i] = Math.tanh(wet.L[i] * masterGain);
    wet.R[i] = Math.tanh(wet.R[i] * masterGain);
  }

  return {
    L: wet.L,
    R: wet.R,
    durationSec: targetDurationSec,
    cueSecs: score.cues
      .map((c) => ({ type: c.type, sec: Math.round(c.beat * secPerBeat * 1000) / 1000 }))
      .filter((c) => c.sec < targetDurationSec)
      .sort((a, b) => a.sec - b.sec),
  };
}

/**
 * 专为正片（例如 LoomCare 或 Us）生成自适应高潮与拍点的 ABC 乐谱
 */
export function generateFilmScoreAbc(filmId = 'loomcare-demo', bpm = 105, totalSec = 200.55, dropSec = 12.6, climax2Sec?: number): string {
  // 注意 ABC 时值写法：本解析器要求时值跟在 `]` 之后（`[G,B,D]4`），
  // 写成 `[G,4B,4D4]` 会被当成「每个音各自的时值 + 整个和弦 1 拍」，
  // 导致三个声部的小节对不齐、!hit! 落在不同拍上。
  if (filmId === 'us-short') {
    // 短片：4 小节前奏 → 起势 → 第 5 小节头砸 hit（beat 16）→ 5 小节收尾，共 10 小节
    return `X:1
T:Us Short · Woven Together
M:4/4
Q:1/4=${bpm}
K:G
V:P role=melody inst=piano gain=1.0
!p! z4 | z4 | !mp! z2 [B,D]2 | !rise(! D1 G1 B1 d1 !rise)! |
!hit! !f! [G,B,DG]4 | [DGB]2 [CEG]2 | [B,DG]4 | z4 | [G,B,D]4 | z4 |
V:B role=bass inst=synbass gain=1.1
z4 | z4 | G,,4 | D,,2 D,,2 |
!hit! G,,4 | G,,2 C,,2 | G,,4 | z4 | G,,4 | z4 |
V:S role=pad inst=warmpad gain=0.85
[G,B,D]4 | [G,B,D]4 | [C,E,G,]4 | [D,F,A,]4 |
!hit! [G,B,D]4 | [D,F,A,]4 | [C,E,G,]4 | z4 | [G,B,D]4 | z4 |
`;
  }

  if (filmId === 'us') {
    // 正片：10 小节铺垫 → 第 11 小节头砸 hit（beat 40 → 108bpm 下 22.2s，对应 K.logoDrop）
    return `X:1
T:Us Romantic Galaxy Theme
M:4/4
Q:1/4=${bpm}
K:G
V:P role=melody inst=piano gain=1.1
!p! z4 | [B,DG]4 | [CEG]4 | [DFA]4 | !mp! [EGB]4 | [DFA]4 | [CEG]4 | [B,DG]4 |
!rise(! z2 G2 | A2 B2 !rise)! |
!hit! !f! [G,B,DG]4 | [CEG]4 | [DGB]4 | [G,B,D]4 |
V:B role=bass inst=synbass gain=1.15
z4 | G,,4 | C,,4 | E,,4 | C,,4 | G,,4 | C,,4 | E,,4 |
D,,2 D,,2 | D,,4 |
!hit! G,,4 | C,,4 | G,,4 | G,,4 |
V:S role=pad inst=warmpad gain=0.9
[G,B,D]4 | [G,B,D]4 | [C,E,G,]4 | [E,G,B,]4 | [C,E,G,]4 | [G,B,D]4 | [C,E,G,]4 | [E,G,B,]4 |
[D,F,A,]4 | [D,F,A,]4 |
!hit! [G,B,D]4 | [C,E,G,]4 | [G,B,D]4 | [G,B,D]4 |
`;
  }

  if (filmId === 'loomcare-theme-legacy') {
    // 旧的默认谱（10 小节、约 23 秒、无鼓）只留作对照：它不看片长也不看高潮，所有别的片都不再落到这里
    return LEGACY_LOOMCARE_ABC(bpm);
  }

  // 其它片：按段长与高潮生成结构化谱（铺满全程、有律动、高潮落在小节头）
  return generateStructuredScoreAbc({ bpm, totalSec, dropSec, climax2Sec, title: `${filmId} · structured` }).abc;
}

const LEGACY_LOOMCARE_ABC = (bpm: number): string => {
  // 默认 LoomCare 乐谱：5 小节铺垫 → 第 6 小节头砸 hit（beat 20 → 105bpm 下 11.4s）
  return `X:1
T:LoomCare Original Motion Theme
M:4/4
Q:1/4=${bpm}
K:C
V:P role=melody inst=piano gain=1.1
!p! z4 | [EG]4 | [DF]4 | [CE]4 | !rise(! c2 d2 | e2 g2 !rise)! |
!hit! !f! [CEGc]4 | [DFA]4 | [EGB]4 | [Ace]4 |
V:B role=bass inst=synbass gain=1.2
z4 | C,,4 | A,,,4 | F,,,4 | G,,,2 G,,,2 | C,,4 |
!hit! C,,4 | G,,4 | A,,4 | F,,4 |
V:S role=pad inst=warmpad gain=0.9
[CEG]4 | [A,CE]4 | [F,A,C]4 | [G,B,D]4 | [A,CE]4 | [G,B,D]4 |
!hit! [CEGc]4 | [F,A,C]4 | [A,CE]4 | [CEG]4 |
`;
};

/** 乐谱里显式写下的标记（hit / rise …）换算成秒 */
export function cueSecsOf(abcText: string, totalSec: number): { type: string; sec: number }[] {
  const score = parseAbc(abcText);
  const spb = 60 / score.bpm;
  return score.cues
    .map((c) => ({ type: c.type, sec: Math.round(c.beat * spb * 1000) / 1000 }))
    .filter((c) => c.sec < totalSec)
    .sort((a, b) => a.sec - b.sec);
}

/**
 * 生成并落盘影片配乐 WAV 文件
 */
export interface ComposeOptions {
  outputPath?: string;
  /** 覆盖片长；不给就取幕表总长 */
  totalSec?: number;
  bpm?: number;
  dropSec?: number;
  /** 乐谱变体：'us-short' 等；不给就用 filmId */
  scoreId?: string;
  /** 用真实乐器采样演奏（scripts/composer/sampled.ts）：配器方案名；不给就用合成音色 */
  orchestra?: Orchestra;
  /** 第二高潮（cue.climax2，段内秒）：之前静默半小节、到它时再起 */
  climax2Sec?: number;
}

export async function generateFilmScoreWav(
  filmId = 'loomcare-demo',
  outputPathOrOptions?: string | ComposeOptions
): Promise<{
  outputPath: string;
  durationSec: number;
  bpm: number;
  /** 乐谱标记位置（秒）：hit 就是作者钉下的高潮 */
  cueSecs: { type: string; sec: number }[];
  /** 采样演奏时：署名行（CC0 致谢 + 需要的 CC BY 声明）和用到的乐器 */
  credits?: string[];
  instruments?: string[];
}> {
  const opts: ComposeOptions =
    typeof outputPathOrOptions === 'string'
      ? { outputPath: outputPathOrOptions }
      : outputPathOrOptions ?? {};

  const scoreId = opts.scoreId ?? filmId;
  let fallbackTotal = 30;
  try {
    const film = getFilm(filmId);
    const adapter = await film.getAdapter();
    fallbackTotal = adapter.timeline.totalSeconds;
  } catch {
    // 衍生片（短片）不在影片注册表里，用调用方给的 totalSec
  }

  const totalSec = opts.totalSec ?? fallbackTotal;
  const bpm = opts.bpm ?? (filmId === 'us' ? 108 : 105);
  const dropSec = opts.dropSec ?? (filmId === 'us' ? 22.3 : 12.6);

  const fileName = filmId === 'us' ? 'us-theme-main.wav' : 'loomcare-theme-main-adapt.wav';
  const targetPath =
    opts.outputPath || path.join(process.cwd(), 'public', 'music', fileName);

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  console.log(`[composer] 正在通过本地 ABC 作曲引擎渲染配乐...`);
  console.log(`  - 目标影片: ${filmId}`);
  console.log(`  - 速度: ${bpm} BPM, 时长: ${totalSec.toFixed(2)}s`);
  console.log(`  - 钉死高潮: ${dropSec.toFixed(2)}s`);

  const abc = generateFilmScoreAbc(scoreId, bpm, totalSec, dropSec, opts.climax2Sec);
  if (opts.orchestra) {
    console.log(`  - 音色: 真实乐器采样（配器方案 ${opts.orchestra}）`);
    const r = renderSampled(abc, targetPath, { orchestra: opts.orchestra, totalSec });
    // 标记位置从谱里算（和合成版同一份谱、同一个时间轴）
    const cueSecs = cueSecsOf(abc, totalSec);
    console.log(`[composer] ✓ 采样配乐已落盘: ${targetPath}（乐器 ${r.instruments.join('、')}）`);
    return { outputPath: targetPath, durationSec: totalSec, bpm, cueSecs, credits: r.credits, instruments: r.instruments };
  }
  const pcm = renderScoreToPcm(abc, { durationSec: totalSec });
  const wavBuf = encodeWav(pcm);

  fs.writeFileSync(targetPath, wavBuf);
  console.log(`[composer] ✓ 配乐 WAV 已成功生成落盘: ${targetPath} (大小: ${(wavBuf.length / 1024 / 1024).toFixed(2)} MB)`);

  const hit = pcm.cueSecs.find((c) => c.type === 'hit');
  if (hit) console.log(`  - 乐谱里的 hit 落在: ${hit.sec}s`);

  return {
    outputPath: targetPath,
    durationSec: totalSec,
    bpm,
    cueSecs: pcm.cueSecs,
  };
}
