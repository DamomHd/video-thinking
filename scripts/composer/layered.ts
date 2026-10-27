/**
 * 分层音色（本地合成）
 *
 * 单个正弦衰减听起来就是「嘟」。专业 UI / 宣传片音效的一声通常是四层叠出来的：
 *   瞬态 transient  起头 2–5ms 的「咔」，决定清脆度（带通噪声）
 *   主体 body       有音高的部分（FM 合成的木槌 / 玻璃感，加一个微失谐的副声部让它「宽」）
 *   尾巴 tail       同一个混响空间（ROOM），所有音效像在同一个房间里
 *   低频 sub        重拍才垫的一下「咚」
 * 有音高的都精确调在 A4 = 440Hz，序列靠离线变调（scripts/spot/pitch.ts）走调内音阶。
 *
 * 选择方式：采购单 tags 里写 `layered` + 角色词，例如 "layered, card-land"。
 */

import { RATE, N, osc, biquad, plateReverb, rng } from './dsp.js';

type Stereo = { L: Float32Array; R: Float32Array };

/** 全部分层音色共用的混响：同一个「房间」 */
const ROOM = 0.22;
const A4 = 440;

function band(x: Float32Array, lo: number, hi: number): Float32Array {
  return biquad(biquad(x, 'hp', lo), 'lp', hi);
}

function noise(sec: number, seed: number): Float32Array {
  const r = rng(seed);
  const n = N(sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/** FM 木槌：载波 f、调制比 ratio、调制深度随时间衰减（起头亮、尾巴圆） */
function fmMallet(f: number, sec: number, ratio = 3.5, index0 = 2.2, decay = 7): Float32Array {
  const n = N(sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const idx = index0 * Math.exp(-t * 18);
    const mod = Math.sin(2 * Math.PI * f * ratio * t) * idx;
    out[i] = Math.sin(2 * Math.PI * f * t + mod) * Math.exp(-t * decay) * Math.min(1, t / 0.0015);
  }
  return out;
}

function transient(sec: number, seed: number, lo = 2500, hi = 9000, decay = 900): Float32Array {
  const x = band(noise(sec, seed), lo, hi);
  for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-(i / RATE) * decay);
  return x;
}

function sub(f: number, sec: number, decay = 9): Float32Array {
  const n = N(sec);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const bend = 1 + 0.6 * Math.exp(-t * 40); // 起头音高略高、迅速落下：「咚」的打击感
    out[i] = Math.sin(2 * Math.PI * f * bend * t) * Math.exp(-t * decay) * Math.min(1, t / 0.003);
  }
  return out;
}

function mix(sec: number, layers: [Float32Array, number, number][]): Stereo {
  // [信号, 增益, 声像 -1..1]
  const n = N(sec);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (const [x, g, pan] of layers) {
    const gl = g * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = g * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < Math.min(n, x.length); i++) {
      L[i] += x[i] * gl;
      R[i] += x[i] * gr;
    }
  }
  return plateReverb(L, R, ROOM);
}

function reverse(s: Stereo): Stereo {
  return { L: s.L.slice().reverse(), R: s.R.slice().reverse() };
}

function normalize(s: Stereo, peak = 0.8): Stereo {
  let m = 0;
  for (let i = 0; i < s.L.length; i++) m = Math.max(m, Math.abs(s.L[i]), Math.abs(s.R[i]));
  const g = m > 0 ? peak / m : 1;
  for (let i = 0; i < s.L.length; i++) {
    s.L[i] *= g;
    s.R[i] *= g;
  }
  return s;
}

export type LayeredRole = 'card-land' | 'count-tick' | 'reveal-swell' | 'focus-air' | 'morph-slide' | 'stamp' | 'hero-hit' | 'pre-hit' | 'room-tone' | 'texture-bed';

export const LAYERED_ROLES: LayeredRole[] = ['card-land', 'count-tick', 'reveal-swell', 'focus-air', 'morph-slide', 'stamp', 'hero-hit', 'pre-hit', 'room-tone', 'texture-bed'];

