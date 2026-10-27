import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as render from './audio-math.js';
import { knotMap as renderKnotMap } from './warp.js';
import { buildTimeWarp } from './timewarp.js';
import * as studio from '../../tools/studio/formulas.js';
import { AudioLayer, MixFile } from './types.js';

/**
 * 「所听即所得」的对照测试（对标 architecture.html §18.6，并补上 §21 P5 点名的债）
 *
 * 工作台在浏览器里跑，没有构建步骤，所以它不能直接 import 渲染端的 TypeScript；
 * 两边各有一份公式实现。这个文件把**每一个公式逐点对照**，
 * 一旦有人只改了一边，测试立刻红 —— 这是防止「工作台里听到的 ≠ 成片里的」唯一的闸。
 */

const EPS = 1e-9;
const close = (a: number, b: number, eps = EPS) =>
  assert.ok(Math.abs(a - b) <= eps, `期望 ${b}，实得 ${a}（差 ${Math.abs(a - b)}）`);

const mix: MixFile = {
  layers: { MUSIC: -2, BG: 1.5, TEX: 0, RISER: -3, WHOOSH: 0.5, IMPACT: 2, UI: -1 },
  muted: ['TEX'],
  master: -1.5,
};
const gains: Record<string, number> = { 'a·x': -4.5, 'b·y': 3, 'music:c1': -2.25 };

describe('工作台 ↔ 渲染端：dB 换算', () => {
  it('dbToLinear 逐点一致', () => {
    for (let db = -48; db <= 12; db += 0.25) {
      close(studio.dbToLin(db), render.dbToLinear(db));
    }
  });

  it('linearToDb 逐点一致（含 0 与极小值的地板）', () => {
    for (const lin of [0, 1e-9, 1e-6, 0.001, 0.15, 0.5, 1, 1.6, 4]) {
      close(studio.linToDb(lin), render.linearToDb(lin));
    }
  });

  it('clamp01 逐点一致', () => {
    for (const v of [-2, -0.001, 0, 0.5, 1, 1.001, 3, NaN]) {
      const a = studio.clamp01(v);
      const b = render.clamp01(v);
      if (Number.isNaN(a) || Number.isNaN(b)) assert.ok(Number.isNaN(a) && Number.isNaN(b));
      else close(a, b);
    }
  });
});

describe('工作台 ↔ 渲染端：三级增益 gainOf', () => {
  it('所有层 × 所有已知 key 逐点一致', () => {
    const layers: AudioLayer[] = ['MUSIC', 'BG', 'TEX', 'RISER', 'WHOOSH', 'IMPACT', 'UI'];
    for (const layer of layers) {
      for (const key of [...Object.keys(gains), '不存在的key']) {
        close(studio.gainOf(key, layer, gains, mix), render.gainOf(key, layer, gains, mix));
      }
    }
  });

  it('被 mute 的层两边都返回 0', () => {
    assert.equal(studio.gainOf('a·x', 'TEX', gains, mix), 0);
    assert.equal(render.gainOf('a·x', 'TEX', gains, mix), 0);
  });
});

describe('工作台 ↔ 渲染端：淡化 fadeAt', () => {
  it('区间内外、各种淡化长度逐点一致', () => {
    const cases: [number, number, number][] = [
      [2.0, 0.3, 0.5],
      [0.25, 0, 0],
      [1.0, 0.5, 0.5],   // 淡入淡出相接
      [0.6, 0.4, 0.4],   // 相交：取 min
      [3.0, 0, 1.2],
    ];
    for (const [dur, fi, fo] of cases) {
      for (let t = -0.2; t <= dur + 0.2; t += 0.01) {
        close(studio.fadeAt(t, dur, fi, fo), render.fadeAt(t, dur, fi, fo));
      }
    }
  });
});

