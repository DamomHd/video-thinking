/**
 * 物理建模音效合成器 (Physical Modeling SFX Synthesizer)
 * 没有 Epidemic 会员凭据时的离线自给路径：按采购单 (PaletteSpec) 的层与目标时长合成素材，
 * 48kHz 16-bit 立体声。槽名参与种子，所以同一层的不同槽不会听起来一模一样；
 * 同一个槽每次合成完全一致（确定性）。
 */

import fs from 'node:fs';
import path from 'node:path';
import { PaletteSpec, AudioLayer, SfxLayer } from '../../src/shared/types.js';
import { RATE, N, osc, biquad, plateReverb, encodeWav, rng } from './dsp.js';
import { synthLayered, layeredRoleOf } from './layered.js';

type Stereo = { L: Float32Array; R: Float32Array };

function writeWav(filePath: string, t: Stereo): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, encodeWav(t));
}

/** 槽名 → 稳定种子 */
function seedOf(slot: string): number {
  let h = 2166136261;
  for (let i = 0; i < slot.length; i++) {
    h ^= slot.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 100000;
}

/* ──────────────────────────── 各层合成配方 ──────────────────────────── */

/** BG：缓慢起伏的空间 Pad（三音和弦 + 微失谐合唱 + 板混） */
function synthPad(sec: number, root: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  const tones = [root, root * 1.26, root * 1.498];
  tones.forEach((freq, idx) => {
    const o1 = osc('sine', freq, sec);
    const o2 = osc('tri', freq * 1.002, sec);
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const env = Math.sin((t / sec) * Math.PI);
      const s = (o1[i] * 0.6 + o2[i] * 0.4) * env * 0.25;
      L[i] += s * (idx % 2 === 0 ? 0.9 : 0.5);
      R[i] += s * (idx % 2 === 1 ? 0.9 : 0.5);
    }
  });
  return plateReverb(L, R, 0.45);
}

/** TEX：水晶微光钟鸣（四音叠加，衰减各不同） */
function synthChime(sec: number, root: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  [1, 1.26, 1.498, 2].forEach((mult, idx) => {
    const o = osc('sine', root * mult, sec);
    const decay = 2.5 + idx * 0.5;
    for (let i = 0; i < n; i++) {
      const t = i / RATE;
      const s = o[i] * Math.exp(-decay * t) * 0.2;
      L[i] += s * (idx % 2 === 0 ? 0.8 : 0.4);
      R[i] += s * (idx % 2 === 1 ? 0.8 : 0.4);
    }
  });
  return plateReverb(L, R, 0.35);
}

/** UI：机械扣合瞬态（起音 < 25ms，短尾） */
function synthClick(sec: number, root: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const o = osc('tri', root, sec, { bend: (t) => Math.max(0.2, 1.0 - t * 6.0) });
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    L[i] = o[i] * Math.exp(-28 * t) * 0.7;
  }
  const f = biquad(L, 'lp', root * 2.5);
  return { L: f, R: f.slice() };
}

/** RISER：指数扫频上升，能量后段更响（rise 高） */
function synthRiser(sec: number, root: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const o = osc('saw', root, sec, { bend: (t) => Math.pow(2, (t / sec) * 3.5) });
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    L[i] = o[i] * Math.pow(t / sec, 1.8) * 0.4;
  }
  const f = biquad(L, 'lp', (p) => 200 + p * 4000);
  return plateReverb(f, f.slice(), 0.3);
}

/** WHOOSH：带通噪声掠过（中段最响，两头收） */
function synthWhoosh(sec: number, seed: number): Stereo {
  const n = N(sec);
  const rand = rng(seed + 7);
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = rand() * 2 - 1;
  // 带通：高通扫上去再低通扫下来，形成「掠过」的感觉
  const hp = biquad(noise, 'hp', (p) => 180 + p * 900);
  const bp = biquad(hp, 'lp', (p) => 6000 - p * 3500);
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const env = Math.sin((t / sec) * Math.PI) ** 1.6;
    const s = bp[i] * env * 0.5;
    // 轻微左右位移，强化掠过
    const pan = t / sec;
    L[i] = s * (1 - pan * 0.5);
    R[i] = s * (0.5 + pan * 0.5);
  }
  return plateReverb(L, R, 0.2);
}

/** IMPACT：温暖低音冲击（起音瞬时，低频俯冲 + 中频点） */
function synthBoom(sec: number, root: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const sub = osc('sine', root, sec, { bend: (t) => Math.max(0.65, Math.exp(-4 * t)) });
  const mid = osc('sine', root * 2, sec);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    L[i] = (sub[i] * 0.7 * Math.exp(-1.4 * t) + mid[i] * 0.3 * Math.exp(-3.2 * t)) * 0.75;
  }
  return plateReverb(L, L.slice(), 0.25);
}

/**
 * 有音高的轻音（马林巴 / 拨弦式）：基频 + 第 4、第 10 泛音（马林巴木条的特征泛音）+ 极短的槌击噪声。
 * **精确调在 A4 = 440Hz、不做随机错开** —— 序列音效靠 pitchSemis 变调成调内音阶，基准偏了就跑调。
 */
export const PLUCK_ROOT_HZ = 440;
function synthPluck(sec: number, seed: number): Stereo {
  const n = N(sec);
  const L = new Float32Array(n);
  const f0 = PLUCK_ROOT_HZ;
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const attack = Math.min(1, t / 0.002);
    const body =
      Math.sin(2 * Math.PI * f0 * t) * Math.exp(-9 * t) +
      Math.sin(2 * Math.PI * f0 * 4 * t) * 0.28 * Math.exp(-26 * t) +
      Math.sin(2 * Math.PI * f0 * 10 * t) * 0.06 * Math.exp(-60 * t);
    const mallet = (r() * 2 - 1) * Math.exp(-900 * t) * 0.25;
    L[i] = (body * 0.55 + mallet) * attack;
  }
  const f = biquad(L, 'lp', 6000);
  return plateReverb(f, f.slice(), 0.18);
}

