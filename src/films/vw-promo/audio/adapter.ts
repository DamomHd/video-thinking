import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation, VisualHit } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';
import { MotionEvent, SoundMap, autoSpots } from '../../../shared/events';
import { sectionBeds, BedSection } from '../../../shared/beds';

/**
 * 视频工作台 (vw-promo) · 36 秒宣传片声音适配器
 */
export class VwPromoAdapter implements FilmAdapter {
  filmId = 'vw-promo';
  title = '视频工作台 · 程序化影片工作室';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  // 四幕起点
  SC: Record<string, number> = {
    pain: FILM_PLAN.sceneStart('pain'),           // 0.0s
    workbench: FILM_PLAN.sceneStart('workbench'), // 8.0s
    engine: FILM_PLAN.sceneStart('engine'),       // 18.0s
    delivery: FILM_PLAN.sceneStart('delivery'),   // 26.0s
    end: FILM_PLAN.totalSeconds,                  // 36.0s
  };

  // 关键拍点字典
  K: Record<string, number> = {
    stampPain: this.SC.pain + 2.0,            // 2.0s 催改消息弹入与轨道错位
    orderFold: this.SC.pain + 4.8,            // 4.8s 错位警告与切换光标
    cliRun: this.SC.workbench + 1.2,          // 9.2s 终端执行 render 命令
    waveformLock: this.SC.workbench + 5.8,    // 13.8s 真波形磁吸齿轮咬合锁定
    pillarRise: this.SC.engine + 0.0,         // 18.0s 镜头深推穿透进入时间光轨 (Hero Hit)
    bridgeConnect: this.SC.engine + 4.2,      // 22.2s 核心三大引擎协同贯通
    numberOne: this.SC.delivery + 0.0,        // 26.0s 晨光破晓成片播放器亮起
    numberTwo: this.SC.delivery + 2.3,        // 28.3s 12 秒改版成功指标展现
    numberThree: this.SC.delivery + 4.6,      // 30.6s 0 丢帧与 0.0ms 零偏移
    stampFinal: this.SC.delivery + 6.4,       // 32.4s 准时交付钢印盖定
  };

  ignoredKeys: string[] = [];

  // 音效采购调色板（支持 layered 分层角色词）
  palette: Record<string, PaletteSpec> = {
    // 质感床
    bedWarm: {
      slot: 'bedWarm',
      layer: 'TEX',
      cat: 'ambient',
      tags: 'layered, texture-bed, warm',
      dur: [6.0, 12.0],
      variants: 1,
      align: 'onset',
      gain: 0.35,
    },
    bedTension: {
      slot: 'bedTension',
      layer: 'TEX',
      cat: 'ambient',
      tags: 'layered, texture-bed, tension',
      dur: [6.0, 12.0],
      variants: 1,
      align: 'onset',
      gain: 0.4,
    },
    bedLow: {
      slot: 'bedLow',
      layer: 'TEX',
      cat: 'ambient',
      tags: 'layered, texture-bed, low',
      dur: [6.0, 12.0],
      variants: 1,
      align: 'onset',
      gain: 0.45,
    },
    bedAir: {
      slot: 'bedAir',
      layer: 'TEX',
      cat: 'ambient',
      tags: 'layered, texture-bed, air',
      dur: [6.0, 12.0],
      variants: 1,
      align: 'onset',
      gain: 0.35,
    },

    // 动作拟音
    cardLand: {
      slot: 'cardLand',
      layer: 'UI',
      cat: 'ui',
      tags: 'layered, card-land',
      dur: [0.3, 0.8],
      variants: 1,
      align: 'peak',
      gain: 0.85,
    },
    countTick: {
      slot: 'countTick',
      layer: 'UI',
      cat: 'ui',
      tags: 'layered, count-tick',
      dur: [0.1, 0.4],
      variants: 1,
      align: 'peak',
      gain: 0.7,
    },
    stampHit: {
      slot: 'stampHit',
      layer: 'IMPACT',
      cat: 'foley',
      tags: 'layered, stamp',
      dur: [0.4, 1.2],
      variants: 1,
      align: 'peak',
      gain: 0.95,
    },
    heroHit: {
      slot: 'heroHit',
      layer: 'IMPACT',
      cat: 'cinematic',
      tags: 'layered, hero-hit',
      dur: [1.2, 3.5],
      variants: 1,
      align: 'peak',
      gain: 1.0,
    },
    revealSwell: {
      slot: 'revealSwell',
      layer: 'TEX',
      cat: 'cinematic',
      tags: 'layered, reveal-swell',
      dur: [0.8, 2.0],
      variants: 1,
      align: 'peak',
      gain: 0.8,
    },
    morphSlide: {
      slot: 'morphSlide',
      layer: 'TEX',
      cat: 'ui',
      tags: 'layered, morph-slide',
      dur: [0.4, 1.0],
      variants: 1,
      align: 'peak',
      gain: 0.75,
    },
  };

  // 声音映射表
  soundMap: SoundMap = {
    land: { slot: 'cardLand', layer: 'UI' },
    stamp: { slot: 'stampHit', layer: 'IMPACT', pitched: true },
    hero: { slot: 'heroHit', layer: 'IMPACT', pitched: true },
    reveal: { slot: 'revealSwell', layer: 'TEX', pitched: true },
    morph: { slot: 'morphSlide', layer: 'TEX' },
    tick: { slot: 'countTick', layer: 'UI' },
  };

