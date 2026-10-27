import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { checkTimeline, MAX_CUE_SEC } from '../../scripts/guard/timeline-guard.js';
import { checkDeterminism } from '../../scripts/guard/deterministic.js';
import { buildPlan, FilmAdapter, MusicFile, SyncFile } from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import {
  checkBeatCoverage,
  findReferences,
  collectUsedKeys,
} from '../../scripts/guard/beat-coverage.js';
import { getFilm } from '../films.js';

const timeline = buildPlan([
  { id: 's1', label: 'S1', dur: 10, overlap: 0, enter: 'none' },
  { id: 's2', label: 'S2', dur: 10, overlap: 0, enter: 'none' },
]);

const adapter = {
  filmId: 'test', title: 'T', fps: 30, width: 1920, height: 1080, timeline,
  SC: { s1: 0, s2: 10 },
  K: { ink: 4.0 },
  ignoredKeys: [], palette: {},
  spots: () => [], typings: () => [], hits: () => [],
  zones: () => [{ name: 'all', kind: 'video' as const, fromSec: 0, toSec: 20 }],
} as FilmAdapter;

const cue = (over: Record<string, unknown> = {}) => ({
  id: 'c1', label: 'c1',
  in: { ref: 'SC.s1', sec: 0 },
  out: { ref: 'SC.end', sec: 20 },
  brief: '', startFromSec: 0, volume: 0.5, fadeInSec: 1, fadeOutSec: 1,
  ...over,
});

const music = (cues: unknown[]): MusicFile => ({ version: 2, cues: cues as MusicFile['cues'] });

// 守门只查「曲目文件在不在」。生成出来的配乐 WAV 被 .gitignore 排除，新机器上没有，所以测试自己放一个占位文件
const FIXTURE = path.join(process.cwd(), 'public', 'music', '__guard-test-fixture.wav');

describe('配乐段守门 (guard/timeline-guard)', () => {
  before(() => {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(FIXTURE, '');
  });
  after(() => fs.rmSync(FIXTURE, { force: true }));

  it('ref 现解析值与存的值对不上时报错（编舞改了而 ref 没重解析）', () => {
    // SC.s2 现在解析为 10，但存的是 12
    const r = checkTimeline(
      timeline,
      music([cue({ in: { ref: 'SC.s2', sec: 12 } })]),
      { adapter }
    );
    assert.equal(r.valid, false);
    assert.ok(
      r.errors.some((e) => e.includes("ref='SC.s2'") && e.includes('现解析为 10')),
      JSON.stringify(r.errors)
    );
  });

  it('ref 一致时不报错', () => {
    const r = checkTimeline(
      timeline,
      music([cue({ in: { ref: 'SC.s2', sec: 10 }, out: { ref: 'SC.end', sec: 20 } })]),
      { adapter }
    );
    assert.equal(r.valid, true, JSON.stringify(r.errors));
  });

  it('解析不出来的 ref 只告警，不拦（有些 ref 是人为写的占位）', () => {
    const r = checkTimeline(timeline, music([cue({ in: { ref: 'K.不存在', sec: 0 } })]), { adapter });
    assert.equal(r.valid, true);
    assert.ok(r.warnings.some((w) => w.includes('解析不出来')));
  });

  it(`段长超过 ${MAX_CUE_SEC}s 时报错（Adapt 接口硬上限）`, () => {
    const long = buildPlan([{ id: 'x', label: 'X', dur: 400, overlap: 0, enter: 'none' }]);
    const r = checkTimeline(
      long,
      music([cue({ in: { ref: 'SC.start', sec: 0 }, out: { ref: 'SC.end', sec: 400 } })])
    );
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes(`上限 ${MAX_CUE_SEC}s`)), JSON.stringify(r.errors));
  });

  it('sync 锚点越过所属段的曲长时报错', () => {
    const m = music([
      cue({
        track: {
          id: 't', title: 't', artist: '', bpm: 120,
          file: 'music/__guard-test-fixture.wav', durationSec: 8, adapted: false,
        },
      }),
    ]);
    const sync: SyncFile = {
      knots: [[0, 0], [20, 20]],
      anchors: [{
        hit: 'K.ink', cueId: 'c1', targetSec: 4, musicSec: 15,
        musicKind: 'beat', errMs: 0, priority: 'P0', status: 'locked',
      }],
      report: { scoreSync: 0, lockedCount: 1, downgradedCount: 0, droppedCount: 0 },
    };
    const r = checkTimeline(timeline, m, { sync });
    assert.ok(
      r.errors.some((e) => e.includes('越过了曲长 8s')),
      JSON.stringify(r.errors)
    );
  });

  it('放弃的锚点不参与曲长校验', () => {
    const m = music([
      cue({
        track: {
          id: 't', title: 't', artist: '', bpm: 120,
          file: 'music/__guard-test-fixture.wav', durationSec: 8, adapted: false,
        },
      }),
    ]);
    const sync: SyncFile = {
      knots: [[0, 0], [20, 20]],
      anchors: [{
        hit: 'K.ink', cueId: 'c1', targetSec: 4, musicSec: 99,
        musicKind: 'beat', errMs: 0, priority: 'P0', status: 'dropped',
      }],
      report: { scoreSync: 0, lockedCount: 0, downgradedCount: 0, droppedCount: 1 },
    };
    assert.equal(checkTimeline(timeline, m, { sync }).valid, true);
  });

  it('段重叠但衔接不是 crossfade 时报错（会叠音）', () => {
    const m = music([
      cue({ id: 'a', out: { ref: 'SC.s2', sec: 12 } }),
      cue({ id: 'b', in: { ref: 'SC.s2', sec: 10 }, join: { kind: 'cut' } }),
    ]);
    const r = checkTimeline(timeline, m);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('会叠音')), JSON.stringify(r.errors));
  });

  it('声明了 crossfade 的重叠放行', () => {
    const m = music([
      cue({ id: 'a', out: { ref: 'SC.s2', sec: 12 } }),
      cue({ id: 'b', in: { ref: 'SC.s2', sec: 10 }, join: { kind: 'crossfade', overlapSec: 2 } }),
    ]);
    assert.equal(checkTimeline(timeline, m).valid, true);
  });

  it('曲目文件不在盘上时报错', () => {
    const m = music([
      cue({
        track: {
          id: 't', title: 't', artist: '', bpm: 120,
          file: 'music/根本没有这个文件.wav', durationSec: 20, adapted: false,
        },
      }),
    ]);
    const r = checkTimeline(timeline, m);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.includes('曲目文件不存在')));
  });
});