/** 质感床的五种音色（采购单 tags 里写其中一个词；不写就是 warm） */
export type BedFlavor = 'warm' | 'air' | 'low' | 'glass' | 'tension';
export const BED_FLAVORS: BedFlavor[] = ['warm', 'air', 'low', 'glass', 'tension'];
export const BED_SEC = 20;
export function bedFlavorOf(tags: string): BedFlavor {
  return BED_FLAVORS.find((f) => new RegExp(`\\b${f}\\b`, 'i').test(tags)) ?? 'warm';
}

/** 首尾交叉淡化后截掉尾巴：循环播放听不出接缝 */
function seamless(L: Float32Array, R: Float32Array, xfSec: number): Stereo {
  const n = L.length;
  const xf = N(xfSec);
  const outL = L.slice(0, n - xf);
  const outR = R.slice(0, n - xf);
  for (let i = 0; i < xf; i++) {
    const g = Math.sin((Math.PI / 2) * (i / xf)); // 等功率
    const h = Math.cos((Math.PI / 2) * (i / xf));
    outL[i] = L[i] * g + L[n - xf + i] * h;
    outR[i] = R[i] * g + R[n - xf + i] * h;
  }
  return { L: outL, R: outR };
}

/** 几个按种子定相位的极慢正弦叠加：0..1 的缓慢起伏（不成周期） */
function drift(n: number, seed: number, freqs: number[]): Float32Array {
  const r = rng(seed);
  const ph = freqs.map(() => r() * Math.PI * 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    let v = 0;
    freqs.forEach((f, k) => (v += Math.sin(2 * Math.PI * f * t + ph[k])));
    out[i] = 0.5 + 0.5 * (v / freqs.length);
  }
  return out;
}

/** 一组正弦分音（频率、幅度、失谐音分），每个分音有自己的慢起伏 */
function partials(sec: number, seed: number, list: [number, number, number][]): Float32Array {
  const n = N(sec);
  const out = new Float32Array(n);
  list.forEach(([f, a, cents], k) => {
    const fr = f * Math.pow(2, cents / 1200);
    const am = drift(n, seed + 31 * k, [0.05 + 0.02 * k, 0.11, 0.023]);
    const r = rng(seed + k);
    const ph0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) out[i] += Math.sin(2 * Math.PI * fr * (i / RATE) + ph0) * a * (0.55 + 0.45 * am[i]);
  });
  return out;
}

/** 低通扫频（截止频率随 drift 慢慢动） */
function sweptLowpass(x: Float32Array, seed: number, lo: number, hi: number): Float32Array {
  const d = drift(x.length, seed, [0.04, 0.09]);
  const out = new Float32Array(x.length);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    const fc = lo + (hi - lo) * d[i];
    const a = 1 - Math.exp((-2 * Math.PI * fc) / RATE);
    y += a * (x[i] - y);
    out[i] = y;
  }
  return out;
}

/**
 * 质感床（texture bed）：铺在段落底下的长音色，比房间底噪多一点「颜色」，又不抢配乐。
 * 全部调在 A（根音 + 五度 + 八度，没有三度，大调小调都不冲突），序列靠离线变调走到配乐的调；
 * 没有瞬态、按种子慢慢变化、首尾无缝可循环（BED_SEC 秒）。
 *   warm    暖垫底：A2 / E3 / A3 微失谐 + 低通慢扫 + 一点气声
 *   air     空气感：高频带通噪声慢慢扫 + 极轻的 A5 泛音
 *   low     低频嗡声：A1 + 八度，慢起伏，低通 300Hz
 *   glass   玻璃泛音：A5 / E6 / A6 的高分音，像远处的风铃余韵
 *   tension 紧张：A2 和降 B2 的小二度拍音 + 暗噪声（风险、问题段落）
 */
