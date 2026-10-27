import { describe, it } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { camDistance, detectCameraMoves, cameraSpots } from '../../scripts/spot/camera-spots.js';
import { bakeFingerprint } from '../../scripts/render/bake.js';
import { CamKey } from './camera.js';
import { defaultMusicPlan, alignCueIntro } from '../../scripts/spot/music-plan.js';
import { BeatGrid } from '../../scripts/sync/analyze.js';
import { buildPlan, FilmAdapter, MusicCue, VisualHit } from './types.js';

describe('摄影机速度派生 spot (spot/camera-spots)', () => {
  /** 一段：静止 1s → 推进 1s → 静止 1s → 长推 1.2s → 静止 */
  const keys: CamKey[] = [
    { t: 0.0, x: 0, y: 0, z: 1 },
    { t: 1.0, x: 0, y: 0, z: 1 },
    { t: 2.0, x: 0, y: 0, z: 2.2 },
    { t: 3.0, x: 0, y: 0, z: 2.2 },
    { t: 4.2, x: 600, y: 0, z: 2.2 },
    { t: 5.4, x: 600, y: 0, z: 2.2 },
  ];

  it('camDistance 的 z 走对数差：等比推拉的距离相等', () => {
    const a = camDistance({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: 2 });
    const b = camDistance({ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 4 });
    assert.ok(Math.abs(a - b) < 1e-9, `1→2 与 2→4 应等距，实得 ${a} / ${b}`);
  });

  it('静止段不产生运动，推拉段被切出来', () => {
    const moves = detectCameraMoves(keys, 5.4);
    assert.ok(moves.length >= 2, `应至少切出两段运动，实得 ${moves.length}`);
    // 第一段落在 1–2s 的推进里
    assert.ok(moves[0].fromSec >= 0.9 && moves[0].toSec <= 2.2, JSON.stringify(moves[0]));
    // 每段都要有正时长和正峰值速度
    for (const m of moves) {
      assert.ok(m.durSec > 0);
      assert.ok(m.peakSpeed > 0);
    }
  });

  it('按原表派生三层：WHOOSH ≥4 帧、RISER ≥24 帧、IMPACT 到位后 12 帧', () => {
    const spots = cameraSpots(keys, 5.4, { slotPrefix: 'us' });
    const layers = new Set(spots.map((s) => s.layer));
    assert.ok(layers.has('WHOOSH'), '应有 WHOOSH');
    assert.ok(layers.has('IMPACT'), '应有 IMPACT（到位）');

    // 长运动（1.2s = 36 帧 @30fps）应当带出 RISER
    const risers = spots.filter((s) => s.layer === 'RISER');
    assert.ok(risers.length >= 1, 'ic≥24 帧的长运动应当带出 RISER');
    // RISER 的出点就是运动的终点（起势收在到位那一刻）
    const impacts = spots.filter((s) => s.layer === 'IMPACT');
    assert.ok(
      impacts.some((i) => risers.some((r) => Math.abs(r.toSec - i.fromSec) < 1e-6)),
      'RISER 出点应与某个 IMPACT 入点重合'
    );
    // RISER 长度是 20 帧
    assert.ok(Math.abs(risers[0].toSec - risers[0].fromSec - 20 / 30) < 1e-3);
  });

  it('IMPACT 落在镜头到位那一刻，长度 12 帧', () => {
    const spots = cameraSpots(keys, 5.4, { slotPrefix: 'us' });
    const moves = detectCameraMoves(keys, 5.4);
    const impacts = spots.filter((s) => s.layer === 'IMPACT');
    for (const im of impacts) {
      assert.ok(
        moves.some((m) => Math.abs(m.toSec - im.fromSec) < 1e-6),
        `IMPACT @${im.fromSec} 应落在某段运动的终点`
      );
      assert.ok(im.toSec - im.fromSec <= 12 / 30 + 1e-6);
    }
  });

  it('槽名全部带上前缀，便于和语义标注区分', () => {
    const spots = cameraSpots(keys, 5.4, { slotPrefix: 'lc' });
    assert.ok(spots.every((s) => s.slot.startsWith('lc')), JSON.stringify(spots.map((s) => s.slot)));
  });
});

