import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { RATE, N, encodeWav } from '../../scripts/composer/dsp.js';
import {
  analyzeMusicFile,
  analyzeMusicGrid,
  sampleDbAt,
  SILENCE_DB,
} from '../../scripts/sync/analyze.js';
import { EnvelopeProbe } from '../../scripts/audio/envelope.js';
import { extractFeatures } from '../../scripts/audio/features.js';

/** 合成一条 click 轨：bpm 固定，每 4 拍一个重音（低频），用来检验分析器的确定性 */
function synthClickTrack(bpm: number, bars: number, offsetSec = 0): { L: Float32Array; R: Float32Array } {
  const beatSec = 60 / bpm;
  const totalSec = offsetSec + bars * 4 * beatSec + 0.5;
  const n = N(totalSec);
  const L = new Float32Array(n);

  for (let b = 0; b < bars * 4; b++) {
    const t0 = offsetSec + b * beatSec;
    const start = Math.round(t0 * RATE);
    const isDownbeat = b % 4 === 0;
    const freq = isDownbeat ? 70 : 1400;
    const amp = isDownbeat ? 0.9 : 0.35;
    const decay = isDownbeat ? 0.11 : 0.035;
    const len = Math.round(decay * 4 * RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / RATE;
      L[start + i] += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay);
    }
  }
  // 后半段整体加强，制造一个能量「到顶」的 drop
  const dropStart = Math.round((offsetSec + bars * 2 * beatSec) * RATE);
  for (let i = dropStart; i < n; i++) L[i] *= 1.9;

  return { L, R: L.slice() };
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-analyze-'));
const write = (name: string, pcm: { L: Float32Array; R: Float32Array }) => {
  const f = path.join(tmpDir, name);
  fs.writeFileSync(f, encodeWav(pcm));
  return f;
};

describe('配乐分析器 (sync/analyze · 真实解码)', () => {
  it('在合成 click 轨上测出的拍周期误差应小于 1ms', () => {
    const bpm = 120;
    const file = write('click120.wav', synthClickTrack(bpm, 16));
    const grid = analyzeMusicFile(file, { nominalBpm: bpm });

    assert.equal(grid.source, 'measured', '必须走真实解码路径');
    const expected = 60 / bpm;
    assert.ok(
      Math.abs(grid.beatSec - expected) < 0.001,
      `拍长应为 ${expected}s，实际 ${grid.beatSec}s`
    );
    assert.ok(grid.beats.length > 50, `拍数过少: ${grid.beats.length}`);
  });

  it('网格末端漂移应小于 1 帧（30fps）', () => {
    const bpm = 128;
    const file = write('click128.wav', synthClickTrack(bpm, 16));
    const grid = analyzeMusicFile(file, { nominalBpm: bpm });
    const last = grid.beats[grid.beats.length - 1];
    const ideal = grid.beats[0] + (grid.beats.length - 1) * (60 / bpm);
    assert.ok(Math.abs(last - ideal) < 1 / 30, `末端漂移 ${(last - ideal).toFixed(4)}s`);
  });

  it('小节头必须落在重音上（相位投票对得上）', () => {
    const bpm = 120;
    const offset = 0.25;
    const file = write('click-phase.wav', synthClickTrack(bpm, 16, offset));
    const grid = analyzeMusicFile(file, { nominalBpm: bpm });
    const barSec = (60 / bpm) * 4;
    // 每个小节头到真实重音时刻的距离应小于半拍
    for (const db of grid.downbeats.slice(1, 8)) {
      const k = Math.round((db - offset) / barSec);
      const truth = offset + k * barSec;
      assert.ok(
        Math.abs(db - truth) < (60 / bpm) / 2,
        `小节头 ${db}s 偏离真实重音 ${truth}s 超过半拍`
      );
    }
  });

  it('drop 应落在能量到顶的后半段，且被识别为段落起点', () => {
    const bpm = 120;
    const bars = 16;
    const file = write('click-drop.wav', synthClickTrack(bpm, bars));
    const grid = analyzeMusicFile(file, { nominalBpm: bpm });
    const half = (bars * 4 * (60 / bpm)) / 2;
    assert.ok(grid.dropSec >= half - (60 / bpm) * 2, `drop ${grid.dropSec}s 应在后半段（${half}s 之后）`);
    assert.ok(grid.sections && grid.sections.length >= 2, '应识别出至少两个段落');
  });

  it('同一个文件分析两次必须逐字段一致（确定性）', () => {
    const file = write('click-det.wav', synthClickTrack(110, 12));
    const a = analyzeMusicFile(file, { nominalBpm: 110 });
    const b = analyzeMusicFile(file, { nominalBpm: 110 });
    assert.deepEqual(a, b);
  });

  it('文件缺失时必须如实返回 synthetic，绝不冒充测量值', () => {
    const grid = analyzeMusicFile(path.join(tmpDir, '不存在.wav'), { totalSecHint: 20 });
    assert.equal(grid.source, 'synthetic');
    assert.equal(analyzeMusicGrid(20).source, 'synthetic');
  });
});

