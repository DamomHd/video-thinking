import { defineScore, ScoreNote, ScoreGrid } from '../../../shared/score';

/**
 * 报销台（虚构产品演示）· 原创配乐《一张张接住 · Catch One by One》
 *
 * 沿用 product-story 风格 §7：安静、温和、偏室内乐、节拍感不强（100–112 BPM）。
 * 调性：7B（F 大调，暖、稳定）· 速度：104 BPM
 * 动机：「接住」——两音上行（F→Ab，小三度，厚重托起感），
 *   01 现一次、02 流程走完时回一次、05 数字墙落定时升一个八度回来。
 * 配器：拨弦（marimba 接住感）+ 竖琴（harp 流动感）+ 轻弦乐铺底（cellos）；
 *   03 暗场换低频长音（cellos + synth:sub）+ 钟琴单音（synth:bell）+ 一次重拍（timpani，climax2 前静默半小节）。
 * 画面先行（lock: false），贴着 g.hit() 视觉拍点写，不拉伸。
 */
export default defineScore({
  title: '一张张接住 · Catch One by One',
  grid: {
    bpm: 104,
    key: '7B', // F 大调
    lock: false, // 画面先行，贴着 g.hit() 视觉拍点写
    sections: [
      { id: 'open', bars: 3, label: '01 一份报销' },
      { id: 'flow', bars: 4, label: '02 一句话走完流程' },
      { id: 'stage', bars: 2.5, label: '03 暗场一亮' },
      { id: 'twin', bars: 2.5, label: '04 两个出口' },
      { id: 'numbers', bars: 2, label: '05 数字墙' },
    ],
  },
  room: { size: 0.45, mix: 0.18 },
  tailSec: 2.0,

  notes: (g: ScoreGrid): ScoreNote[] => {
    const list: ScoreNote[] = [];

    // ----------------------------------------------------
    // 01 一份报销 (0.0s – 7.0s)：暖纸的安静
    // ----------------------------------------------------
    // 竖琴清亮琶音下行铺底 + 大提琴低音长音
    list.push(
      { t: 0.4, dur: 1.8, pitch: 'A5', inst: 'harp', vel: 0.55 },
      { t: 0.8, dur: 1.6, pitch: 'F5', inst: 'harp', vel: 0.52 },
      { t: 1.2, dur: 1.4, pitch: 'C5', inst: 'harp', vel: 0.50 },
      { t: 0.4, dur: 5.0, pitch: 'F2', inst: 'cellos', vel: 0.42 }
    );

    // 3.0s 荧光笔划过超标行：动机「接住」第一次出现（F→Ab 小三度上行，marimba）
    const tHl = g.hit('K.highlight');
    list.push(
      { t: tHl, dur: 0.5, pitch: 'F4', inst: 'marimba', vel: 0.62 },
      { t: tHl + 0.18, dur: 0.6, pitch: 'Ab4', inst: 'marimba', vel: 0.65 },
      { t: tHl + 0.4, dur: 1.2, pitch: 'C5', inst: 'harp', vel: 0.50 },
      { t: tHl + 0.6, dur: 1.8, pitch: 'Ab3', inst: 'cellos', vel: 0.42 }
    );

    // 4.0–7.0s 动机延续 + 竖琴琶音铺底（铺满 open 段，避免静音 > 15%）
    list.push(
      { t: 4.2, dur: 2.6, pitch: 'F3', inst: 'cellos', vel: 0.40 },
      { t: 4.6, dur: 1.2, pitch: 'A4', inst: 'harp', vel: 0.44 },
      { t: 5.0, dur: 0.9, pitch: 'F4', inst: 'marimba', vel: 0.45 },
      { t: 5.2, dur: 1.0, pitch: 'C5', inst: 'harp', vel: 0.42 },
      { t: 5.8, dur: 1.0, pitch: 'F5', inst: 'harp', vel: 0.44 },
      { t: 6.4, dur: 0.9, pitch: 'C5', inst: 'marimba', vel: 0.45 },
      { t: 6.7, dur: 0.9, pitch: 'A4', inst: 'marimba', vel: 0.43 }
    );

    // ----------------------------------------------------
    // 02 一句话走完流程 (7.0s – 16.0s)：界面在工作的轻盈
    // ----------------------------------------------------
    // 拨弦轻快律动打底（F 大调音阶 F-A-C-F）
    const flowMotif = ['F4', 'A4', 'C5', 'F5'];
    flowMotif.forEach((n, idx) => {
      list.push({ t: 7.6 + idx * 0.288, dur: 0.24, pitch: n, inst: 'marimba', vel: 0.50 });
    });

    // flow 段贯穿铺底（F3 长音，盖住四步之间的间隙，避免静音 > 15%）
    list.push({ t: 7.0, dur: 9.0, pitch: 'F3', inst: 'cellos', vel: 0.50 });

    // 四步卡落定踩拍（调内上行 F→A→C→F），贴着画面拍点
    const stepHits = ['K.cardIdentify', 'K.cardCompare', 'K.cardLocate', 'K.cardReport'];
    const stepPitches = ['F4', 'A4', 'C5', 'F5'];
    stepHits.forEach((id, i) => {
      const t = g.hit(id);
      list.push(
        { t, dur: 0.4, pitch: stepPitches[i], inst: 'marimba', vel: 0.62 },
        { t, dur: 0.3, pitch: 'F3', inst: 'cellos', vel: 0.40 }
      );
    });

    // 四步之间的间隙用竖琴琶音填充（每个 stepHit 后补音，避免连续静音）
    stepHits.forEach((id, i) => {
      const t = g.hit(id);
      list.push({ t: t + 0.7, dur: 0.5, pitch: stepPitches[i], inst: 'harp', vel: 0.46 });
      list.push({ t: t + 1.1, dur: 0.4, pitch: 'A4', inst: 'harp', vel: 0.44 });
    });

    // 流程走完，动机「接住」回来一次（升一个八度）
    const tReport = g.hit('K.cardReport');
    list.push(
      { t: tReport + 0.4, dur: 0.5, pitch: 'F5', inst: 'marimba', vel: 0.60 },
      { t: tReport + 0.58, dur: 0.6, pitch: 'Ab5', inst: 'marimba', vel: 0.62 },
      { t: tReport + 0.2, dur: 2.0, pitch: 'C4', inst: 'harp', vel: 0.48 }
    );

    // ----------------------------------------------------
    // 03 暗场一亮 (16.0s – 21.0s)：低频长音 + 钟琴 + climax2 重拍
    // ----------------------------------------------------
    // 进暗场：低频长音先进来（15.5s 起渐入，盖过切点）
    list.push(
      { t: 15.5, dur: 5.5, pitch: 'F2', inst: 'cellos', vel: 0.55 },
      { t: 15.5, dur: 5.5, pitch: 'F1', inst: 'synth:sub', vel: 0.45 }
    );

    // climax2 重拍前静默半小节（约 1.15s）→ 18.5s 重拍
    const tHeavy = g.hit('K.frameHeavy');
    list.push(
      { t: tHeavy, dur: 2.8, pitch: 'F2', inst: 'timpani', vel: 0.88 },
      { t: tHeavy, dur: 3.5, pitch: 'F2', inst: 'cellos', vel: 0.75 },
      { t: tHeavy, dur: 2.0, pitch: 'C6', inst: 'synth:bell', vel: 0.82 },
      { t: tHeavy + 0.6, dur: 1.8, pitch: 'F5', inst: 'synth:bell', vel: 0.70 }
    );

    // ----------------------------------------------------
    // 04 两个出口 (21.0s – 27.0s)：同源同秒的清透
    // ----------------------------------------------------
    // 动机回到原八度，弦乐铺底
    const tTwin = g.hit('K.twinDrop');
    list.push(
      { t: 21.0, dur: 5.5, pitch: 'F3', inst: 'cellos', vel: 0.45 },
      { t: tTwin, dur: 0.5, pitch: 'F4', inst: 'marimba', vel: 0.58 },
      { t: tTwin + 0.18, dur: 0.6, pitch: 'Ab4', inst: 'marimba', vel: 0.60 },
      { t: tTwin + 0.4, dur: 1.4, pitch: 'C5', inst: 'harp', vel: 0.52 },
      { t: tTwin + 2.0, dur: 1.2, pitch: 'A4', inst: 'harp', vel: 0.48 }
    );

    // ----------------------------------------------------
    // 05 数字墙 (27.0s – 32.0s)：结论前的张力 → 落定释怀
    // ----------------------------------------------------
    // 28.0s 8,600 落定（hero-hit）：动机升八度回来 + 重拍
    const tNum = g.hit('K.num5280');
    list.push(
      { t: 27.0, dur: 4.5, pitch: 'F2', inst: 'cellos', vel: 0.50 },
      { t: tNum, dur: 2.5, pitch: 'F2', inst: 'timpani', vel: 0.85 },
      { t: tNum, dur: 0.5, pitch: 'F5', inst: 'marimba', vel: 0.68 },
      { t: tNum + 0.18, dur: 0.6, pitch: 'Ab5', inst: 'marimba', vel: 0.70 },
      { t: tNum, dur: 1.8, pitch: 'C6', inst: 'synth:bell', vel: 0.78 }
    );

    // 后三个数字（124 / 0 / 31）按四度上行 pluck
    const numPitches = ['Bb4', 'F4', 'F5'];
    // num47 / num0 / num38 没有单独的 hit，用 num5280 后的等间距外推（1s 一个）
    [1.0, 2.0, 2.5].forEach((off, i) => {
      list.push({ t: tNum + off, dur: 0.4, pitch: numPitches[i], inst: 'marimba', vel: 0.60 });
    });

    // 30.5s logo 落版（num38）：大调和弦释怀
    const tFinal = g.hit('K.num38');
    list.push(
      { t: tFinal, dur: 3.0, pitch: 'F2', inst: 'timpani', vel: 0.80 },
      { t: tFinal, dur: 3.2, pitch: 'F3', inst: 'cellos', vel: 0.70 },
      { t: tFinal, dur: 3.0, pitch: 'A4', inst: 'violins', vel: 0.75 },
      { t: tFinal, dur: 3.2, pitch: 'C5', inst: 'violins', vel: 0.78 },
      { t: tFinal, dur: 3.0, pitch: 'F5', inst: 'violins', vel: 0.80 }
    );

    // 竖琴琶音缓缓沉入平静
    ['F3', 'A3', 'C4', 'F4', 'A4', 'C5'].forEach((p, i) => {
      list.push({ t: tFinal + 0.3 + i * 0.15, dur: 2.0, pitch: p, inst: 'harp', vel: 0.55 });
    });

    return list;
  },
});