describe('工作台 ↔ 渲染端：等功率交叉淡化', () => {
  it('逐点一致，且满足 cos² + sin² = 1', () => {
    for (let p = -0.1; p <= 1.1; p += 0.005) {
      const a = studio.equalPowerCrossfade(p);
      const b = render.equalPowerCrossfade(p);
      close(a.inGain, b.inGain);
      close(a.outGain, b.outGain);
      close(a.inGain ** 2 + a.outGain ** 2, 1, 1e-12);
    }
  });
});

describe('工作台 ↔ 渲染端：让位包络 duckAt', () => {
  const triggers = [
    { triggerStartSec: 5.0, spec: { db: -5, preSec: 0.2, holdSec: 1.1, releaseSec: 0.8, layers: ['MUSIC'] as AudioLayer[] } },
    { triggerStartSec: 5.6, spec: { db: -9, preSec: 0.1, holdSec: 0.4, releaseSec: 0.5, layers: ['MUSIC', 'BG'] as AudioLayer[] } },
    { triggerStartSec: 12.0, spec: { db: -3, preSec: 0.5, holdSec: 0.2, releaseSec: 1.5, layers: ['BG'] as AudioLayer[] } },
  ];

  it('MUSIC 层逐点一致（含两条让位重叠时取最深）', () => {
    for (let t = 4.0; t <= 8.5; t += 0.005) {
      close(studio.duckAt(t, 'MUSIC', triggers), render.duckAt(t, 'MUSIC', triggers));
    }
  });

  it('BG 层逐点一致', () => {
    for (let t = 4.0; t <= 14.5; t += 0.01) {
      close(studio.duckAt(t, 'BG', triggers), render.duckAt(t, 'BG', triggers));
    }
  });

  it('不在 layers 列表里的层不受影响，两边都是 1', () => {
    for (let t = 4.0; t <= 14.5; t += 0.05) {
      assert.equal(studio.duckAt(t, 'UI', triggers), 1);
      assert.equal(render.duckAt(t, 'UI', triggers), 1);
    }
  });

  it('两条让位重叠处确实取了更深的那条', () => {
    // 5.6–6.0 两条都在 hold，深的是 −9dB
    const g = render.duckAt(5.8, 'MUSIC', triggers);
    close(g, render.dbToLinear(-9), 1e-9);
    close(studio.duckAt(5.8, 'MUSIC', triggers), g);
  });
});

describe('工作台 ↔ 渲染端：时间映射', () => {
  const knots: [number, number][] = [
    [0, 0],
    [6, 5.9333],
    [7, 6.9333],
    [13.5, 13.4333],
    [20.5, 20.4333],
    [22.3, 22.2333],
    [30, 29.9333],
  ];

  it('knotMap 逐点一致（两端是同一个 Fritsch-Carlson 实现）', () => {
    const s = studio.knotMap(knots);
    const r = renderKnotMap(knots.map(([outer, inner]) => ({ outer, inner })));
    for (let t = -1; t <= 31; t += 0.02) {
      close(s(t), r(t), 1e-12);
    }
  });

  it('buildWarp 的 toFilm / toScore 与渲染端 buildTimeWarp 逐点一致', () => {
    const sw = studio.buildWarp({ knots });
    const rw = buildTimeWarp({ knots });
    assert.equal(sw.identity, rw.IS_IDENTITY);
    for (let t = 0; t <= 30; t += 0.02) {
      close(sw.toFilm(t), rw.toFilm(t), 1e-12);
      close(sw.toScore(t), rw.toScore(t), 1e-12);
    }
  });

  it('恒等 knots 两边都判成恒等（不能像原版那样只认「2 个节点」）', () => {
    const identity: [number, number][] = Array.from({ length: 13 }, (_, i) => [i * 2, i * 2]);
    assert.equal(studio.buildWarp({ knots: identity }).identity, true);
    assert.equal(buildTimeWarp({ knots: identity }).IS_IDENTITY, true);
  });

  it('节点少于 2 个时两边都退化成恒等', () => {
    assert.equal(studio.buildWarp({ knots: [[0, 0]] as [number, number][] }).identity, true);
    assert.equal(buildTimeWarp({ knots: [[0, 0]] }).IS_IDENTITY, true);
  });
});

