import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation, VisualHit } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';

/**
 * Us (IntimaMate) 30 秒宣传片声音适配器
 */
export class IdoPromoAdapter implements FilmAdapter {
  filmId = 'ido-promo';
  title = 'Us · 用更温柔的方式理解我们之间';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  // 段落起点字典 (秒)
  SC: Record<string, number> = {
    question: FILM_PLAN.sceneStart('question'),
    record: FILM_PLAN.sceneStart('record'),
    frequency: FILM_PLAN.sceneStart('frequency'),
    duration: FILM_PLAN.sceneStart('duration'),
    privacy: FILM_PLAN.sceneStart('privacy'),
    cta: FILM_PLAN.sceneStart('cta'),
    end: FILM_PLAN.totalSeconds,
  };

  /**
   * 关键拍点字典 (秒)
   */
  K: Record<string, number> = {
    firstBead: this.SC.question + 2.0,
    tapRecord: this.SC.record + 3.2,
    beadDrop: this.SC.record + 4.9,
    riverFlow: this.SC.frequency + 0.8,
    chartGrow: this.SC.duration + 1.8,
    lockSnap: this.SC.privacy + 0.8,
    logoDrop: this.SC.cta + 0.6,
  };

  ignoredKeys: string[] = [];

  // 音效采购调色板
  palette: Record<string, PaletteSpec> = {
    usAtmosphere: {
      slot: 'usAtmosphere',
      layer: 'BG',
      cat: 'ambient',
      tags: 'space, deep, warm, ethereal, pad',
      dur: [6.0, 12.0],
      variants: 1,
      align: 'onset',
      gain: 0.6,
    },
    usGalaxyChime: {
      slot: 'usGalaxyChime',
      layer: 'TEX',
      cat: 'glockenspiel',
      tags: 'crystal, chime, star, galaxy, shimmer',
      dur: [1.0, 2.5],
      variants: 1,
      align: 'onset',
      gain: 0.8,
    },
    usLockClick: {
      slot: 'usLockClick',
      layer: 'UI',
      cat: 'ui',
      tags: 'safe, click, lock, clean, tactile',
      dur: [0.1, 0.4],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    usRiserSweep: {
      slot: 'usRiserSweep',
      layer: 'RISER',
      cat: 'whoosh',
      tags: 'riser, cinematic, sweep, build',
      dur: [1.5, 3.0],
      variants: 1,
      align: 'peak',
      gain: 0.9,
    },
    usLogoHit: {
      slot: 'usLogoHit',
      layer: 'IMPACT',
      cat: 'impact',
      tags: 'sub, drop, warm, emotional, cinematic',
      dur: [1.5, 3.5],
      variants: 1,
      align: 'onset',
      gain: 1.1,
    },
  };

  spots(): SpotAnnotation[] {
    return [
      {
        id: '深空温柔氛围',
        fromSec: 0,
        toSec: FILM_PLAN.totalSeconds,
        layer: 'BG',
        slot: 'usAtmosphere',
        what: '全片深空温柔微光铺底',
      },
      {
        id: '点一下记一笔',
        fromSec: this.K.tapRecord,
        toSec: this.K.tapRecord + 0.3,
        layer: 'UI',
        slot: 'usLockClick',
        what: '点选记录入口的触感',
      },
      {
        id: '记录落成珠子',
        fromSec: this.K.beadDrop,
        toSec: this.K.beadDrop + 1.6,
        layer: 'TEX',
        slot: 'usGalaxyChime',
        what: '一条记录落定，化作一颗珠子',
      },
      {
        id: '河道成形',
        fromSec: this.K.riverFlow,
        toSec: this.K.riverFlow + 2.0,
        layer: 'TEX',
        slot: 'usGalaxyChime',
        what: '珠子汇成时间之河',
      },
      {
        id: '柱子生长',
        fromSec: this.K.chartGrow - 1.6,
        toSec: this.K.chartGrow,
        layer: 'RISER',
        slot: 'usRiserSweep',
        what: '频率轨迹逐根生长的起势',
      },
      {
        id: '锁合上',
        fromSec: this.K.lockSnap,
        toSec: this.K.lockSnap + 0.3,
        layer: 'UI',
        slot: 'usLockClick',
        what: '数据锁在本机的那一下',
      },
      {
        id: '落版起势',
        fromSec: this.K.logoDrop - 2.2,
        toSec: this.K.logoDrop,
        layer: 'RISER',
        slot: 'usRiserSweep',
        what: '珠子向中心汇拢的收束',
      },
      {
        id: 'Logo绽放主高潮',
        fromSec: this.K.logoDrop,
        toSec: this.K.logoDrop + 2.5,
        layer: 'IMPACT',
        slot: 'usLogoHit',
        what: 'Us 品牌落版光晕绽放',
      },
    ];
  }

  typings() {
    return [];
  }

  /**
   * 弹性区：钩子和隐私章是「静帧渐显」，允许时间伸缩给配乐让路；
   * 记录 / 时间之河 / 统计是运动段，只给 3% 的弹性（手机滚动和柱子生长对速度敏感）；
   * 落版刚性，一帧不动。首尾相接盖满 0 → 总长，由 vw check 校验。
   */
  zones(): ElasticZone[] {
    const total = FILM_PLAN.totalSeconds;
    return [
      { name: 'open-hold', kind: 'hold', fromSec: 0, toSec: this.SC.record },
      { name: 'record-motion', kind: 'motion', fromSec: this.SC.record, toSec: this.SC.river },
      { name: 'river-motion', kind: 'motion', fromSec: this.SC.river, toSec: this.SC.insights },
      { name: 'insights-motion', kind: 'motion', fromSec: this.SC.insights, toSec: this.SC.privacy },
      { name: 'privacy-hold', kind: 'hold', fromSec: this.SC.privacy, toSec: this.SC.finale },
      { name: 'finale-rigid', kind: 'video', fromSec: this.SC.finale, toSec: total },
    ];
  }

  hits(): VisualHit[] {
    return [
      {
        id: 'K.tapRecord',
        sec: this.K.tapRecord,
        priority: 'P2' as const,
        want: 'beat' as const,
        note: '点选记录入口',
      },
      {
        id: 'K.riverFlow',
        sec: this.K.riverFlow,
        priority: 'P1' as const,
        want: 'downbeat' as const,
        note: '河道成形，进入回顾段',
      },
      {
        id: 'K.chartGrow',
        sec: this.K.chartGrow,
        priority: 'P1' as const,
        want: 'downbeat' as const,
        note: '频率柱生长',
      },
      {
        id: 'K.logoDrop',
        sec: this.K.logoDrop,
        priority: 'P0' as const,
        want: 'drop' as const,
        note: 'Us 落版主高潮',
      },
    ];
  }
}