function textureBed(flavor: BedFlavor, seed: number): Stereo {
  const sec = BED_SEC + 2.5; // 多 2.5 秒给首尾交叉淡化
  const n = N(sec);
  const side = (sd: number): Float32Array => {
    switch (flavor) {
      case 'warm': {
        const tone = partials(sec, sd, [[110, 0.5, -4], [110, 0.35, 5], [165, 0.32, -3], [220, 0.22, 4], [330, 0.08, -6]]);
        const breath = band(noise(sec, sd + 9), 300, 2500);
        for (let i = 0; i < n; i++) tone[i] += breath[i] * 0.05;
        return sweptLowpass(tone, sd + 3, 500, 1600);
      }
      case 'air': {
        const x = sweptLowpass(biquad(noise(sec, sd), 'hp', 1800), sd + 5, 3000, 9000);
        const sh = partials(sec, sd + 2, [[880, 0.04, 3], [1320, 0.02, -4]]);
        for (let i = 0; i < n; i++) x[i] = x[i] * 0.6 + sh[i];
        return x;
      }
      case 'low': {
        const tone = partials(sec, sd, [[55, 0.7, 0], [110, 0.25, 3], [82.5, 0.12, -2]]);
        return biquad(tone, 'lp', 300);
      }
      case 'glass': {
        return partials(sec, sd, [[880, 0.22, 4], [1318.5, 0.14, -5], [1760, 0.1, 7], [2637, 0.05, -3]]);
      }
      case 'tension': {
        const tone = partials(sec, sd, [[110, 0.45, 0], [116.54, 0.35, 0], [220, 0.12, 6]]);
        const dark = biquad(noise(sec, sd + 4), 'lp', 900);
        for (let i = 0; i < n; i++) tone[i] += dark[i] * 0.08;
        return sweptLowpass(tone, sd + 6, 400, 1100);
      }
    }
  };
  const wet = plateReverb(side(seed), side(seed + 101), flavor === 'low' ? 0.15 : 0.35);
  return seamless(wet.L, wet.R, 2.5);
}

/**
 * 房间底噪（room tone）：真正的「空气声」—— 没有音高（不会和配乐的调打架）、没有周期性的起伏、首尾无缝可循环。
 * 粉红噪声（Paul Kellet 近似）低通到 4kHz，叠一层极慢的按种子起伏（几秒一变、幅度 ±15%），
 * 最后 1.5 秒和开头交叉淡化：循环播放时听不出接缝。
 */
function roomTone(sec: number, seed: number): Stereo {
  const n = N(sec);
  const mk = (sd: number) => {
    const r = rng(sd);
    const out = new Float32Array(n);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
    }
    return biquad(biquad(out, 'lp', 4000), 'hp', 60);
  };
  const L = mk(seed);
  const R = mk(seed + 1);
  // 极慢的起伏：几个低频正弦叠加（相位按种子），不是固定周期
  const r = rng(seed + 7);
  const lfo = [0.07, 0.13, 0.031].map((f) => ({ f, ph: r() * Math.PI * 2 }));
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const m = 1 + 0.15 * lfo.reduce((a, o) => a + Math.sin(2 * Math.PI * o.f * t + o.ph), 0) / lfo.length;
    L[i] *= m;
    R[i] *= m;
  }
  // 无缝循环：尾巴 xf 秒和开头交叉淡化后截掉尾巴
  const xf = N(1.5);
  const outL = L.slice(0, n - xf);
  const outR = R.slice(0, n - xf);
  for (let i = 0; i < xf; i++) {
    const g = i / xf;
    outL[i] = L[i] * g + L[n - xf + i] * (1 - g);
    outR[i] = R[i] * g + R[n - xf + i] * (1 - g);
  }
  return { L: outL, R: outR };
}

