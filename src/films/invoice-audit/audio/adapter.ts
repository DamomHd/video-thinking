import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation, VisualHit } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';

/**
 * 报销台（虚构产品演示）32 秒 · 沿用 product-story 风格 · 声音适配器
 *
 * 拍点按决策单「逐秒节拍表 / 拍点图」：104 BPM，画面先行（grid.lock: false + g.hit(id)）。
 * 适配器只标语义拍点（spots）和画面命中（hits），不写死编排规则。
 */
export class InvoiceAuditAdapter implements FilmAdapter {
  filmId = 'invoice-audit';
  title = '报销台 · 报销自动审批系统（虚构产品演示）';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  // 段落起点字典（秒）
  SC: Record<string, number> = {
    open: FILM_PLAN.sceneStart('open'),
    flow: FILM_PLAN.sceneStart('flow'),
    stage: FILM_PLAN.sceneStart('stage'),
    twin: FILM_PLAN.sceneStart('twin'),
    numbers: FILM_PLAN.sceneStart('numbers'),
    end: FILM_PLAN.totalSeconds,
  };

  /**
   * 关键拍点字典（秒），按决策单逐秒节拍表。
   * 每个键都会在适配器源码里以 K.<键> 出现（守门第 3 道按文本引用核对）。
   */
  K: Record<string, number> = {
    highlight: this.SC.open + 3.0,       // 01 荧光笔划过超标行
    // 01 "超 ¥200" 飞出 / 01→02 切界面 是画面拍点，由 layout 的 events 配声，adapter 不配
    typeStart: this.SC.flow + 1.5,        // 02 输入框光标起打
    cardIdentify: this.SC.flow + 2.5,     // 02 "识别"卡落定
    cardCompare: this.SC.flow + 4.0,     // 02 "比对"卡落定
    cardLocate: this.SC.flow + 5.5,       // 02 "定位"卡落定 + 原文连线亮
    cardReport: this.SC.flow + 7.5,       // 02 "报告"卡落定
    steps: this.SC.flow + 4.4,            // 02 四步落定起点（画面 BEATS.steps 踩拍，adapter 不直接配声，由 events 表的步骤组配）
    rows: this.SC.numbers + 1.3,          // 05 数字墙四行落定起点（画面 BEATS.rows 踩拍，adapter 不直接配声，由 events 表的数字行组配）
    toStage: this.SC.stage - 0.5,         // 02→03 纸面暗下去（低频长音先进来）
    frameOn: this.SC.stage + 1.0,         // 03 暗场金色线框亮起
    frameHeavy: this.SC.stage + 2.5,      // 03 暗场重拍（climax2）
    frameOff: this.SC.stage + 4.0,         // 03 线框收
    twinDrop: this.SC.twin + 0.5,         // 04 后台卡 + 手机消息同落
    twinLine: this.SC.twin + 3.0,         // 04 连线亮
    twinPush: this.SC.twin + 5.0,         // 04 审批已推送
    num5280: this.SC.numbers + 2.0,        // 05 "8,600"落定（hero-hit）
    num47: this.SC.numbers + 3.0,          // 05 "47"落定
    num0: this.SC.numbers + 4.0,           // 05 "0"落定
    num38: this.SC.numbers + 4.5,          // 05 "38秒"落定 + logo 落版
  };

  ignoredKeys: string[] = [];