describe('烘焙指纹 (render/bake)', () => {
  const base = {
    compositionId: 'us-bake',
    frame: 40,
    scale: 2,
    outDirRel: 'bake',
    baseName: 'card',
  };

  it('同样的参数得到同样的指纹', () => {
    assert.equal(bakeFingerprint(base), bakeFingerprint({ ...base }));
  });

  it('帧号 / 倍率 / props 任一改变都换指纹（所以文件名也变，Studio 不会拿旧图顶包）', () => {
    const f0 = bakeFingerprint(base);
    assert.notEqual(f0, bakeFingerprint({ ...base, frame: 41 }));
    assert.notEqual(f0, bakeFingerprint({ ...base, scale: 4 }));
    assert.notEqual(f0, bakeFingerprint({ ...base, props: { theme: 'dark' } }));
  });

  it('只改输出目录或基名不影响指纹（指纹只描述内容）', () => {
    const f0 = bakeFingerprint(base);
    assert.equal(f0, bakeFingerprint({ ...base, outDirRel: 'bake/v2' }));
    assert.equal(f0, bakeFingerprint({ ...base, baseName: 'other' }));
  });
});

describe('配乐缺省规划与入点对齐 (spot/music-plan)', () => {
  const mkAdapter = (hits: VisualHit[], scenes: { id: string; dur: number }[]): FilmAdapter => {
    const timeline = buildPlan(
      scenes.map((s) => ({ id: s.id, label: s.id, dur: s.dur, overlap: 0, enter: 'none' as const }))
    );
    return {
      filmId: 'test', title: 'T', fps: 30, width: 1920, height: 1080, timeline,
      SC: {}, K: {}, ignoredKeys: [], palette: {},
      spots: () => [], typings: () => [], hits: () => hits,
      zones: () => [{ name: 'all', kind: 'video', fromSec: 0, toSec: timeline.totalSeconds }],
    };
  };

  it('没有 P0 时退化成整片一段', () => {
    const a = mkAdapter(
      [{ id: 'h1', sec: 5, priority: 'P1', want: 'beat' }],
      [{ id: 's1', dur: 30 }]
    );
    const plan = defaultMusicPlan(a);
    assert.equal(plan.cues.length, 1);
    // 片头引用第一幕：适配器的 SC 按幕 id 命名，没有 'SC.start' 这个键（旧行为会让守门报引用解析不到）
    assert.equal(plan.cues[0].in.ref, 'SC.s1');
    assert.equal(plan.cues[0].out.ref, 'SC.end');
  });

  it('多个 P0 各自成段，边界落在幕起点上', () => {
    const a = mkAdapter(
      [
        { id: 'K.a', sec: 8, priority: 'P0', want: 'drop' },
        { id: 'K.mid', sec: 20, priority: 'P1', want: 'downbeat' },
        { id: 'K.b', sec: 42, priority: 'P0', want: 'drop' },
      ],
      [{ id: 's1', dur: 15 }, { id: 's2', dur: 15 }, { id: 's3', dur: 30 }]
    );
    const plan = defaultMusicPlan(a, { minCueSec: 5 });
    assert.equal(plan.cues.length, 2, JSON.stringify(plan.cues.map((c) => c.id)));
    // 第二段的入点应当是某个幕的起点（15 或 30）
    assert.ok([15, 30].includes(plan.cues[1].in.sec), `实得 ${plan.cues[1].in.sec}`);
    // 每段的高潮绑定到落在段内的 P0
    assert.equal(plan.cues[0].climax?.ref, 'K.a');
    assert.equal(plan.cues[1].climax?.ref, 'K.b');
    // 非首段默认交叉淡化
    assert.equal(plan.cues[1].join?.kind, 'crossfade');
  });

  it('过短的段并进前一段', () => {
    const a = mkAdapter(
      [
        { id: 'K.a', sec: 2, priority: 'P0', want: 'drop' },
        { id: 'K.b', sec: 6, priority: 'P0', want: 'drop' },
        { id: 'K.c', sec: 40, priority: 'P0', want: 'drop' },
      ],
      [{ id: 's1', dur: 4 }, { id: 's2', dur: 4 }, { id: 's3', dur: 42 }]
    );
    const plan = defaultMusicPlan(a, { minCueSec: 10 });
    assert.ok(plan.cues.length < 3, `过短的段应被并掉，实得 ${plan.cues.length} 段`);
    for (const c of plan.cues) {
      assert.ok(c.out.sec - c.in.sec >= 10 - 1e-6 || c === plan.cues[plan.cues.length - 1]);
    }
  });

  it('入点吸附到小节头；网格不可信时不动并说明原因', () => {
    const measured: BeatGrid = {
      bpm: 120, beatSec: 0.5, barSec: 2, dropSec: 8, totalSec: 30,
      beats: Array.from({ length: 61 }, (_, i) => i * 0.5),
      downbeats: Array.from({ length: 16 }, (_, i) => i * 2),
      source: 'measured',
    };
    const cue: MusicCue = {
      id: 'c1', label: 'x',
      in: { ref: 'SC.start', sec: 0 }, out: { ref: 'SC.end', sec: 30 },
      brief: '', startFromSec: 4.3, volume: 0.5, fadeInSec: 1, fadeOutSec: 1,
      track: { id: 't', title: 't', artist: '', bpm: 120, file: 'x.wav', durationSec: 30, adapted: false },
    };

    const r = alignCueIntro(cue, measured);
    assert.equal(r.snappedTo, 'bar');
    assert.equal(r.alignedSec, 4);
    assert.ok(Math.abs(r.deltaSec + 0.3) < 1e-6);

    // 偏离超过半小节 → 降级吸附到拍
    const r2 = alignCueIntro({ ...cue, startFromSec: 5.1 }, measured);
    assert.ok(r2.snappedTo === 'bar' || r2.snappedTo === 'beat');

    // synthetic 网格不动
    const r3 = alignCueIntro(cue, { ...measured, source: 'synthetic' });
    assert.equal(r3.snappedTo, 'none');
    assert.equal(r3.alignedSec, 4.3);
    assert.ok(r3.reason?.includes('实测'));
  });
});