export function synthLayered(role: LayeredRole, seed: number, tags = ''): Stereo {
  switch (role) {
    case 'texture-bed':
      return normalize(textureBed(bedFlavorOf(tags), seed), 0.5);
    case 'card-land': {
      // 卡片落定：清脆瞬态 + FM 木槌（主 + 微失谐副声部，左右分开显宽）+ 一点点低频托底
      const sec = 0.7;
      return normalize(
        mix(sec, [
          [transient(0.02, seed), 0.35, 0],
          [fmMallet(A4, sec), 0.55, -0.25],
          [fmMallet(A4 * Math.pow(2, 7 / 1200), sec, 3.5, 1.8, 8), 0.35, 0.25],
          [fmMallet(A4 * 2, sec, 2, 0.8, 14), 0.12, 0],
          [sub(110, 0.25, 22), 0.25, 0],
        ]),
        0.75
      );
    }
    case 'count-tick': {
      // 数字跳动：极短的机械咔哒 + 一个高频小谐振（像计数器的齿轮）
      const sec = 0.08;
      const ping = osc('sine', 2400, sec);
      for (let i = 0; i < ping.length; i++) ping[i] *= Math.exp(-(i / RATE) * 70);
      return normalize(mix(sec, [[transient(0.01, seed, 3500, 12000, 1400), 0.7, 0], [ping, 0.25, 0]]), 0.6);
    }
    case 'reveal-swell': {
      // 渐显：气声从暗到亮地扬起来，底下垫一个很轻的五度和声
      const sec = 0.9;
      const n = N(sec);
      const air = noise(sec, seed);
      const out = new Float32Array(n);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const cutoff = 400 + 5600 * u * u;
        const a = 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);
        lp += a * (air[i] - lp);
        out[i] = lp * Math.sin(Math.PI * Math.min(1, u * 1.15)) * 0.9;
      }
      const pad = osc('sine', A4, sec);
      const fifth = osc('sine', A4 * 1.5, sec);
      for (let i = 0; i < n; i++) {
        const env = Math.sin((Math.PI * i) / n) * 0.18;
        pad[i] *= env;
        fifth[i] *= env * 0.6;
      }
      return normalize(mix(sec, [[out, 0.6, -0.2], [pad, 0.5, 0.2], [fifth, 0.4, -0.1]]), 0.55);
    }
    case 'focus-air': {
      // 拉焦：短促的空气轻扫（带通噪声，中心频率上扬）
      const sec = 0.35;
      const x = band(noise(sec, seed), 1500, 7000);
      for (let i = 0; i < x.length; i++) {
        const u = i / x.length;
        x[i] *= Math.sin(Math.PI * u) * (0.6 + 0.4 * u);
      }
      return normalize(mix(sec, [[x, 1, 0.3]]), 0.45);
    }
    case 'morph-slide': {
      // 形变挪位：顺滑的滑动声 + 一个往上滑的柔音
      const sec = 0.6;
      const x = band(noise(sec, seed), 600, 4000);
      const n = x.length;
      const glide = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        ph += (2 * Math.PI * (A4 * (0.75 + 0.25 * u))) / RATE;
        glide[i] = Math.sin(ph) * Math.sin(Math.PI * u) * 0.25;
        x[i] *= Math.sin(Math.PI * u) * 0.7;
      }
      return normalize(mix(sec, [[x, 0.7, -0.3], [glide, 0.6, 0.3]]), 0.5);
    }
    case 'stamp': {
      // 盖章 / 确认：瞬态 + 木头闷响 + 低频
      const sec = 0.6;
      return normalize(
        mix(sec, [
          [transient(0.03, seed, 1200, 6000, 500), 0.5, 0],
          [fmMallet(196, sec, 1.4, 1.2, 14), 0.6, 0],
          [sub(70, 0.4, 12), 0.55, 0],
        ]),
        0.8
      );
    }
    case 'hero-hit': {
      // 全片重拍：低频冲击 + FM 钟声三和弦（A 小调主和弦）+ 长尾
      const sec = 2.4;
      return normalize(
        mix(sec, [
          [transient(0.04, seed, 800, 8000, 300), 0.4, 0],
          [sub(52, 1.2, 3.2), 0.9, 0],
          [fmMallet(A4 / 2, sec, 1.4, 2.5, 1.6), 0.45, -0.3],
          [fmMallet((A4 / 2) * Math.pow(2, 3 / 12), sec, 1.4, 2.2, 1.8), 0.32, 0.3],
          [fmMallet((A4 / 2) * 1.5, sec, 1.4, 2.0, 2.0), 0.28, 0],
        ]),
        0.9
      );
    }
    case 'room-tone':
      return normalize(roomTone(21.5, seed), 0.5);
    case 'pre-hit': {
      // 反向吸气：把一声钟响的尾巴倒过来 —— 越来越响，在重拍那一刻戛然而止
      const sec = 0.7;
      const bell = mix(sec, [[fmMallet(A4, sec, 2.5, 2.5, 3.5), 0.6, 0], [band(noise(sec, seed), 2000, 9000), 0.15, 0]]);
      return normalize(reverse(bell), 0.55);
    }
  }
}

/** 从采购单 tags 里认角色：tags 含 layered 且含某个角色词 */
export function layeredRoleOf(tags: string): LayeredRole | null {
  if (!/\blayered\b/i.test(tags)) return null;
  return LAYERED_ROLES.find((r) => new RegExp(`\\b${r}\\b`, 'i').test(tags)) ?? null;
}
