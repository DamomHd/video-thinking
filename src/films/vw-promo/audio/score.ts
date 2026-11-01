import { defineScore, ScoreNote, ScoreGrid } from '../../../shared/score';

/**
 * 视频工作台 (vw-promo) · 原创专属配乐《确定性之声 · Deterministic Flow》
 *
 * 调性：11B（A 大调）· 速度：104 BPM（每拍约 0.577s，4 拍一小节约 2.308s）
 */
export default defineScore({
  title: '确定性之声 · Deterministic Flow',
  grid: {
    bpm: 104,
    key: '11B', // A 大调
    lock: false, // 画面先行，贴着 g.hit() 视觉拍点写
    sections: [
      { id: 'pain', bars: 4, label: '01 痛点叙述' },
      { id: 'workbench', bars: 4, label: '02 实机运转' },
      { id: 'engine', bars: 4, label: '03 底座光柱' },
      { id: 'delivery', bars: 4, label: '04 工业交付' },
    ],
  },
  room: { size: 0.45, mix: 0.18 },
  tailSec: 2.0,

  notes: (g: ScoreGrid): ScoreNote[] => {
    const list: ScoreNote[] = [];

    // ----------------------------------------------------
    // 第 1 幕：痛点单据 (0.0s – 8.0s)
    // ----------------------------------------------------
    // 纸面展开，竖琴清亮琶音下行
    list.push(
      { t: 0.4, dur: 1.8, pitch: 'E5', inst: 'harp', vel: 0.65 },
      { t: 0.8, dur: 1.6, pitch: 'C#5', inst: 'harp', vel: 0.62 },
      { t: 1.2, dur: 1.4, pitch: 'A4', inst: 'harp', vel: 0.60 },
      // 大提琴低音打底 (A2 长音)
      { t: 0.4, dur: 4.0, pitch: 'A2', inst: 'cellos', vel: 0.50 }
    );

    // 2.0s 驳回印章：定音鼓顿音 + 大提琴沉重下潜到 F#2
    const tStampPain = g.hit('hit-stamp-pain');
    list.push(
      { t: tStampPain, dur: 2.2, pitch: 'A2', inst: 'timpani', vel: 0.75 },
      { t: tStampPain, dur: 3.5, pitch: 'F#2', inst: 'cellos', vel: 0.60 },
      { t: tStampPain + 0.5, dur: 1.2, pitch: 'C#4', inst: 'harp', vel: 0.55 },
      { t: tStampPain + 2.8, dur: 1.5, pitch: 'E4', inst: 'harp', vel: 0.50 }
    );

    // ----------------------------------------------------
    // 第 2 幕：实机运转 (8.0s – 18.0s)
    // ----------------------------------------------------
    // 马林巴开始轻快 16 分音符律动（A 大调动机：A-C#-E-A）
    const marimbaMotif = ['A4', 'C#5', 'E5', 'C#5', 'A4', 'E4', 'A4', 'C#5'];
    marimbaMotif.forEach((n, idx) => {
      list.push({ t: 8.4 + idx * 0.288, dur: 0.24, pitch: n, inst: 'marimba', vel: 0.58 });
    });

    // 9.2s 终端执行命令：小提琴切入主题旋律
    const tCli = g.hit('hit-cli-run');
    list.push(
      { t: tCli, dur: 1.6, pitch: 'A4', inst: 'violins', vel: 0.70 },
      { t: tCli + 1.6, dur: 1.4, pitch: 'B4', inst: 'violins', vel: 0.72 },
      { t: tCli + 3.0, dur: 1.4, pitch: 'C#5', inst: 'violins', vel: 0.75 },
      { t: tCli - 0.4, dur: 3.2, pitch: 'D3', inst: 'cellos', vel: 0.55 },
      { t: tCli + 2.8, dur: 4.0, pitch: 'E3', inst: 'cellos', vel: 0.60 }
    );

    // 13.8s 波形锁定对齐：马林巴密集滚动收束 + 金属钟声清脆点亮
    const tLock = g.hit('hit-waveform-lock');
    list.push(
      { t: tLock, dur: 2.5, pitch: 'A5', inst: 'synth:bell', vel: 0.85 },
      { t: tLock, dur: 1.8, pitch: 'E5', inst: 'violins', vel: 0.75 }
    );

    // ----------------------------------------------------
    // 第 3 幕：暗场底座光柱 (18.0s – 26.0s)
    // ----------------------------------------------------
    // 18.0s：光柱拔地而起 (主高潮 1)！定音鼓重击 + 全弦乐齐奏
    const tPillar = g.hit('hit-pillar-rise');
    list.push(
      { t: tPillar, dur: 3.0, pitch: 'A2', inst: 'timpani', vel: 0.95 },
      { t: tPillar, dur: 4.5, pitch: 'A2', inst: 'cellos', vel: 0.85 },
      { t: tPillar, dur: 3.8, pitch: 'A5', inst: 'violins', vel: 0.90 },
      { t: tPillar, dur: 5.0, pitch: 'A4', inst: 'synth:pad', vel: 0.75 },
      { t: tPillar + 2.2, dur: 2.0, pitch: 'C#6', inst: 'violins', vel: 0.88 },
      { t: tPillar + 3.4, dur: 2.2, pitch: 'E6', inst: 'violins', vel: 0.85 }
    );

    // 22.2s 镜头桥贯通：金属轻鸣与竖琴滑音穿插
    const tBridge = g.hit('hit-bridge-connect');
    list.push(
      { t: tBridge, dur: 2.4, pitch: 'E5', inst: 'synth:bell', vel: 0.80 },
      { t: tBridge + 0.2, dur: 1.6, pitch: 'C#5', inst: 'harp', vel: 0.68 },
      { t: tBridge + 1.0, dur: 1.8, pitch: 'A4', inst: 'harp', vel: 0.65 }
    );

    // ----------------------------------------------------
    // 第 4 幕：数字墙交付 (26.0s – 36.0s)
    // ----------------------------------------------------
    // 26.0s：数字“0”砸入！定音鼓重拍 + 弦乐齐奏
    const tN1 = g.hit('hit-number-one');
    list.push(
      { t: tN1, dur: 1.8, pitch: 'A2', inst: 'timpani', vel: 0.90 },
      { t: tN1, dur: 2.0, pitch: 'A4', inst: 'synth:bell', vel: 0.82 },
      { t: tN1, dur: 2.2, pitch: 'A3', inst: 'cellos', vel: 0.75 }
    );

    // 28.3s：数字“100%”砸入！
    const tN2 = g.hit('hit-number-two');
    list.push(
      { t: tN2, dur: 1.8, pitch: 'C#5', inst: 'synth:bell', vel: 0.85 },
      { t: tN2, dur: 2.0, pitch: 'C#4', inst: 'violins', vel: 0.78 }
    );

    // 30.6s：数字“10×”砸入！
    const tN3 = g.hit('hit-number-three');
    list.push(
      { t: tN3, dur: 1.8, pitch: 'E5', inst: 'synth:bell', vel: 0.88 },
      { t: tN3, dur: 2.0, pitch: 'E4', inst: 'violins', vel: 0.80 }
    );

    // 32.4s：最终交付钢印盖下 (主高潮 2 / 终曲)！定音鼓 + 竖琴琶音扫过 + 全声部 A 大调和弦长鸣
    const tFinal = g.hit('hit-stamp-final');
    list.push(
      { t: tFinal, dur: 3.2, pitch: 'A2', inst: 'timpani', vel: 0.95 },
      { t: tFinal, dur: 3.5, pitch: 'A2', inst: 'cellos', vel: 0.85 },
      { t: tFinal, dur: 3.5, pitch: 'E4', inst: 'violins', vel: 0.82 },
      { t: tFinal, dur: 3.5, pitch: 'A5', inst: 'violins', vel: 0.88 },
      { t: tFinal, dur: 3.0, pitch: 'A5', inst: 'synth:bell', vel: 0.90 }
    );

    // 33.0s：竖琴缓缓扫过琶音，沉入平静
    ['A3', 'C#4', 'E4', 'A4', 'C#5', 'E5'].forEach((p, i) => {
      list.push({ t: 33.0 + i * 0.15, dur: 2.0, pitch: p, inst: 'harp', vel: 0.65 });
    });

    return list;
  },
});
