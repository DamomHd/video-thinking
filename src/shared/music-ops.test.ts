import { describe, it } from 'node:test';
import assert from 'node:assert';
import { applyCueOp, ensureV2 } from '../../scripts/spot/music-cues-ops.js';
import { evaluateBpmFit, scanBpmGrid } from '../../scripts/sync/bpmfit.js';
import {
  computeMscore,
  scoreCamelotTransition,
  scoreBpmTransition,
  computeContinuityScore,
} from '../../scripts/sync/mscore.js';
import { VisualHit } from './types.js';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { decodeStereo } from '../../scripts/audio/decode.js';
import { spliceAudioWithCrossfade } from '../../scripts/sync/surgery.js';

describe('多段配乐高级状态机 (music-cues-ops)', () => {
  it('应能将 v1 旧结构隐式升级为标准 v2 单段', () => {
    const v1 = {
      volume: 0.6,
      track: {
        id: 'track-old',
        title: 'Old Song',
        artist: 'Old Artist',
        bpm: 100,
        file: 'music/old.wav',
        durationSec: 30,
        adapted: true,
      },
    };
    const v2 = ensureV2(v1);
    assert.strictEqual(v2.version, 2);
    assert.strictEqual(v2.cues.length, 1);
    assert.strictEqual(v2.cues[0].id, 'c1');
    assert.strictEqual(v2.cues[0].out.sec, 30);
    assert.strictEqual(v2.cues[0].volume, 0.6);
  });

  it('split 操作应正确拆分并在相邻段配置平滑出入点', () => {
    const initial = ensureV2({
      track: { id: 't1', title: 'T1', artist: 'A', bpm: 120, file: 'f', durationSec: 40, adapted: true },
    });

    const res = applyCueOp(initial, {
      kind: 'split',
      cueId: 'c1',
      atSec: 15.0,
      label: '第二副歌',
    });

    assert.strictEqual(res.cues.length, 2);
    const [c1, c2] = res.cues;
    assert.strictEqual(c1.id, 'c1');
    assert.strictEqual(c1.in.sec, 0);
    assert.strictEqual(c1.out.sec, 15.0);

    assert.strictEqual(c2.id, 'c2');
    assert.strictEqual(c2.in.sec, 15.0);
    assert.strictEqual(c2.out.sec, 40);
    assert.strictEqual(c2.label, '第二副歌');
    assert.strictEqual(c2.startFromSec, 15.0);
  });

  it('merge 操作应合并两个相邻段并保持出点完整', () => {
    const initial = ensureV2({
      track: { id: 't1', title: 'T1', artist: 'A', bpm: 120, file: 'f', durationSec: 40, adapted: true },
    });
    const splitted = applyCueOp(initial, { kind: 'split', cueId: 'c1', atSec: 15.0 });
    const merged = applyCueOp(splitted, { kind: 'merge', cueIdA: 'c1', cueIdB: 'c2' });

    assert.strictEqual(merged.cues.length, 1);
    assert.strictEqual(merged.cues[0].id, 'c1');
    assert.strictEqual(merged.cues[0].out.sec, 40);
  });

  it('join 宏操作应正确设置 butt, gap, crossfade 衔接', () => {
    const initial = ensureV2({
      track: { id: 't1', title: 'T1', artist: 'A', bpm: 120, file: 'f', durationSec: 40, adapted: true },
    });
    const splitted = applyCueOp(initial, { kind: 'split', cueId: 'c1', atSec: 15.0 });

    // 1. 留白 gap 1.5s
    const withGap = applyCueOp(splitted, {
      kind: 'join',
      cueId: 'c2',
      joinSpec: { kind: 'gap', gapSec: 1.5 },
    });
    assert.strictEqual(withGap.cues[0].out.sec, 13.5);
    assert.strictEqual(withGap.cues[1].join?.kind, 'gap');

    // 2. 交叉淡化 crossfade 2.0s
    const withXfade = applyCueOp(withGap, {
      kind: 'join',
      cueId: 'c2',
      joinSpec: { kind: 'crossfade', overlapSec: 2.0 },
    });
    assert.strictEqual(withXfade.cues[0].out.sec, 17.0);
    assert.strictEqual(withXfade.cues[1].join?.kind, 'crossfade');
    assert.strictEqual(withXfade.cues[1].join?.overlapSec, 2.0);
  });

  it('remove 操作应防止删空配乐段', () => {
    const initial = ensureV2({});
    assert.throws(() => {
      applyCueOp(initial, { kind: 'remove', cueId: 'c1' });
    }, /至少必须保留一个配乐段/);
  });
});