  /** 画面动作事件登记 */
  events(): MotionEvent[] {
    return [
      // S1 痛点
      { id: 'e-paper-open', kind: 'land', at: this.SC.pain + 0.3, land: this.SC.pain + 0.5 },
      { id: 'e-stamp-reject', kind: 'stamp', at: this.K.stampPain, weight: 'heavy' },
      { id: 'e-paper-fold', kind: 'morph', at: this.K.orderFold },
      { id: 'e-pain-silence', kind: 'reveal', at: this.SC.pain + 7.4, silent: '切入工作台前的半秒静默' },

      // S2 工作台
      { id: 'e-ui-slide', kind: 'land', at: this.SC.workbench + 0.2 },
      { id: 'e-cli-exec', kind: 'stamp', at: this.K.cliRun },
      { id: 'e-code-scroll', kind: 'count', at: this.SC.workbench + 2.5, end: this.SC.workbench + 4.5, count: { from: 0, to: 100 } },
      { id: 'e-waveform-lock', kind: 'reveal', at: this.K.waveformLock, weight: 'normal' },
      { id: 'e-stage-breath', kind: 'reveal', at: this.SC.workbench + 9.5, silent: '空间下沉前的呼吸留白' },

      // S3 3D 底座
      { id: 'e-pillar-hero', kind: 'hero', at: this.K.pillarRise, weight: 'heavy' },
      { id: 'e-cube-a', kind: 'land', at: this.SC.engine + 2.0, index: 0, of: 3 },
      { id: 'e-cube-b', kind: 'land', at: this.SC.engine + 2.8, index: 1, of: 3 },
      { id: 'e-cube-c', kind: 'land', at: this.SC.engine + 3.6, index: 2, of: 3 },
      { id: 'e-bridge-connect', kind: 'reveal', at: this.K.bridgeConnect, weight: 'normal' },

      // S4 数字交付
      { id: 'e-num-1', kind: 'stamp', at: this.K.numberOne, weight: 'heavy', index: 0, of: 4 },
      { id: 'e-num-2', kind: 'stamp', at: this.K.numberTwo, weight: 'heavy', index: 1, of: 4 },
      { id: 'e-num-3', kind: 'stamp', at: this.K.numberThree, weight: 'heavy', index: 2, of: 4 },
      { id: 'e-stamp-final', kind: 'hero', at: this.K.stampFinal, weight: 'heavy', index: 3, of: 4 },
    ];
  }

  /** 音效点位生成 */
  spots(): SpotAnnotation[] {
    const list: SpotAnnotation[] = [];

    // 1. 段落质感床 (Beds)
    const sections: BedSection[] = [
      { id: 'pain', from: this.SC.pain, to: this.SC.workbench, slot: 'bedWarm', what: '痛点暖纸底色' },
      { id: 'workbench', from: this.SC.workbench, to: this.SC.engine, slot: 'bedTension', what: '实机精密运转' },
      { id: 'engine', from: this.SC.engine, to: this.SC.delivery, slot: 'bedLow', what: '3D 纯黑深空光柱' },
      { id: 'delivery', from: this.SC.delivery, to: this.SC.end, slot: 'bedAir', what: '高明度开阔交付' },
    ];
    list.push(...sectionBeds(sections, { key: '11B', xfadeSec: 1.0 }));

    // 2. 动作事件自动生成点位
    list.push(...autoSpots(this.events(), this.soundMap, { key: '11B' }));

    return list;
  }

  typings(): { id: string; fromSec: number; durSec: number; label: string }[] {
    return [];
  }

  hits(): VisualHit[] {
    return [
      { id: 'hit-stamp-pain', sec: this.K.stampPain, priority: 'P0', want: 'drop', note: '痛点工单驳回印章' },
      { id: 'hit-cli-run', sec: this.K.cliRun, priority: 'P1', want: 'beat', note: '终端命令执行' },
      { id: 'hit-waveform-lock', sec: this.K.waveformLock, priority: 'P1', want: 'downbeat', note: '波形锁定对齐' },
      { id: 'hit-pillar-rise', sec: this.K.pillarRise, priority: 'P0', want: 'drop', note: '3D 底座光柱展开' },
      { id: 'hit-bridge-connect', sec: this.K.bridgeConnect, priority: 'P1', want: 'beat', note: '镜头桥贯通' },
      { id: 'hit-number-one', sec: this.K.numberOne, priority: 'P0', want: 'drop', note: '数字 0 丢帧' },
      { id: 'hit-number-two', sec: this.K.numberTwo, priority: 'P1', want: 'downbeat', note: '数字 100% 单源' },
      { id: 'hit-number-three', sec: this.K.numberThree, priority: 'P1', want: 'beat', note: '数字 10× 提效' },
      { id: 'hit-stamp-final', sec: this.K.stampFinal, priority: 'P0', want: 'finish', note: '交付钢印盖定' },
    ];
  }

  zones(): ElasticZone[] {
    return [
      { name: 'z1', kind: 'motion', fromSec: 0, toSec: 8.0 },
      { name: 'z2', kind: 'motion', fromSec: 8.0, toSec: 18.0 },
      { name: 'z3', kind: 'hold', fromSec: 18.0, toSec: 26.0 },
      { name: 'z4', kind: 'hold', fromSec: 26.0, toSec: 36.0 },
    ];
  }
}