describe('整条链路的合成音量逐点一致', () => {
  it('音效片段：volume × 三级增益 × 淡化 × 让位', () => {
    const item = { key: 'a·x', layer: 'IMPACT' as AudioLayer, volume: 0.64, durSec: 2.4, fadeSec: 0.02 };
    const startSec = 4.8;
    const triggers = [
      { triggerStartSec: 5.0, spec: { db: -5, preSec: 0.2, holdSec: 1.1, releaseSec: 0.8, layers: ['IMPACT'] as AudioLayer[] } },
    ];

    for (let local = 0; local <= item.durSec; local += 0.005) {
      const filmSec = startSec + local;
      const rv =
        item.volume *
        render.gainOf(item.key, item.layer, gains, mix) *
        render.fadeAt(local, item.durSec, item.fadeSec, item.fadeSec) *
        render.duckAt(filmSec, item.layer, triggers);
      const sv =
        item.volume *
        studio.gainOf(item.key, item.layer, gains, mix) *
        studio.fadeAt(local, item.durSec, item.fadeSec, item.fadeSec) *
        studio.duckAt(filmSec, item.layer, triggers);
      close(sv, rv, 1e-12);
    }
  });

  it('配乐段：cue.volume × 增益 × 让位 × 交叉淡化', () => {
    const cue = { id: 'c1', volume: 0.55, durSec: 12, xfadeIn: 1.5, xfadeOut: 2.0 };
    const triggers = [
      { triggerStartSec: 6.0, spec: { db: -5, preSec: 0.2, holdSec: 1.1, releaseSec: 0.8, layers: ['MUSIC'] as AudioLayer[] } },
    ];

    const fadeOf = (eq: typeof render.equalPowerCrossfade, local: number) => {
      if (cue.xfadeIn > 0 && local < cue.xfadeIn) return eq(local / cue.xfadeIn).inGain;
      if (cue.xfadeOut > 0 && local > cue.durSec - cue.xfadeOut) {
        return eq((local - (cue.durSec - cue.xfadeOut)) / cue.xfadeOut).outGain;
      }
      return 1;
    };

    for (let local = 0; local <= cue.durSec; local += 0.01) {
      const rv =
        cue.volume *
        render.gainOf('music:c1', 'MUSIC', gains, mix) *
        render.duckAt(local, 'MUSIC', triggers) *
        fadeOf(render.equalPowerCrossfade, local);
      const sv =
        cue.volume *
        studio.gainOf('music:c1', 'MUSIC', gains, mix) *
        studio.duckAt(local, 'MUSIC', triggers) *
        fadeOf(studio.equalPowerCrossfade as typeof render.equalPowerCrossfade, local);
      close(sv, rv, 1e-12);
    }
  });
});

describe('工作台 ↔ 渲染端：口播让配乐（可选 VO 层）', () => {
  it('同一张口播表、同一个时间映射，两端的让位触发和让位包络逐点一致', async () => {
    const { voiceDuckTriggers } = await import('./voice');
    const voice = {
      engine: 'edge' as const,
      duckDb: -12,
      lines: [
        { id: 'a', text: '一', sec: 1, file: 'voice/x/a.wav', durSec: 1.4 },
        { id: 'b', text: '二', sec: 4, file: 'voice/x/b.wav', durSec: 2 },
        { id: 'c', text: '没配音', sec: 8 },
      ],
    };
    const toFilm = (s: number) => s * 1.02 + 0.1;
    const r = voiceDuckTriggers(voice, toFilm);
    const s = studio.voiceDuckTriggers(voice, toFilm);
    assert.deepEqual(s, r);
    for (let t = 0; t < 8; t += 0.05) close(studio.duckAt(t, 'MUSIC', s), render.duckAt(t, 'MUSIC', r));
  });
});