describe('确定性守门的两条新规则 (guard/deterministic)', () => {
  it('两部片现在都零违规（扫描范围已覆盖 shared / probe / 衍生片）', () => {
    for (const id of ['us', 'loomcare-demo']) {
      const v = checkDeterminism(id);
      assert.equal(
        v.length,
        0,
        `${id} 有 ${v.length} 处违规: ${v.map((x) => `${x.rule}@${x.file}:${x.line}`).join(', ')}`
      );
    }
  });

  it('扫描范围确实包含 shared（而不是只有 films + components）', () => {
    // shared 里真的有文件被扫到：往里塞一条违规应当被抓出来
    const probe = path.join(process.cwd(), 'src', 'shared', '.guard-probe.tsx');
    fs.writeFileSync(probe, 'export const x = () => Math.random();\n', 'utf-8');
    try {
      const v = checkDeterminism('us');
      assert.ok(
        v.some((x) => x.rule === 'FORBID_MATH_RANDOM' && x.file.includes('.guard-probe')),
        'shared 目录应当在扫描范围内'
      );
    } finally {
      fs.unlinkSync(probe);
    }
  });
});

describe('拍点的源码引用守门 (guard/beat-coverage)', () => {
  const adapterDir = path.join(process.cwd(), 'src', 'films', 'us', 'audio');
  const probeFile = path.join(adapterDir, '.coverage-probe.ts');
  const write = (body: string) => fs.writeFileSync(probeFile, body, 'utf-8');
  const cleanup = () => { if (fs.existsSync(probeFile)) fs.unlinkSync(probeFile); };

  it('找得到 K.<键> 的各种写法（含注释里的）', () => {
    const source = [
      {
        file: 'x.ts',
        lines: [
          'const a = this.K.ink;',
          "const b = K['ink'];",
          '// K.ink 这一刻故意不配声',
          'const c = K.other;',
        ],
      },
    ];
    const refs = findReferences(source, 'ink');
    assert.equal(refs.length, 3, JSON.stringify(refs));
    assert.equal(refs.filter((r) => r.inComment).length, 1);
    assert.equal(findReferences(source, 'nothing').length, 0);
  });

  it('collectUsedKeys 收得齐所有被引用的键', () => {
    const used = collectUsedKeys([
      { file: 'x.ts', lines: ['K.a', "K['b']", 'this.K.c', '// K.d'] },
    ]);
    for (const k of ['a', 'b', 'c', 'd']) assert.ok(used.includes(k), `漏了 ${k}`);
  });

  it('us 片现在零违规（firstBead 已在注释里说明理由）', async () => {
    const adapter = await (await getFilm('us')).getAdapter();
    const r = await checkBeatCoverage(adapter);
    assert.equal(r.unreferencedBeats.length, 0, JSON.stringify(r.unreferencedBeats));
    assert.equal(r.danglingRefs.length, 0, JSON.stringify(r.danglingRefs));
    assert.equal(r.orphanKeys.length, 0, JSON.stringify(r.orphanKeys));
    // 故意不配声的那个键被识别成「只在注释里」，而且理由被抓到了
    const silent = r.commentOnlyBeats.find((c) => c.key === 'firstBead');
    assert.ok(silent, '应当识别出 firstBead 只在注释里');
    assert.ok(!silent!.reason.includes('没写理由'), `理由没被识别: ${silent!.reason}`);
  });

  it('「源码引用了但 K 表里没有」会被抓出来（删键漏改适配器）', async () => {
    write('export const broken = () => K.这个键早就删了;\n');
    try {
      const adapter = await (await getFilm('us')).getAdapter();
      const r = await checkBeatCoverage(adapter);
      assert.ok(
        r.danglingRefs.includes('这个键早就删了') ||
          r.danglingRefs.some((d) => d.includes('删')),
        `应当报悬空引用，实得 ${JSON.stringify(r.danglingRefs)}`
      );
    } finally {
      cleanup();
    }
  });

  it('「K 表里有但谁都没管」会被抓出来', async () => {
    const adapter = await (await getFilm('us')).getAdapter();
    // 临时往 K 表里塞一个键，源码里没有任何地方提到它
    // 用 Object.create 保住原型上的方法（直接展开类实例会丢掉 typings / spots）
    const patched: typeof adapter = Object.assign(
      Object.create(Object.getPrototypeOf(adapter)),
      adapter,
      { K: { ...adapter.K, 没人管的键: 3.3 } }
    );
    const r = await checkBeatCoverage(patched);
    assert.ok(
      r.unreferencedBeats.includes('没人管的键'),
      `应当报未引用，实得 ${JSON.stringify(r.unreferencedBeats)}`
    );
  });

  it('白名单（ignoredKeys）里的键直接放行', async () => {
    const adapter = await (await getFilm('us')).getAdapter();
    const patched: typeof adapter = Object.assign(
      Object.create(Object.getPrototypeOf(adapter)),
      adapter,
      { K: { ...adapter.K, 白名单键: 1.1 }, ignoredKeys: ['白名单键'] }
    );
    const r = await checkBeatCoverage(patched);
    assert.ok(!r.unreferencedBeats.includes('白名单键'));
    assert.equal(r.ignoredBeats, 1);
  });
});

