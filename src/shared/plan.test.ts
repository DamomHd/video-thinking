import fs from 'node:fs';
import path from 'node:path';
import { getFilm } from '../films.js';
import { synthForSpec } from '../../scripts/composer/synth-sfx.js';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeEventName,
  planKey,
  isCovered,
  buildSfxPlan,
  migrateParamsToPlan,
  bridgeSpots,
} from '../../scripts/spot/plan.js';
import { calcPlanVolume, LAYER_BASE_VOL, dbToLinear } from './audio-math.js';
import { FilmAdapter, PaletteSpec, SpotAnnotation, MusicFile } from './types.js';
import { buildPlan } from './types.js';

// us 片的音效是本地合成的 WAV，属于生成物、被 .gitignore 排除，新机器上没有。
// 缺哪条就按采购单合成哪条（确定性，和 vw sfx search --local 同一条路），测试才不依赖「这台机器以前跑过」。
before(async () => {
  const adapter = await (await getFilm('us')).getAdapter();
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src/films/us/audio/manifest.json'), 'utf-8')) as Record<string, { file: string }[]>;
  for (const [slot, entries] of Object.entries(manifest)) {
    const file = entries[0]?.file;
    if (!file || !adapter.palette[slot]) continue;
    if (!fs.existsSync(path.join(process.cwd(), 'public', file))) synthForSpec(adapter.palette[slot], file);
  }
});

/** 一张最小适配器：槽都指向 us 片已经合成好的那几条 WAV */
function stubAdapter(spots: SpotAnnotation[], palette: Record<string, PaletteSpec>): FilmAdapter {
  const timeline = buildPlan([
    { id: 's1', label: 'S1', dur: 30, overlap: 0, enter: 'none' },
  ]);
  return {
    filmId: 'us',
    title: 'stub',
    fps: 60,
    width: 1920,
    height: 1080,
    timeline,
    SC: { s1: 0, end: 30 },
    K: {},
    ignoredKeys: [],
    palette,
    spots: () => spots,
    typings: () => [],
    hits: () => [],
    zones: () => [{ name: 'all', kind: 'video', fromSec: 0, toSec: 30 }],
  };
}

const spec = (slot: string, over: Partial<PaletteSpec> = {}): PaletteSpec => ({
  slot,
  layer: 'IMPACT',
  cat: 'impact',
  tags: 'impact, hit',
  dur: [0.5, 4],
  variants: 1,
  align: 'onset',
  gain: 1,
  ...over,
});

