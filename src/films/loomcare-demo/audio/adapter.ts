import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';

/**
 * LoomCare 宣传片声音适配器
 * 自动从幕常量与拍点派生 SC / K / Spots / Palette
 */
export class LoomCareAdapter implements FilmAdapter {
  filmId = 'loomcare-demo';
  title = 'Loom Care · 把病历组织成指引';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  // 段落起点字典
  SC: Record<string, number> = {
    prologue: FILM_PLAN.sceneStart('prologue'),
    title: FILM_PLAN.sceneStart('title'),
    connect: FILM_PLAN.sceneStart('connect'),
    dialogA: FILM_PLAN.sceneStart('dialogA'),
    chip: FILM_PLAN.sceneStart('chip'),
    dialogB: FILM_PLAN.sceneStart('dialogB'),
    understand: FILM_PLAN.sceneStart('understand'),
    human: FILM_PLAN.sceneStart('human'),
    care: FILM_PLAN.sceneStart('care'),
    weave: FILM_PLAN.sceneStart('weave'),
    learn: FILM_PLAN.sceneStart('learn'),
    finale: FILM_PLAN.sceneStart('finale'),
    end: FILM_PLAN.totalSeconds,
  };

  // 关键拍点字典（秒）
  K: Record<string, number> = {
    'ink': this.SC.title + 1.2,
    'connectEntry': this.SC.connect + 0.8,
    'chipPop': this.SC.chip + 0.4,
    'heartBeat': this.SC.care + 3.2,
    'ringSpin': this.SC.finale + 2.5,
  };

  ignoredKeys: string[] = [];

  // 音效采购单
  palette: Record<string, PaletteSpec> = {
    lcTitleWhoosh: {
      slot: 'lcTitleWhoosh',
      layer: 'WHOOSH',
      cat: 'whoosh',
      tags: 'whoosh, air, cinematic, deep',
      dur: [0.6, 1.2],
      variants: 2,
      align: 'onset',
      gain: 1.0,
    },
    lcChipPop: {
      slot: 'lcChipPop',
      layer: 'IMPACT',
      cat: 'ui',
      tags: 'ui, click, pop, organic, wooden',
      dur: [0.2, 0.5],
      variants: 1,
      align: 'onset',
      gain: 1.0,
    },
    lcAwHeart: {
      slot: 'lcAwHeart',
      layer: 'TEX',
      cat: 'organic',
      tags: 'heartbeat, pulse, deep, sub',
      dur: [1.2, 2.0],
      variants: 1,
      align: 'peak',
      gain: 1.2,
    },
    lcConnectPop: {
      slot: 'lcConnectPop',
      layer: 'UI',
      cat: 'ui',
      tags: 'connect, pop, clean',
      dur: [0.1, 0.4],
      variants: 1,
      align: 'onset',
      gain: 0.8,
    },
    lcRingSpin: {
      slot: 'lcRingSpin',
      layer: 'RISER',
      cat: 'whoosh',
      tags: 'spin, shimmer, futuristic',
      dur: [1.0, 2.5],
      variants: 1,
      align: 'peak',
      gain: 1.0,
    },
  };

  // 语义事件列表
  spots(): SpotAnnotation[] {
    return [
      {
        id: '片名大气转场',
        fromSec: this.K.ink - 0.2,
        toSec: this.K.ink + 1.0,
        layer: 'WHOOSH',
        slot: 'lcTitleWhoosh',
        what: '片名文字墨染展开',
      },
      {
        id: '接入卡片滑入',
        fromSec: this.K.connectEntry - 0.1,
        toSec: this.K.connectEntry + 0.3,
        layer: 'UI',
        slot: 'lcConnectPop',
        what: '首屏接入数据源卡片滑入',
      },
      {
        id: '芯片弹出',
        fromSec: this.K.chipPop,
        toSec: this.K.chipPop + 0.4,
        layer: 'IMPACT',
        slot: 'lcChipPop',
        what: '入口芯片向上弹出',
      },
      {
        id: '心跳两下',
        fromSec: this.K.heartBeat,
        toSec: this.K.heartBeat + 1.6,
        layer: 'TEX',
        slot: 'lcAwHeart',
        what: '手机机身亮起心跳律动',
      },
      {
        id: '底座收束旋转',
        fromSec: this.K.ringSpin - 1.5,
        toSec: this.K.ringSpin + 0.5,
        layer: 'RISER',
        slot: 'lcRingSpin',
        what: '底座光环收束',
      },
    ];
  }

  typings() {
    return [
      { id: 'typing1', fromSec: this.SC.dialogA + 0.5, durSec: 2.8, label: '专员对话输入' },
    ];
  }

  /**
   * 弹性区：沿用 LoomCare 正片的口径 —— 全片刚性，配乐迁就画面（靠 Adapt 钉高潮）。
   * 打字段单列为 typing 刚性区，3D 手机机身段单列为 physics 刚性区，
   * 这样 sync.json 只起网格可行性报告的作用，knots 全在对角线上。
   */
  zones(): ElasticZone[] {
    const total = FILM_PLAN.totalSeconds;
    return [
      { name: 'prologue-to-dialog', kind: 'video', fromSec: 0, toSec: this.SC.dialogA },
      { name: 'typing-rigid', kind: 'typing', fromSec: this.SC.dialogA, toSec: this.SC.chip },
      { name: 'chip-to-care', kind: 'video', fromSec: this.SC.chip, toSec: this.SC.care },
      { name: 'care-phone-physics', kind: 'physics', fromSec: this.SC.care, toSec: this.SC.weave },
      { name: 'weave-to-end', kind: 'video', fromSec: this.SC.weave, toSec: total },
    ];
  }

  hits() {
    return [
      {
        id: 'K.ink',
        sec: this.K.ink,
        priority: 'P0' as const,
        want: 'drop' as const,
        note: '片名墨染主高潮',
      },
      {
        id: 'K.chipPop',
        sec: this.K.chipPop,
        priority: 'P1' as const,
        want: 'downbeat' as const,
        note: '入口芯片重拍落位',
      },
    ];
  }
}