/**
 * 退役拍点守门 (§19 的 CK_RETIRED)
 *
 * 退役一个拍点的做法就是把它从 K 里删掉，残留的 `K.<键>` 引用必须被抓出来。
 * 关键是**不能**因为它在 ignoredKeys 里就放过 ——
 * ignoredKeys 的语义是「K 里有、但故意不配声」，不是「可以引用一个不存在的键」。
 * 放过的话，把退役键塞进白名单就能让守门闭嘴，运行时照样炸。
 */
describe('退役拍点（CK_RETIRED）', () => {
  it('白名单里列了 K 表已经没有的键时，必须报成过期条目', async () => {
    const base = await (await getFilm('us')).getAdapter();
    const patched: typeof base = Object.assign(
      Object.create(Object.getPrototypeOf(base)),
      base,
      { ignoredKeys: ['已退役键'] }  // K 表里没有这个键
    );
    const r = await checkBeatCoverage(patched);
    assert.ok(
      r.staleIgnored.includes('已退役键'),
      '白名单里列了 K 表没有的键，必须报成过期条目，否则退役键能靠白名单瞒天过海'
    );
  });

  it('白名单不能让「引用不存在的键」蒙混过去', async () => {
    const base = await (await getFilm('us')).getAdapter();
    // 真实适配器的源码里不会引用假键，所以这里直接约束实现：
    // danglingRefs 的判定不得把 ignoredKeys 算进豁免
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'guard', 'beat-coverage.ts'),
      'utf-8'
    );
    assert.match(
      src,
      /if \(!kKeys\.includes\(used\)\) danglingRefs\.push\(used\);/,
      'danglingRefs 必须只看 K 表，不能因为键在 ignoredKeys 里就放过'
    );
    assert.ok(base.K, 'K 表应存在');
  });
});