describe('计划生成规则 (spot/plan)', () => {
  it('key 去掉括号里的动态值，重名加 #n，插入新事件不会让后面的 key 错位', () => {
    assert.equal(normalizeEventName('点击（第 3 次）'), '点击');
    assert.equal(normalizeEventName('click (dynamic 42)'), 'click');

    const seen = new Map<string, number>();
    assert.equal(planKey('uiClick', '发送按钮（1）', seen), 'uiClick·发送按钮');
    assert.equal(planKey('uiClick', '发送按钮（2）', seen), 'uiClick·发送按钮#2');
    assert.equal(planKey('uiClick', '发送按钮（3）', seen), 'uiClick·发送按钮#3');
    // 另一个槽各自从 1 开始
    assert.equal(planKey('uiPop', '发送按钮', seen), 'uiPop·发送按钮');
  });

  it('覆盖判定：同层 ±0.4s 内已有声音就算已覆盖', () => {
    const accepted = [{ layer: 'IMPACT', fromSec: 10 }];
    const mk = (fromSec: number, layer: any): SpotAnnotation => ({
      id: 'x', fromSec, toSec: fromSec + 0.5, layer, slot: 's', what: 'x',
    });
    assert.equal(isCovered(mk(10.3, 'IMPACT'), accepted), true);
    assert.equal(isCovered(mk(10.5, 'IMPACT'), accepted), false);
    assert.equal(isCovered(mk(10.3, 'UI'), accepted), false, '不同层互不覆盖');
  });

  it('音量按真实峰值归一到 −6 dBFS，再乘层基准与 palette.gain', () => {
    // 峰值 −12dBFS 的素材：归一系数 = 10^((−6−(−12))/20) ≈ 1.995
    const v = calcPlanVolume('IMPACT', -12, 1);
    const expected = LAYER_BASE_VOL.IMPACT * Math.min(1.6, dbToLinear(-6 - -12));
    assert.ok(Math.abs(v - expected) < 1e-4, `期望 ${expected}，实际 ${v}`);
    // 归一系数被夹在 [0.15, 1.6]
    assert.ok(calcPlanVolume('IMPACT', -60, 1) <= LAYER_BASE_VOL.IMPACT * 1.6 + 1e-9);
    assert.ok(calcPlanVolume('IMPACT', 0, 1) >= LAYER_BASE_VOL.IMPACT * 0.15 - 1e-9);
    // palette.gain 是乘在最后的倍率
    assert.ok(Math.abs(calcPlanVolume('IMPACT', -12, 2) - v * 2) < 1e-3);
  });

  it('RISER(peak) 把素材峰对到事件终点；未采购的槽不进计划', () => {
    const adapter = stubAdapter(
      [
        { id: '起势', fromSec: 10, toSec: 13, layer: 'RISER', slot: 'usRiserSweep', what: '起势' },
        { id: '没买的声', fromSec: 20, toSec: 21, layer: 'IMPACT', slot: 'notPurchased', what: '没买' },
      ],
      {
        usRiserSweep: spec('usRiserSweep', { layer: 'RISER', align: 'peak', dur: [1, 4] }),
        notPurchased: spec('notPurchased'),
      }
    );

    const { plan, skippedUnpurchased } = buildSfxPlan(adapter);
    assert.equal(plan.length, 1, '只有已采购的槽进计划');
    assert.equal(skippedUnpurchased.length, 1);
    assert.equal(skippedUnpurchased[0].slot, 'notPurchased');

    const riser = plan[0];
    // fromSec = 事件终点 − 素材峰位，所以起点一定早于事件终点
    assert.ok(riser.fromSec < 13, `peak 对齐后起点应早于 13s，实际 ${riser.fromSec}`);
    assert.ok(riser.fromSec > 8, `起点不该偏得太远，实际 ${riser.fromSec}`);
    assert.ok(riser.volume > 0 && riser.volume < 1.7);
  });

  it('BG / TEX 循环铺底，一次性层不循环', () => {
    const adapter = stubAdapter(
      [
        { id: '氛围', fromSec: 0, toSec: 6, layer: 'BG', slot: 'usAtmosphere', what: '氛围' },
        { id: '落点', fromSec: 10, toSec: 11, layer: 'IMPACT', slot: 'usLogoHit', what: '落点' },
      ],
      {
        usAtmosphere: spec('usAtmosphere', { layer: 'BG', dur: [4, 12] }),
        usLogoHit: spec('usLogoHit', { layer: 'IMPACT' }),
      }
    );
    const { plan } = buildSfxPlan(adapter);
    const bg = plan.find((p) => p.layer === 'BG');
    const hit = plan.find((p) => p.layer === 'IMPACT');
    assert.equal(bg?.loop, true);
    assert.ok(Math.abs((bg?.durSec ?? 0) - 6) < 1e-6, '铺底层时长等于事件区间');
    assert.equal(hit?.loop, undefined);
  });

  it('同 key 沿用上一版文件；手动参数按 key 迁移，孤儿键被清掉', () => {
    const adapter = stubAdapter(
      [{ id: '落点', fromSec: 10, toSec: 11, layer: 'IMPACT', slot: 'usLogoHit', what: '落点' }],
      { usLogoHit: spec('usLogoHit') }
    );
    const { plan } = buildSfxPlan(adapter);
    const key = plan[0].key;

    const truth = {
      offsets: { [key]: 0.2, '已经删掉的·事件': 0.9 },
      gains: { [key]: -3 },
      fades: { in: { [key]: 0.1 }, out: { '没了的·键': 0.3 } },
      ducks: {},
    };
    const { dropped } = migrateParamsToPlan(plan, truth);

    assert.equal(truth.offsets[key], 0.2, '仍在计划里的 key 必须保留');
    assert.equal(truth.gains[key], -3);
    assert.equal(truth.offsets['已经删掉的·事件'], undefined);
    assert.equal(truth.fades.out['没了的·键'], undefined);
    assert.equal(dropped.length, 2);
  });

  it('take 只放截取那一段', () => {
    const adapter = stubAdapter(
      [{
        id: '第二笔', fromSec: 5, toSec: 6, layer: 'IMPACT',
        slot: 'usLogoHit', what: '第二笔', take: [0.8, 1.4],
      }],
      { usLogoHit: spec('usLogoHit') }
    );
    const { plan } = buildSfxPlan(adapter);
    assert.ok(Math.abs(plan[0].startFromSec - 0.8) < 1e-6);
    assert.ok(Math.abs(plan[0].durSec - 0.6) < 1e-6);
  });
});