describe('速度可行性与网格拟合 (bpmfit)', () => {
  const dummyHits: VisualHit[] = [
    { id: 'h_drop', sec: 10.0, filmSec: 10.0, priority: 'P0', want: 'drop' },
    { id: 'h_beat1', sec: 12.0, filmSec: 12.0, priority: 'P1', want: 'downbeat' },
    { id: 'h_beat2', sec: 14.0, filmSec: 14.0, priority: 'P2', want: 'beat' },
  ];

  it('在完全对齐网格时应获得满分 100 分', () => {
    // 假设 bpm = 120 (0.5s/拍, 2.0s/小节)，与 10.0s, 12.0s, 14.0s 完美整小节对齐
    const res = evaluateBpmFit(dummyHits, 10.0, 120, 30);
    assert.strictEqual(res.gridCostFrames, 0);
    assert.strictEqual(res.fitScore, 100);
  });

  it('全频段扫描应返回前 3 名及推荐窗口', () => {
    const scan = scanBpmGrid(dummyHits, 10.0);
    assert.strictEqual(scan.bestCandidates.length, 3);
    assert(scan.bestCandidates[0].fitScore >= scan.bestCandidates[1].fitScore);
    assert(scan.bestCandidates[0].window[0] < scan.bestCandidates[0].bpm);
    assert(scan.bestCandidates[0].window[1] > scan.bestCandidates[0].bpm);
  });
});

describe('选曲综合打分与调性系统 (mscore & camelot)', () => {
  it('Camelot 调性过渡打分计算准确', () => {
    // 同调 100
    assert.strictEqual(scoreCamelotTransition('8A', '8A'), 100);
    // 相对大小调 95
    assert.strictEqual(scoreCamelotTransition('8A', '8B'), 95);
    // 相邻同性调 90
    assert.strictEqual(scoreCamelotTransition('8A', '9A'), 90);
    assert.strictEqual(scoreCamelotTransition('8A', '7A'), 90);
    // 跨圆盘两端环绕相邻
    assert.strictEqual(scoreCamelotTransition('12A', '1A'), 90);
    // 跨步转调
    assert.strictEqual(scoreCamelotTransition('8A', '10A'), 65);
  });

  it('速度接续过渡允许原速、倍速、半速与留白免检', () => {
    // 原速
    assert.strictEqual(scoreBpmTransition(100, 102), 100);
    // 倍速 (100 -> 200)
    assert.strictEqual(scoreBpmTransition(100, 204), 100);
    // 半速 (100 -> 50)
    assert.strictEqual(scoreBpmTransition(100, 51), 100);
    // 留白免检
    assert.strictEqual(scoreBpmTransition(80, 160, 'gap'), 100);
  });

  it('mscore 严格按照附录 C 公式打分并执行人声重罚', () => {
    const trackInst = {
      id: 'inst',
      title: 'Tech Ambient',
      artist: 'Studio',
      bpm: 110,
      durationSec: 100,
      hasVocals: false,
      moodScore: 80,
      genreScore: 80,
    };
    const trackVocal = {
      ...trackInst,
      hasVocals: true,
    };

    const resInst = computeMscore(trackInst);
    const resVocal = computeMscore(trackVocal);

    assert.strictEqual(resInst.vocalPenalty, 0);
    assert.strictEqual(resVocal.vocalPenalty, 60);
    assert.strictEqual(resInst.mscore - resVocal.mscore, 60);
  });
});

/**
 * 乐句重排的两条硬性质 (sync/surgery)
 *
 * 1. 产物必须保住立体声。曾经只剪下混的 mono、再把它同时写进 L 和 R，
 *    剪出来的素材声像全塌 —— 分析可以用下混，产物不行。
 * 2. 刀口在主 drop 之后时，drop 一定没被动过。
 *    不能拿「重排后重新检测出的 dropSec」去比：drop 常是一片能量平台
 *    （实测某首片尾最强的几个小节只差 7%），检测器会改选隔壁小节，
 *    报出十几拍的假误差，把本来正确的重排判成失败。
 */