  // 音效采购调色板（product-story 风格 §7：室内乐配器、界面拟音轻、分层音色）
  palette: Record<string, PaletteSpec> = {
    paperAtmos: {
      slot: 'paperAtmos',
      layer: 'BG',
      cat: 'ambient',
      tags: 'layered, texture-bed, warm, room, paper, subtle',
      dur: [6.0, 10.0],
      variants: 1,
      align: 'onset',
      gain: 0.5,
    },
    highlightSweep: {
      slot: 'highlightSweep',
      layer: 'TEX',
      cat: 'foley',
      tags: 'layered, focus-air, paper, marker, soft, sweep',
      dur: [0.6, 1.2],
      variants: 1,
      align: 'onset',
      gain: 0.6,
    },
    cardLand: {
      slot: 'cardLand',
      layer: 'UI',
      cat: 'ui',
      tags: 'layered, card-land, soft, marimba, tonal, clean',
      dur: [0.2, 0.5],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    keyTap: {
      slot: 'keyTap',
      layer: 'UI',
      cat: 'ui',
      tags: 'keyboard, soft, typing, clean',
      dur: [0.08, 0.2],
      variants: 1,
      align: 'onset',
      gain: 0.5,
    },
    revealLine: {
      slot: 'revealLine',
      layer: 'TEX',
      cat: 'whoosh',
      tags: 'layered, reveal-swell, soft, line, glass',
      dur: [0.4, 0.8],
      variants: 1,
      align: 'onset',
      gain: 0.6,
    },
    stageBed: {
      slot: 'stageBed',
      layer: 'BG',
      cat: 'drone',
      tags: 'layered, texture-bed, low, dark, cinematic, tension',
      dur: [4.0, 6.0],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    frameChime: {
      slot: 'frameChime',
      layer: 'TEX',
      cat: 'glockenspiel',
      tags: 'glass, chime, single, gold, bell, soft',
      dur: [0.8, 1.6],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    stageHeavy: {
      slot: 'stageHeavy',
      layer: 'IMPACT',
      cat: 'impact',
      tags: 'layered, stamp, hero-hit, sub, cinematic, weight',
      dur: [1.2, 2.5],
      variants: 1,
      align: 'onset',
      gain: 1.0,
    },
    twinStamp: {
      slot: 'twinStamp',
      layer: 'UI',
      cat: 'ui',
      tags: 'layered, stamp, glass, sync, soft, pair',
      dur: [0.3, 0.6],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    countTick: {
      slot: 'countTick',
      layer: 'UI',
      cat: 'ui',
      tags: 'layered, count-tick, pluck, tonal, tick, clean',
      dur: [0.15, 0.4],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    logoStamp: {
      slot: 'logoStamp',
      layer: 'IMPACT',
      cat: 'impact',
      tags: 'layered, stamp, hero-hit, warm, resolve, cinematic',
      dur: [1.0, 2.0],
      variants: 1,
      align: 'onset',
      gain: 1.0,
    },
  };

  spots(): SpotAnnotation[] {
    const total = FILM_PLAN.totalSeconds;
    return [
      // 01 一张发票
      {
        id: '暖纸氛围铺底',
        fromSec: 0,
        toSec: this.SC.stage,
        layer: 'BG',
        slot: 'paperAtmos',
        what: '01–02 暖白纸面室内铺底',
      },
      {
        id: '荧光笔划过金额',
        fromSec: this.K.highlight,
        toSec: this.K.highlight + 0.8,
        layer: 'TEX',
        slot: 'highlightSweep',
        what: '荧光笔划过超标行',
      },
      // 02 一句话走完流程
      {
        id: '输入框起打',
        fromSec: this.K.typeStart,
        toSec: this.K.cardIdentify,
        layer: 'UI',
        slot: 'keyTap',
        what: '输入框打字',
      },
      {
        id: '识别卡落定',
        fromSec: this.K.cardIdentify,
        toSec: this.K.cardIdentify + 0.4,
        layer: 'UI',
        slot: 'cardLand',
        what: '识别卡落定',
      },
      {
        id: '比对卡落定',
        fromSec: this.K.cardCompare,
        toSec: this.K.cardCompare + 0.4,
        layer: 'UI',
        slot: 'cardLand',
        what: '比对卡落定',
      },
      {
        id: '定位卡 + 原文连线',
        fromSec: this.K.cardLocate,
        toSec: this.K.cardLocate + 0.5,
        layer: 'UI',
        slot: 'cardLand',
        what: '定位卡落定 + 原文连线亮',
      },
      {
        id: '报告卡落定',
        fromSec: this.K.cardReport,
        toSec: this.K.cardReport + 0.5,
        layer: 'UI',
        slot: 'cardLand',
        what: '差异报告卡落定',
      },
      // 03 暗场一亮
      {
        id: '暗场低频床先进',
        fromSec: this.K.toStage,
        toSec: this.K.frameOff,
        layer: 'BG',
        slot: 'stageBed',
        what: '进暗场低频长音铺底',
      },
      {
        id: '金色线框亮起',
        fromSec: this.K.frameOn,
        toSec: this.K.frameOn + 1.0,
        layer: 'TEX',
        slot: 'frameChime',
        what: '暗场金色线框点亮',
      },
      {
        id: '暗场重拍',
        fromSec: this.K.frameHeavy,
        toSec: this.K.frameHeavy + 1.8,
        layer: 'IMPACT',
        slot: 'stageHeavy',
        what: '暗场重拍（climax2）',
      },
      // 04 两个出口
      {
        id: '双设备同落',
        fromSec: this.K.twinDrop,
        toSec: this.K.twinDrop + 0.5,
        layer: 'UI',
        slot: 'twinStamp',
        what: '后台卡 + 手机消息同落',
      },
      {
        id: '同源连线亮',
        fromSec: this.K.twinLine,
        toSec: this.K.twinLine + 0.6,
        layer: 'TEX',
        slot: 'revealLine',
        what: '后台卡与手机连线亮起',
      },
      {
        id: '审批推送',
        fromSec: this.K.twinPush,
        toSec: this.K.twinPush + 0.3,
        layer: 'UI',
        slot: 'countTick',
        what: '审批已推送计数',
      },
      // 05 数字墙
      {
        id: '8600落定',
        fromSec: this.K.num5280,
        toSec: this.K.num5280 + 0.6,
        layer: 'IMPACT',
        slot: 'logoStamp',
        what: '8,600 份落定（hero-hit）',
      },
      {
        id: '47落定',
        fromSec: this.K.num47,
        toSec: this.K.num47 + 0.4,
        layer: 'UI',
        slot: 'countTick',
        what: '47 处差异落定',
      },
      {
        id: '0落定',
        fromSec: this.K.num0,
        toSec: this.K.num0 + 0.4,
        layer: 'UI',
        slot: 'countTick',
        what: '0 误漏落定',
      },
      {
        id: '38秒落版',
        fromSec: this.K.num38,
        toSec: this.K.num38 + 1.5,
        layer: 'IMPACT',
        slot: 'logoStamp',
        what: '38 秒 + logo 落版',
      },
    ];
  }

  typings() {
    return [];
  }

  /**
   * 弹性区：01 开场与 02 流程是运动段（荧光笔划过、卡片落定），给 3% 弹性；
   * 03 暗场是 hold（线框点亮是缓动，对速度不敏感）；04 双设备同落是 motion；
   * 05 数字墙刚性（数字落定要卡死）。首尾盖满 0 → 总长。
   */
  zones(): ElasticZone[] {
    const total = FILM_PLAN.totalSeconds;
    return [
      { name: 'open-motion', kind: 'motion', fromSec: 0, toSec: this.SC.flow },
      { name: 'flow-motion', kind: 'motion', fromSec: this.SC.flow, toSec: this.SC.stage },
      { name: 'stage-hold', kind: 'hold', fromSec: this.SC.stage, toSec: this.SC.twin },
      { name: 'twin-motion', kind: 'motion', fromSec: this.SC.twin, toSec: this.SC.numbers },
      { name: 'numbers-rigid', kind: 'video', fromSec: this.SC.numbers, toSec: total },
    ];
  }

  hits(): VisualHit[] {
    return [
      { id: 'K.highlight', sec: this.K.highlight, priority: 'P2' as const, want: 'beat' as const, note: '荧光笔划过超标行' },
      { id: 'K.cardIdentify', sec: this.K.cardIdentify, priority: 'P2' as const, want: 'beat' as const, note: '识别卡落定' },
      { id: 'K.cardCompare', sec: this.K.cardCompare, priority: 'P2' as const, want: 'beat' as const, note: '比对卡落定' },
      { id: 'K.cardLocate', sec: this.K.cardLocate, priority: 'P1' as const, want: 'downbeat' as const, note: '定位卡 + 原文连线亮' },
      { id: 'K.cardReport', sec: this.K.cardReport, priority: 'P1' as const, want: 'downbeat' as const, note: '差异报告卡落定' },
      { id: 'K.frameHeavy', sec: this.K.frameHeavy, priority: 'P0' as const, want: 'drop' as const, note: '暗场重拍 climax2' },
      { id: 'K.twinDrop', sec: this.K.twinDrop, priority: 'P1' as const, want: 'downbeat' as const, note: '后台卡 + 手机同落' },
      { id: 'K.num5280', sec: this.K.num5280, priority: 'P0' as const, want: 'drop' as const, note: '8,600 份落定 hero-hit' },
      { id: 'K.num38', sec: this.K.num38, priority: 'P0' as const, want: 'drop' as const, note: '38 秒 + logo 落版' },
    ];
  }
}