/**
 * 音效桥 (§15.5 的 bridgeSpots)
 *
 * music.json 里 join.kind = 'bridge' 的段，要在入点前 2.5s 铺 riser、入点落 impact，
 * 两条都带 force。之前 join.kind 能设成 'bridge' 但没有任何代码为它发声 ——
 * 设了等于没设。
 */
describe('音效桥 (plan/bridgeSpots)', () => {
  const palette = {
    r1: { slot: 'r1', layer: 'RISER' as const, variants: 1, gain: 1, tags: '', ucs: [] },
    i1: { slot: 'i1', layer: 'IMPACT' as const, variants: 1, gain: 1, tags: '', ucs: [] },
  };
  const adapter = { palette } as unknown as FilmAdapter;

  const musicWith = (kind: string): MusicFile =>
    ({
      version: 2,
      cues: [
        { id: 'c1', label: 'c1', in: { ref: 'a', sec: 0 }, out: { ref: 'b', sec: 20 },
          brief: '', startFromSec: 0, volume: 0.5, fadeInSec: 0, fadeOutSec: 0 },
        { id: 'c2', label: 'c2', in: { ref: 'b', sec: 20 }, out: { ref: 'c', sec: 40 },
          brief: '', startFromSec: 0, volume: 0.5, fadeInSec: 0, fadeOutSec: 0,
          join: { kind } },
      ],
    }) as unknown as MusicFile;

  it('bridge 段生成 riser + impact，都带 force', () => {
    const spots = bridgeSpots(adapter, musicWith('bridge'));
    assert.equal(spots.length, 2, '应生成起势和落点两条');

    const riser = spots.find((s) => s.layer === 'RISER');
    const impact = spots.find((s) => s.layer === 'IMPACT');
    assert.ok(riser && impact);
    assert.equal(riser.toSec, 20, 'riser 要收在入点上');
    assert.equal(riser.fromSec, 17.5, 'riser 要从入点前 2.5s 起');
    assert.equal(impact.fromSec, 20, 'impact 要落在入点上');
    assert.ok(riser.force && impact.force, '两条都必须 force —— 桥就是要盖在别的声音上');
  });

  it('非 bridge 的衔接不生成任何桥', () => {
    for (const kind of ['cut', 'gap', 'crossfade']) {
      assert.equal(bridgeSpots(adapter, musicWith(kind)).length, 0, `${kind} 不该生成桥`);
    }
    assert.equal(bridgeSpots(adapter, undefined).length, 0, '没有 music.json 时不生成');
  });

  it('采购单里没有对应层的槽时不编造槽名', () => {
    const noRiser = { palette: { i1: palette.i1 } } as unknown as FilmAdapter;
    const spots = bridgeSpots(noRiser, musicWith('bridge'));
    assert.equal(spots.length, 1);
    assert.equal(spots[0].layer, 'IMPACT');
  });
});
