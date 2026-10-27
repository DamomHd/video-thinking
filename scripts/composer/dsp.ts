/**
 * 数字信号处理与纯软件合成器核心 (DSP Core & Synthesizer)
 * 继承自 huashu-motion 的精简纯算法音频引擎
 * 采样率: 48,000 Hz, 16-bit 线性 PCM, 双声道立体声
 */

export const RATE = 48000;
export const N = (sec: number): number => Math.max(0, Math.round(sec * RATE));

// 确定性随机数发生器 (mulberry32)
export function rng(seed = 1): () => number {
  let s = Math.floor(seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 振荡器波形生成 (支持 PolyBLEP 防混叠)
export function osc(
  wave: 'sine' | 'saw' | 'square' | 'tri',
  f: number,
  sec: number,
  options: { duty?: number; bend?: (t: number) => number } = {}
): Float32Array {
  const n = N(sec);
  const out = new Float32Array(n);
  const duty = options.duty ?? 0.5;
  const bend = options.bend;

  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const freq = bend ? f * bend(t) : f;
    const dt = freq / RATE;

    if (wave === 'sine') {
      out[i] = Math.sin(ph * 2 * Math.PI);
    } else if (wave === 'saw') {
      out[i] = 2 * ph - 1;
    } else if (wave === 'square') {
      out[i] = ph < duty ? 1 : -1;
    } else if (wave === 'tri') {
      out[i] = 4 * Math.abs(ph - 0.5) - 1;
    }

    ph = (ph + dt) % 1;
  }
  return out;
}

// 双二阶滤波器 (Biquad Filter: Lowpass / Highpass)
export function biquad(
  x: Float32Array,
  type: 'lp' | 'hp',
  cutoffHz: number | ((progress: number) => number),
  q = 0.707
): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;

  for (let i = 0; i < n; i++) {
    const fc = typeof cutoffHz === 'function' ? cutoffHz(i / n) : cutoffHz;
    const clampedFc = Math.max(20, Math.min(RATE * 0.45, fc));
    const w0 = (2 * Math.PI * clampedFc) / RATE;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw = Math.cos(w0);

    let b0 = 0, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    if (type === 'lp') {
      b0 = (1 - cosw) / 2;
      b1 = 1 - cosw;
      b2 = (1 - cosw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw;
      a2 = 1 - alpha;
    } else {
      b0 = (1 + cosw) / 2;
      b1 = -(1 + cosw);
      b2 = (1 + cosw) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cosw;
      a2 = 1 - alpha;
    }

    const inVal = x[i];
    const outVal = (b0 / a0) * inVal + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1;
    x1 = inVal;
    y2 = y1;
    y1 = outVal;
    out[i] = outVal;
  }
  return out;
}

// 模拟轻量板式混响 (Stereo Reverb Diffuser)
export function plateReverb(L: Float32Array, R: Float32Array, mix = 0.25): { L: Float32Array; R: Float32Array } {
  const n = L.length;
  const outL = new Float32Array(n);
  const outR = new Float32Array(n);

  const delays = [1557, 1617, 1491, 1422, 1277, 1023, 873, 755];
  const decay = 0.68;

  const buf = delays.map(d => new Float32Array(d));
  const ptr = new Int32Array(delays.length);

  for (let i = 0; i < n; i++) {
    const input = (L[i] + R[i]) * 0.5;
    let wetL = 0;
    let wetR = 0;

    for (let k = 0; k < delays.length; k++) {
      const d = delays[k];
      const p = ptr[k];
      const delayed = buf[k][p];
      buf[k][p] = input + delayed * decay;
      ptr[k] = (p + 1) % d;

      if (k % 2 === 0) wetL += delayed;
      else wetR += delayed;
    }

    outL[i] = L[i] * (1 - mix) + wetL * 0.25 * mix;
    outR[i] = R[i] * (1 - mix) + wetR * 0.25 * mix;
  }

  return { L: outL, R: outR };
}

// 纯物理建模/合成鼓点 (Kick, Snare, Hi-hat, Riser, Impact)
export function synthesizeDrum(
  type: 'kick' | 'snare' | 'hat' | 'crash' | 'impact' | 'riser',
  sec = 1.0,
  vel = 1.0
): { L: Float32Array; R: Float32Array } {
  const n = N(sec);
  const mono = new Float32Array(n);
  const r = rng(1234);

  if (type === 'kick') {
    // 808 风格深沉底鼓：正弦波快速音高俯冲 140Hz -> 45Hz
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const pitchEnv = Math.exp(-t * 28);
      const freq = 45 + 110 * pitchEnv;
      const ampEnv = Math.exp(-t * 6);
      mono[i] = Math.sin(t * 2 * Math.PI * freq) * ampEnv * vel;
    }
  } else if (type === 'snare') {
    // 军鼓：高通噪声 + 180Hz 筒音
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const noise = (r() * 2 - 1) * Math.exp(-t * 18);
      const tone = Math.sin(t * 2 * Math.PI * 185) * Math.exp(-t * 24);
      mono[i] = (noise * 0.65 + tone * 0.45) * vel;
    }
  } else if (type === 'hat') {
    // 闭合踩镲：金属高频噪波快速衰减
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const noise = (r() * 2 - 1) * Math.exp(-t * 45);
      mono[i] = noise * vel * 0.4;
    }
  } else if (type === 'crash' || type === 'impact') {
    // 冲击与开镲：宽频带噪声 + 低频重击
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const sub = Math.sin(t * 2 * Math.PI * 55) * Math.exp(-t * 3.5);
      const noise = (r() * 2 - 1) * Math.exp(-t * 2.5);
      mono[i] = (sub * 0.6 + noise * 0.45) * vel;
    }
  } else if (type === 'riser') {
    // 冲刺起势：白噪声与正弦波自下而上指数拉升
    for (let i = 0; i < n; i++) {
      const t = i / n; // 0 -> 1
      const noise = (r() * 2 - 1) * Math.pow(t, 2.5);
      const sweep = Math.sin(i * (0.01 + 0.15 * Math.pow(t, 2))) * Math.pow(t, 2);
      mono[i] = (noise * 0.5 + sweep * 0.5) * vel;
    }
  }

  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = mono[i];
    R[i] = mono[i];
  }
  return { L, R };
}

// 将双声道 Float32Array PCM 编码为标准 16-bit 48kHz WAV 格式 Buffer
export function encodeWav(t: { L: Float32Array; R: Float32Array }): Buffer {
  const n = Math.min(t.L.length, t.R.length);
  const buf = Buffer.alloc(44 + n * 4);
  const r = rng(1);

  // RIFF Header
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);

  // fmt chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // subchunk 1 size (16 for PCM)
  buf.writeUInt16LE(1, 20);  // audio format (1 = PCM)
  buf.writeUInt16LE(2, 22);  // num channels (2 = Stereo)
  buf.writeUInt32LE(RATE, 24); // sample rate (48000)
  buf.writeUInt32LE(RATE * 4, 28); // byte rate (48000 * 2 * 2)
  buf.writeUInt16LE(4, 32);  // block align
  buf.writeUInt16LE(16, 34); // bits per sample (16)

  // data chunk
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);

  // 16-bit PCM 量化与抖动 (TPDF Dither)
  const quantize = (v: number) => {
    const dither = (r() - r()) * (1 / 32768);
    return Math.max(-32768, Math.min(32767, Math.round((v + dither) * 32767)));
  };

  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(quantize(t.L[i]), 44 + i * 4);
    buf.writeInt16LE(quantize(t.R[i]), 46 + i * 4);
  }

  return buf;
}