describe('包络测量与声学画像 (audio/envelope · audio/features)', () => {
  it('包络测量必须量出真实峰位：峰在 1s 的脉冲', () => {
    const n = N(2.0);
    const L = new Float32Array(n);
    const peakAt = Math.round(1.0 * RATE);
    for (let i = 0; i < Math.round(0.05 * RATE); i++) {
      L[peakAt + i] = Math.exp(-i / (0.01 * RATE));
    }
    const file = write('impulse.wav', { L, R: L.slice() });

    const env = EnvelopeProbe.measureFile(file);
    assert.equal(env.source, 'measured');
    assert.ok(Math.abs(env.peakAtSec - 1.0) < 0.01, `峰位应约 1.0s，实际 ${env.peakAtSec}`);
    assert.ok(Math.abs(env.onsetSec - 1.0) < 0.02, `起点应约 1.0s，实际 ${env.onsetSec}`);
    assert.ok(Math.abs(env.durSec - 2.0) < 0.02);
    assert.ok(env.peakDb > -1 && env.peakDb <= 0, `峰值 dB 异常: ${env.peakDb}`);
  });

  it('声学画像能区分「起音极快」和「渐强起势」', () => {
    const n = N(2.0);
    // A: 冲击型，开头就是峰
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin(2 * Math.PI * 180 * (i / RATE)) * Math.exp(-i / (0.05 * RATE));
    // B: 起势型，能量线性爬升到末尾
    const b = new Float32Array(n);
    for (let i = 0; i < n; i++) b[i] = Math.sin(2 * Math.PI * 900 * (i / RATE)) * (i / n);

    const fa = extractFeatures(write('hit.wav', { L: a, R: a.slice() }));
    const fb = extractFeatures(write('riser.wav', { L: b, R: b.slice() }));
    assert.ok(fa && fb);
    assert.ok(fa.attackMs < 20, `冲击型起音应极短，实际 ${fa.attackMs}ms`);
    assert.ok(fb.rise > fa.rise, `起势型的 rise(${fb.rise}) 应大于冲击型(${fa.rise})`);
    assert.ok(fb.bright > fa.bright, `900Hz 的亮度应高于 180Hz`);
  });
});

/**
 * 回归：电平取样越界必须补静音，不能补 0。
 *
 * 0 dB 是满刻度 —— 是最响，不是最轻。
 * 真实故障：一首 113.455s 的曲子，最后一个小节头落在 113.4494s，
 * 刚好越过 dB 数组末尾，于是那一格被当成满刻度，
 * 成了全曲能量最高点 —— drop 被判到最后一个小节，
 * 段落划分、第二高潮、改编配方的偏好区全部跟着错。
 */
describe('电平取样的越界行为 (sync/analyze)', () => {
  const hop = 0.01;
  const db = [-30, -28, -26]; // 一段普通电平，覆盖 0 ~ 0.02s

  it('界内按原值取', () => {
    assert.equal(sampleDbAt(db, 0, hop), -30);
    assert.equal(sampleDbAt(db, 0.02, hop), -26);
  });

  it('越界补静音，不是 0 dB', () => {
    assert.equal(sampleDbAt(db, 0.03, hop), SILENCE_DB);
    assert.equal(sampleDbAt(db, 99, hop), SILENCE_DB);
    assert.equal(sampleDbAt(db, -1, hop), SILENCE_DB);
    assert.ok(SILENCE_DB < -60, '哨兵必须远低于任何真实电平');
  });

  it('越界值换算成线性能量后必须远小于界内值（这正是当初判错 drop 的地方）', () => {
    const lin = (d: number) => Math.pow(10, d / 20);
    const inside = lin(sampleDbAt(db, 0.01, hop));
    const outside = lin(sampleDbAt(db, 0.5, hop));
    assert.ok(
      outside < inside * 1e-3,
      `越界能量 ${outside} 应远小于界内 ${inside} —— 补 0 dB 的话它会是 1.0，反而最大`
    );
  });
});
