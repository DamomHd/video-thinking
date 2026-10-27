import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { beatGrid, snapToBeat, onBeats, camelotTonic, scaleSemis, sequenceSpots } from './beats.js';
import { MusicFile, SyncFile } from './types.js';

const music = (bpm: number, inSec = 0, startFrom = 0): MusicFile =>
  ({ version: 2, cues: [{ id: 'c1', label: 'x', in: { ref: 'SC.a', sec: inSec }, out: { ref: 'SC.end', sec: 10 }, startFromSec: startFrom, volume: 1, fadeInSec: 0, fadeOutSec: 0, track: { id: 't', title: 't', bpm, file: 'x.wav', durationSec: 10 } }] }) as unknown as MusicFile;

describe('节拍网格与序列音效 (shared/beats)', () => {
  it('120 BPM：每 0.5 秒一拍，每 4 拍一个小节头', () => {
    const g = beatGrid(music(120));
    assert.deepEqual(g.beats.slice(0, 5), [0, 0.5, 1, 1.5, 2]);
    assert.deepEqual(g.downbeats.slice(0, 3), [0, 2, 4]);
  });

  it('素材起点 startFromSec 让拍相位后移；对拍映射把放映秒换回乐谱秒', () => {
    assert.equal(beatGrid(music(120, 0, 0.25)).beats[0], 0.25);
    const sync = { knots: [[0, 0], [10, 20]], anchors: [], report: { scoreSync: 0, lockedCount: 0, downgradedCount: 0, droppedCount: 0 } } as unknown as SyncFile;
    // 放映时间被拉长一倍：放映第 1 秒的拍 = 乐谱第 0.5 秒
    assert.equal(beatGrid(music(60), sync).beats[1], 0.5);
  });

  it('吸附到最近的拍 / 半拍；从某时刻起每隔几拍取 n 个落点', () => {
    const g = beatGrid(music(120));
    assert.equal(snapToBeat(1.2, g), 1);
    assert.equal(snapToBeat(1.2, g, 2), 1.25);
    assert.deepEqual(onBeats(1.1, 3, g), [1.5, 2, 2.5]);
    assert.deepEqual(onBeats(1.1, 3, g, { sub: 2 }), [1.25, 1.5, 1.75]);
    assert.deepEqual(onBeats(0.1, 2, g, { downbeatsOnly: true }), [2, 4]);
  });

  it('Camelot 调号：8B = C 大调、8A = A 小调、9B = G 大调', () => {
    assert.deepEqual(camelotTonic('8B'), { semisFromA: 3, minor: false });
    assert.deepEqual(camelotTonic('8A'), { semisFromA: 0, minor: true });
    assert.equal(camelotTonic('9B').semisFromA, 10);
  });

  it('序列音高：大调五声音阶逐个上行，全部落在调内', () => {
    const semis = Array.from({ length: 6 }, (_, i) => scaleSemis(i, 6, { key: '8B' }));
    // C 大调五声（C D E G A）相对 A4：C5 = +3
    assert.deepEqual(semis, [3, 5, 7, 10, 12, 15]);
    const cMajor = new Set([0, 2, 4, 5, 7, 9, 11]);
    for (const s of semis) assert.ok(cMajor.has((((s - 3) % 12) + 12) % 12));
    assert.deepEqual(Array.from({ length: 3 }, (_, i) => scaleSemis(i, 3, { key: '8B', contour: 'down' })), [7, 5, 3]);
  });

  it('sequenceSpots：每个落点一条，带变调和序号', () => {
    const spots = sequenceSpots({ id: '卡片', times: [1, 1.5, 2], slot: 'pluck', layer: 'UI', what: '卡片入场', key: '8B' });
    assert.equal(spots.length, 3);
    assert.deepEqual(spots.map((s) => s.pitchSemis), [3, 5, 7]);
    assert.equal(spots[2].id, '卡片 3');
  });
});

import { frameFadeAt, fadeAt } from './audio-math.js';
import { pitchedRel } from './pitch.js';

describe('渲染端的帧淡化与变调文件 (audio-math.frameFadeAt / pitch)', () => {
  it('第 0 帧不再被整帧静音（按帧起点算的 fadeAt 在第 0 帧是 0）', () => {
    assert.equal(fadeAt(0, 1, 0.02, 0.02), 0, '旧口径：第 0 帧系数 0 → 起音那一帧被吃掉');
    assert.ok(frameFadeAt(0, 30, 1, 0.02, 0.02) > 0.99, '新口径：淡入短于一帧时第 0 帧满音量');
    assert.ok(frameFadeAt(0, 60, 1, 0.1, 0) > 0 && frameFadeAt(0, 60, 1, 0.1, 0) < 1, '长淡入：第 0 帧是淡入的一部分，不是 0');
  });

  it('淡出按帧首取：最后一帧还有声音，超出时长才归零', () => {
    const fps = 30;
    const dur = 1;
    const lastFrame = Math.floor(dur * fps) - 1;
    assert.ok(frameFadeAt(lastFrame, fps, dur, 0, 0.1) > 0);
    assert.equal(frameFadeAt(lastFrame + 2, fps, dur, 0, 0.1), 0);
  });

  it('变调文件命名：0 半音原样；正负半音带符号', () => {
    assert.equal(pitchedRel('sfx-lib/epidemic/abTick.wav', 0), 'sfx-lib/epidemic/abTick.wav');
    assert.equal(pitchedRel('sfx-lib/epidemic/abTick.wav', 3), 'sfx-lib/pitched/abTick.p+3.wav');
    assert.equal(pitchedRel('public/sfx-lib/epidemic/abTick.wav', -2), 'sfx-lib/pitched/abTick.p-2.wav');
  });
});