/** 标签里写了这些词就用有音高的轻音（层不限：UI / TEX 都可以） */
const PITCHED = /\b(pluck|marimba|mallet|kalimba|xylophone|bell)\b/i;

/* ──────────────────────────── 对外接口 ──────────────────────────── */

const LAYER_ROOT: Record<SfxLayer, number> = {
  BG: 220, TEX: 1046.5, UI: 480, RISER: 80, WHOOSH: 0, IMPACT: 65,
};

/** 按采购单合成一个槽的素材，返回相对 public/ 的路径 */
export function synthForSpec(spec: PaletteSpec, publicRelFile: string): string {
  const seed = seedOf(spec.slot);
  // 目标时长取区间中点；不同槽在 ±8% 内错开，避免同层素材时长完全一样
  const mid = (spec.dur[0] + spec.dur[1]) / 2;
  const sec = Math.max(0.08, mid * (0.92 + ((seed % 17) / 17) * 0.16));
  // 基频按槽名在 ±12% 内错开
  const root = LAYER_ROOT[spec.layer] * (0.88 + ((seed % 23) / 23) * 0.24);

  let pcm: Stereo;
  // 分层音色优先：tags 写了 layered + 角色词（card-land / count-tick / reveal-swell …）
  const role = layeredRoleOf(spec.tags);
  if (role) {
    writeWav(path.join(process.cwd(), 'public', publicRelFile), synthLayered(role, seed, spec.tags));
    return publicRelFile;
  }
  if (PITCHED.test(spec.tags)) {
    pcm = synthPluck(Math.min(Math.max(0.35, mid), 0.9), seed);
    writeWav(path.join(process.cwd(), 'public', publicRelFile), pcm);
    return publicRelFile;
  }
  switch (spec.layer) {
    case 'BG': pcm = synthPad(sec, root); break;
    case 'TEX': pcm = synthChime(sec, root); break;
    case 'UI': pcm = synthClick(Math.min(sec, 0.4), root); break;
    case 'RISER': pcm = synthRiser(sec, root); break;
    case 'WHOOSH': pcm = synthWhoosh(sec, seed); break;
    case 'IMPACT': pcm = synthBoom(sec, root); break;
    default: pcm = synthClick(0.2, 480);
  }

  writeWav(path.join(process.cwd(), 'public', publicRelFile), pcm);
  return publicRelFile;
}

/**
 * 按一张采购单批量合成。
 * 这是 LocalSynthProvider 的实现底座，任何新片 `vw init` 之后都能离线自给。
 */
export function synthPalette(
  palette: Record<string, PaletteSpec>,
  targetDirRel = 'sfx-lib/epidemic',
  options: { overwrite?: boolean } = {}
): string[] {
  const out: string[] = [];
  for (const spec of Object.values(palette)) {
    const variants = Math.max(1, spec.variants);
    for (let i = 0; i < variants; i++) {
      const rel = variants > 1
        ? `${targetDirRel}/${spec.slot}-${i + 1}.wav`
        : `${targetDirRel}/${spec.slot}.wav`;
      const abs = path.join(process.cwd(), 'public', rel);
      if (!options.overwrite && fs.existsSync(abs)) {
        out.push(rel);
        continue;
      }
      // 变体之间用槽名 + 序号错开
      synthForSpec({ ...spec, slot: i === 0 ? spec.slot : `${spec.slot}#${i}` }, rel);
      out.push(rel);
    }
  }
  console.log(`[synth-sfx] 合成 ${out.length} 条素材 → public/${targetDirRel}`);
  return out;
}

/** 兼容入口：Us 片最早那 5 条手写配方现在由 synthPalette 统一产出 */
export function synthAllSfx(targetDir: string): void {
  const rel = path.relative(path.join(process.cwd(), 'public'), targetDir) || 'sfx-lib/epidemic';
  const palette: Record<string, PaletteSpec> = {
    usAtmosphere: { slot: 'usAtmosphere', layer: 'BG', cat: 'ambient', tags: 'space, warm, pad', dur: [7, 9], variants: 1, align: 'onset', gain: 0.6 },
    usGalaxyChime: { slot: 'usGalaxyChime', layer: 'TEX', cat: 'chime', tags: 'crystal, chime', dur: [2, 2.4], variants: 1, align: 'onset', gain: 0.8 },
    usLockClick: { slot: 'usLockClick', layer: 'UI', cat: 'ui', tags: 'lock, click', dur: [0.2, 0.3], variants: 1, align: 'onset', gain: 0.7 },
    usRiserSweep: { slot: 'usRiserSweep', layer: 'RISER', cat: 'riser', tags: 'riser, sweep', dur: [2.4, 2.6], variants: 1, align: 'peak', gain: 0.9 },
    usLogoHit: { slot: 'usLogoHit', layer: 'IMPACT', cat: 'impact', tags: 'impact, boom', dur: [3, 3.4], variants: 1, align: 'onset', gain: 1.1 },
  };
  synthPalette(palette, rel, { overwrite: true });
}

if (process.argv[1] && process.argv[1].endsWith('synth-sfx.ts')) {
  synthAllSfx(path.join(process.cwd(), 'public', 'sfx-lib', 'epidemic'));
}
