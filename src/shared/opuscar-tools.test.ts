/**
 * 从 lemo-opuscar 借来的三件工具（纯函数部分）：读字检查、响度母带、采样配器
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readNeedSec, readRuns, readViolations, readKey } from '../../scripts/guard/readcheck';
import { chainFor, parseEbur, MASTER_TP } from '../../scripts/render/master';
import { sampledEvents, velocityAt, PLANS, ORCHESTRAS } from '../../scripts/composer/sampled';
import { generateStructuredScoreAbc } from '../../scripts/composer/structure';

describe('读字检查', () => {
  it('需要的时间：中文 ÷4.5、其它 ÷15、再加 1.5s，不少于 1.5s', () => {
    assert.equal(readNeedSec('一二三四五六七八九'), 2 + 1.5);
    assert.equal(readNeedSec('abc def ghi jkl mno'), 15 / 15 + 1.5);
    assert.equal(readNeedSec(''), 1.5);
    assert.equal(readKey('652,445 单'), '###,### 单');
  });

  const box = [100, 100, 400, 140];
  const f = (sec: number, texts: { text: string; readable?: boolean; box?: number[] }[]) => ({
    sec,
    texts: texts.map((t) => ({ text: t.text, readable: t.readable ?? true, box: (t.box ?? box) as [number, number, number, number] })),
  });

  it('连续可读的帧连成一段；中间短暂的空隙不断开；计数跳动算同一段', () => {
    const frames = [f(0, [{ text: '计数 10' }]), f(0.2, [{ text: '计数 20' }]), f(0.4, []), f(0.6, [{ text: '计数 30' }])];
    const runs = readRuns(frames, 0.2);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].held, 0.8);
    assert.equal(runs[0].text, '计数 30');
  });

  it('停留不够的报出来；同一位置马上换成别的字（过渡态）不报；同一段字别处停够了也不报', () => {
    const frames = [
      f(0, [{ text: '一闪而过的中间态' }]),
      f(0.2, [{ text: '落定的结论文字', box: [100, 100, 400, 140] }]),
      ...[0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0].map((s) => f(s, [{ text: '落定的结论文字' }])),
      f(3.2, [{ text: '太短的旁注字很多很多', box: [800, 800, 1200, 840] }]),
    ];
    const runs = readRuns(frames, 0.2);
    const v = readViolations(runs, 0.2);
    assert.deepEqual(v.map((r) => r.text), ['太短的旁注字很多很多']);
  });
});

describe('响度母带', () => {
  it('限幅上限 = 目标真峰 − 增益 − 余量；增益为负时不限幅（上限 0 dB）', () => {
    const lin = (g: number) => Number(chainFor(g).match(/limit=([\d.]+)/)![1]);
    assert.ok(Math.abs(20 * Math.log10(lin(5)) - (MASTER_TP - 1.0 - 5)) < 0.01);
    assert.equal(lin(-3), 1);
    assert.match(chainFor(2), /latency=true/);
  });
  it('ebur128 汇总：取最后一次的整合响度和峰值', () => {
    const s = 'I: -70.0 LUFS\n...\n  Integrated loudness:\n    I:         -19.2 LUFS\n  True peak:\n    Peak:       -2.9 dBFS\n';
    assert.deepEqual(parseEbur(s), { i: -19.2, tp: -2.9 });
  });
});

describe('采样配器', () => {
  const s = generateStructuredScoreAbc({ bpm: 117, totalSec: 30, dropSec: 28.7 });
  it('同一份谱、同一个方案，事件一样；高潮那一刻有大鼓、起势小节有吊镲渐强', () => {
    const a = sampledEvents(s.abc, 'cinematic', 30);
    assert.deepEqual(a, sampledEvents(s.abc, 'cinematic', 30));
    assert.ok(a.dropSec !== null && Math.abs(a.dropSec - 28.7) < 0.05);
    assert.ok(a.events.some((e) => e.inst === 'gran_cassa' && Math.abs(e.t - a.dropSec!) < 1e-3));
    const cresc = a.events.find((e) => e.inst === 'sus_cymbal' && e.pitch === 'cresc');
    assert.ok(cresc && cresc.t < a.dropSec! && Math.abs(cresc.t + (cresc.dur ?? 0) - a.dropSec! - 0.05) < 1e-3);
    assert.ok(a.events.every((e) => e.t >= 0 && e.t < 30 && e.vel > 0 && e.vel <= 1));
  });
  it('力度离高潮越近越强，高潮段最强，收尾回落', () => {
    assert.ok(velocityAt(1, 28, 30) < velocityAt(20, 28, 30));
    assert.equal(velocityAt(28.5, 28, 40), 0.95);
    assert.ok(velocityAt(39.9, 28, 40) < 0.6);
  });
  it('三个配器方案都给全了各声部', () => {
    for (const o of ORCHESTRAS) {
      const p = PLANS[o];
      assert.ok(p.melody.long.length && p.bass.long.length && p.pad.long.length && p.kick.length, o);
    }
  });
});

describe('中段「静 → 爆」（第二高潮 climax2）', () => {
  it('谱里在第二高潮前写静默 2 拍、到它写标记；落在最近的拍上；太靠前 / 进了起势小节就不写', async () => {
    const { parseAbc, applyStops } = await import('../../scripts/composer/abc');
    const s = generateStructuredScoreAbc({ bpm: 117, totalSec: 30, dropSec: 28.7, climax2Sec: 20.6 });
    const beat = (s.dropAtSec / (s.dropBar * 4));
    assert.ok(s.climax2AtSec !== undefined && Math.abs(s.climax2AtSec - 20.6) <= beat / 2 + 1e-6);
    assert.ok(Math.abs(s.climax2AtSec! - s.stopAtSec! - 2 * beat) < 1e-3);
    const sc = parseAbc(s.abc);
    const stop = sc.cues.find((c) => c.type === 'stop')!;
    assert.equal(stop.durBeats, 2);
    assert.ok(sc.cues.some((c) => c.type === 'mark' && c.name === 'hit2' && c.beat === stop.beat + 2));
    // 落实静默：窗口里没有起音的音符，也没有延续进窗口的音符
    for (const e of applyStops(sc)) assert.ok(e.beat + e.durBeats <= stop.beat + 1e-9 || e.beat >= stop.beat + 2 - 1e-9);
    assert.equal(generateStructuredScoreAbc({ bpm: 117, totalSec: 30, dropSec: 28.7, climax2Sec: 1 }).climax2AtSec, undefined);
    assert.equal(generateStructuredScoreAbc({ bpm: 117, totalSec: 30, dropSec: 28.7, climax2Sec: 27.5 }).climax2AtSec, undefined);
  });
  it('采样演奏：静默窗口里没有乐器事件（除了第二高潮之前不该有的），第二高潮有重拍且比主高潮轻', () => {
    const s = generateStructuredScoreAbc({ bpm: 117, totalSec: 30, dropSec: 28.7, climax2Sec: 20.6 });
    const { events } = sampledEvents(s.abc, 'cinematic', 30);
    assert.ok(!events.some((e) => e.t >= s.stopAtSec! + 1e-3 && e.t < s.climax2AtSec! - 1e-3));
    const at2 = events.filter((e) => Math.abs(e.t - s.climax2AtSec!) < 1e-3 && e.inst === 'gran_cassa');
    const at1 = events.filter((e) => Math.abs(e.t - s.dropAtSec) < 1e-3 && e.inst === 'gran_cassa');
    assert.equal(at2.length, 1);
    assert.ok((at2[0].gain ?? 1) < (at1[0].gain ?? 1));
  });
});

describe('成片质量：字幕、压字、频段、CREDITS', () => {
  it('字幕：区间内显示，前后淡入淡出；区间外不显示', async () => {
    const { subtitleAt } = await import('../components/Subtitles');
    const cues = [{ t0: 1, t1: 3, text: 'a' }];
    assert.equal(subtitleAt(cues, 0.9, 0.2), null);
    assert.equal(subtitleAt(cues, 2, 0.2)!.alpha, 1);
    assert.ok(Math.abs(subtitleAt(cues, 1.1, 0.2)!.alpha - 0.5) < 1e-9);
    assert.equal(subtitleAt(cues, 3, 0.2), null);
  });
  it('字幕压字：字幕框盖住别的字超过 10% 才算，连续的帧连成一段', async () => {
    const { subtitleCovers } = await import('../../scripts/guard/readcheck');
    const sub = { text: '字幕', box: [300, 940, 1600, 1010] as [number, number, number, number], readable: true, sub: true };
    const under = { text: '被压住的说明', box: [140, 930, 700, 970] as [number, number, number, number], readable: true };
    const clear = { text: '标题', box: [140, 120, 900, 300] as [number, number, number, number], readable: true };
    const frames = [0, 0.2, 0.4, 2.0].map((sec) => ({ sec, texts: [sub, under, clear] }));
    assert.deepEqual(subtitleCovers(frames, 0.2), [
      { from: 0, to: 0.6, text: '被压住的说明' },
      { from: 2, to: 2.2, text: '被压住的说明' },
    ]);
  });
  it('频段结论：−3 附近正常，高于 0 偏闷，低于 −9 偏薄', async () => {
    const { bandVerdict } = await import('../../scripts/render/verify');
    assert.equal(bandVerdict(-3).ok, true);
    assert.equal(bandVerdict(1.2).ok, false);
    assert.equal(bandVerdict(-11).ok, false);
    assert.equal(bandVerdict(null).ok, true);
  });
  it('CREDITS：只列外部素材；采样配乐带署名行；CC BY 单列；口播写引擎', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { buildCredits } = await import('../../scripts/render/credits');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'credits-'));
    const audio = path.join(root, 'src/films/x/audio');
    fs.mkdirSync(audio, { recursive: true });
    fs.writeFileSync(path.join(root, 'src/films/x/index.tsx'), "import { PaintCanvas } from '../../components/paint';");
    fs.writeFileSync(path.join(audio, 'manifest.json'), JSON.stringify({ a: [{ title: '本地合成' }], b: [{ title: 'Boom — Someone', author: 'Someone', source: 'freesound', license: 'http://creativecommons.org/licenses/by/4.0/', url: 'https://f/1' }] }));
    fs.writeFileSync(path.join(audio, 'music.json'), JSON.stringify({ cues: [{ label: '主配乐', track: { title: '采样', source: 'local-sampled', license: 'Salamander Grand Piano V3 by Alexander Holm (CC BY 3.0) / Samples (CC0): VSCO' } }] }));
    fs.writeFileSync(path.join(audio, 'voice.json'), JSON.stringify({ engine: 'edge', voice: 'zh-CN-YunxiNeural', lines: [] }));
    const c = buildCredits('x', root);
    const md = fs.readFileSync(c.file, 'utf-8');
    assert.ok(md.includes('Boom — Someone（freesound，CC BY 4.0）') && !md.includes('- 本地合成'));
    assert.ok(md.includes('Salamander') && md.includes('edge-tts') && md.includes('ClaudeAnimationBase'));
    assert.equal(c.ccby.length, 2);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('字体落地', () => {
  it('slug、中日韩字体判断、Google Fonts CSS 解析、片子用到的中文字', async () => {
    const { fontSlug, isCjkFamily, parseFontCss, filmCjkText } = await import('../../scripts/look/fonts');
    assert.equal(fontSlug('Cormorant Garamond'), 'cormorant-garamond');
    assert.ok(isCjkFamily('Noto Serif SC') && isCjkFamily('ZCOOL KuaiLe') && isCjkFamily('LXGW WenKai TC'));
    assert.ok(!isCjkFamily('Inter') && !isCjkFamily('JetBrains Mono'));
    const css = "/* latin */\n@font-face {\n  font-family: 'Inter';\n  font-style: normal;\n  font-weight: 600;\n  src: url(https://x/a.woff2) format('woff2');\n  unicode-range: U+0000-00FF, U+0131;\n}\n";
    assert.deepEqual(parseFontCss(css), [{ family: 'Inter', weight: '600', style: 'normal', unicodeRange: 'U+0000-00FF, U+0131', url: 'https://x/a.woff2' }]);
    const text = filmCjkText('us');
    assert.ok(text.includes('系') && text.includes('。') && text.includes('0'));
    assert.equal(new Set(text).size, [...text].length);
  });
});