describe('乐句重排 (sync/surgery)', () => {
  const rel = 'music/_test-surgery.wav';
  const abs = path.join(process.cwd(), 'public', rel);

  /** 造一段有明确主高潮和第二高潮的立体声素材 */
  function make(): boolean {
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      execFileSync(
        'ffmpeg',
        ['-y',
         '-f', 'lavfi', '-i', 'sine=frequency=110:duration=40',
         '-f', 'lavfi', '-i', 'sine=frequency=440:duration=40',
         '-filter_complex', '[0:a][1:a]join=inputs=2:channel_layout=stereo',
         '-ar', '44100', abs],
        { stdio: 'ignore' }
      );
      return fs.existsSync(abs);
    } catch (e) {
      if (!/ENOENT|not found/i.test(String(e))) throw e;
      return false;
    }
  }

  it('产物保住立体声（不能把两个声道写成同一路）', () => {
    if (!make()) return;
    try {
      const src = decodeStereo(abs);
      assert.ok(src, '测试素材解不开');
      let srcDiff = 0;
      for (let i = 0; i < src.L.length; i += 97) srcDiff += Math.abs(src.L[i] - src.R[i]);
      assert.ok(srcDiff > 0, '测试素材本身就该是双声道不同的');

      // 直接验拼接函数：两路各剪一次，结果必须仍然左右不同
      const half = Math.floor(src.L.length / 2);
      const L = spliceAudioWithCrossfade(src.L.slice(0, half), src.L.slice(half));
      const R = spliceAudioWithCrossfade(src.R.slice(0, half), src.R.slice(half));
      let outDiff = 0;
      for (let i = 0; i < Math.min(L.length, R.length); i += 97) outDiff += Math.abs(L[i] - R[i]);
      assert.ok(outDiff > 0, '剪完两个声道变成一样了 —— 立体声被压掉');
    } finally {
      fs.rmSync(abs, { force: true });
      fs.rmSync(abs.replace(/\.wav$/, '-surgery.wav'), { force: true });
    }
  });

  it('刀口在 drop 之后时，不以「重新检测出的 drop」为判据', () => {
    // 这条是对判据本身的约束：能量平台上重新检测必然会改选，
    // 所以 runSurgery 的失败原因里，drop 那一项应当显示「未受影响」而不是一个大误差。
    // 用源码断言：验证逻辑必须按刀口位置短路，而不是无条件比对 dropSec。
    const src = fs.readFileSync(
      path.join(process.cwd(), 'scripts', 'sync', 'surgery.ts'),
      'utf-8'
    );
    assert.match(
      src,
      /const dropIntact = recipe\.cutSec > grid\.dropSec/,
      'runSurgery 必须按「刀口是否在 drop 之后」短路，而不是直接比对重测的 dropSec'
    );
  });
});

/**
 * 段落偏好的规则（§18.3）：drop 段和尾奏不许设成「少用」。
 * 工作台界面会拦，但命令行 / API 能绕过界面，所以后端必须再查一遍。
 */
describe('段落偏好校验 (epidemic/recipes)', () => {
  const grid = {
    totalSec: 120,
    dropSec: 50,
    barSec: 2,
    sections: [
      { kind: 'intro', startSec: 0, endSec: 20, bars: 8, energy: 0.3 },
      { kind: 'verse', startSec: 20, endSec: 50, bars: 12, energy: 0.6 },
      { kind: 'drop', startSec: 50, endSec: 80, bars: 12, energy: 1 },
      { kind: 'bridge', startSec: 80, endSec: 105, bars: 10, energy: 0.4 },
      { kind: 'outro', startSec: 105, endSec: 120, bars: 6, energy: 0.1 },
    ],
  } as never;

  it('少用 intro / bridge 合法；多用 drop 合法', async () => {
    const { validatePreferences } = await import('../../scripts/epidemic/recipes.js');
    assert.deepEqual(
      validatePreferences(
        [
          { fromSec: 0, toSec: 20, preference: 'less' },
          { fromSec: 82, toSec: 100, preference: 'less' },
          { fromSec: 50, toSec: 80, preference: 'more' },
        ],
        grid
      ),
      []
    );
  });

  it('少用压到 drop 或尾奏 —— 哪怕只压到一点 —— 都要报错', async () => {
    const { validatePreferences } = await import('../../scripts/epidemic/recipes.js');
    assert.equal(validatePreferences([{ fromSec: 40, toSec: 55, preference: 'less' }], grid).length, 1);
    assert.equal(validatePreferences([{ fromSec: 100, toSec: 110, preference: 'less' }], grid).length, 1);
    assert.match(validatePreferences([{ fromSec: 60, toSec: 70, preference: 'less' }], grid)[0], /drop/);
  });

  it('drop 不在段落边界上（没有 drop 标签）时，drop 点起 4 小节照样受保护', async () => {
    const { validatePreferences } = await import('../../scripts/epidemic/recipes.js');
    // 实测样本：drop 在 93.46s，落在标成 build 的段里，段落表里没有 drop 段
    const g = {
      totalSec: 117,
      dropSec: 93.46,
      barSec: 1.6,
      sections: [
        { kind: 'verse', startSec: 67.7, endSec: 77.4, bars: 6, energy: 0.6 },
        { kind: 'build', startSec: 77.4, endSec: 95.1, bars: 11, energy: 0.8 },
        { kind: 'outro', startSec: 101.5, endSec: 117, bars: 9, energy: 0.1 },
      ],
    } as never;
    const errs = validatePreferences([{ fromSec: 85, toSec: 97, preference: 'less' }], g);
    assert.equal(errs.length, 1, '在 drop 点上设少用必须被拦下');
    assert.match(errs[0], /drop/);
    // 离 drop 足够远的 build 前半段可以设少用
    assert.deepEqual(validatePreferences([{ fromSec: 78, toSec: 88, preference: 'less' }], g), []);
  });

  it('起止颠倒、越过曲长都要报错', async () => {
    const { validatePreferences } = await import('../../scripts/epidemic/recipes.js');
    assert.equal(validatePreferences([{ fromSec: 30, toSec: 10, preference: 'more' }], grid).length, 1);
    assert.equal(validatePreferences([{ fromSec: 110, toSec: 140, preference: 'more' }], grid).length, 1);
  });
});
