import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { voiceDuckTriggers, voiceSubtitles, voiceTtsLines, voiceOverlaps, VO_DUCK_DB, voiceGainDb } from './voice';
import { duckAt } from './audio-math';
import { parseAsrReport } from '../../scripts/py/voice-film';
import type { VoiceFile } from './types';

const V: VoiceFile = {
  engine: 'edge',
  voice: 'zh-CN-YunxiNeural',
  lines: [
    { id: 'a', text: '第一句', sec: 2, file: 'voice/x/a.wav', durSec: 1.0 },
    { id: 'b', text: '第二句话稍微长一点', sec: 3.5, file: 'voice/x/b.wav', durSec: 2.5, say: '第二句话稍微长一点' },
    { id: 'c', text: '还没配音', sec: 9 },
  ],
};

describe('口播（可选 VO 层）', () => {
  it('配乐让位：每句一个触发，经对拍映射到放映时间；口播期间压 −10 dB，前后不压；没配音的句子不触发', () => {
    const tr = voiceDuckTriggers(V, (s) => s + 0.5);
    assert.equal(tr.length, 2);
    assert.equal(tr[0].triggerStartSec, 2.5);
    const g = (t: number) => 20 * Math.log10(duckAt(t, 'MUSIC', tr));
    assert.ok(Math.abs(g(3.0) - VO_DUCK_DB) < 1e-6);
    assert.equal(duckAt(1.0, 'MUSIC', tr), 1);
    assert.equal(duckAt(3.0, 'UI', tr), 1);
    assert.deepEqual(voiceDuckTriggers(undefined, (s) => s), []);
  });
  it('字幕：至少 1.8s、不短于念完 + 0.6s，和下一句重叠就截到下一句开头', () => {
    const c = voiceSubtitles(V, (s) => s);
    assert.deepEqual(c, [
      { t0: 2, t1: 3.5, text: '第一句' },
      { t0: 3.5, t1: 6.6, text: '第二句话稍微长一点' },
    ]);
  });
  it('交给配音脚本的清单：缺省声音、say；kokoro 的中文标 lang=cmn', () => {
    assert.equal(voiceTtsLines(V)[1].say, '第二句话稍微长一点');
    assert.equal(voiceTtsLines(V)[0].voice, 'zh-CN-YunxiNeural');
    assert.equal(voiceTtsLines({ ...V, engine: 'kokoro' })[0].lang, 'cmn');
  });
  it('前句没念完后句就开口', () => {
    assert.deepEqual(voiceOverlaps([{ id: 'x', text: '', sec: 0, durSec: 2 }, { id: 'y', text: '', sec: 1.5, durSec: 1 }]), [['x', 'y']]);
  });
  it('转写核对报告：逐句 OK / DIFF', () => {
    assert.deepEqual(parseAsrReport('OK   a | x → x\nDIFF b | y → z    (similarity 0.6 < 0.92)\nmismatches: 1'), { a: true, b: false });
  });
});

it('voiceGainDb：拉到 −18 dB 要加多少；夹在 ±18 dB；静音不动', () => {
  assert.equal(voiceGainDb(-26.3), 8.3);
  assert.equal(voiceGainDb(-60), 18);
  assert.equal(voiceGainDb(-Infinity), 0);
});