/**
 * 烘焙指纹必须跟着画面源码变（§7「生成资源的文件名带内容指纹」）。
 * 原来只算合成 id / 帧号 / 倍率，改了幕的代码指纹不变，bake 会复用旧纹理。
 */
describe('烘焙内容指纹 (render/bake)', () => {
  it('源码内容一变，指纹就变；不变则稳定', async () => {
    const { bakeFingerprint, sourceHash } = await import('../../scripts/render/bake.js');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-bake-'));
    try {
      fs.writeFileSync(path.join(tmp, 'Scene.tsx'), 'export const A = 1;');
      const h1 = sourceHash(tmp);
      assert.equal(sourceHash(tmp), h1, '同样的源码两次哈希必须一致');
      fs.writeFileSync(path.join(tmp, 'Scene.tsx'), 'export const A = 2;');
      const h2 = sourceHash(tmp);
      assert.notEqual(h1, h2, '改了源码哈希必须变');

      const target = { compositionId: 'x-S-a', frame: 40, scale: 2, outDirRel: 'bake', baseName: 'a' };
      assert.notEqual(bakeFingerprint(target, h1), bakeFingerprint(target, h2), '源码变了指纹必须变');
      assert.equal(bakeFingerprint(target, h1), bakeFingerprint(target, h1));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
