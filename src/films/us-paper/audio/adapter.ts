import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation, VisualHit } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';

/**
 * Us (IntimaMate) 30 秒宣传片声音适配器
 */
export class UsPaperAdapter implements FilmAdapter {
  filmId = 'us-paper';
  title = 'Us · 一页纸产品说明（图纸版）';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  // 段落起点字典 (秒)
  SC: Record<string, number> = {
    cover: FILM_PLAN.sceneStart('cover'),
    record: FILM_PLAN.sceneStart('record'),
    river: FILM_PLAN.sceneStart('river'),
    stats: FILM_PLAN.sceneStart('stats'),
    privacy: FILM_PLAN.sceneStart('privacy'),
    finale: FILM_PLAN.sceneStart('finale'),
    end: FILM_PLAN.totalSeconds,
  };

  /** 关键拍点字典 (秒) */
  K: Record<string, number> = {
    firstMark: this.SC.cover + 2.4,     // 第一个记录点落在轴上
    fieldsIn: this.SC.record + 1.1,     // 字段明细开始逐行出现
    scatter: this.SC.river + 1.5,       // 22 个散点开始落
    barsGrow: this.SC.stats + 0.9,      // 柱子生长
    boundary: this.SC.privacy + 0.6,    // 设备边界画出来
    logoSet: this.SC.finale + 0.8,      // 落版
  };

  /**
   * K.fieldsIn 故意不配声：字段明细是一行行**文字**浮现，
   * 给每一行都配一声会变成打字机，和这套风格的克制气质相反。
   * 保留这个键是因为画面侧要用它定逐行出现的起点。
   */
  ignoredKeys: string[] = [];

  // 音效采购调色板
  /**
   * 采购单：图纸风的听感是「铅笔画线、图章落下、纸张翻页」，
   * 不是宣传片那种华丽的 riser + impact。
   * 层的用法也不同 —— TEX 做笔尖，UI 做图章，RISER 只在落版前用一次。
   */
  palette: Record<string, PaletteSpec> = {
    paperRoom: {
      slot: 'paperRoom',
      layer: 'BG',
      cat: 'ambient',
      tags: 'room tone, quiet, paper, studio, soft',
      dur: [6.0, 14.0],
      variants: 1,
      align: 'onset',
      gain: 0.5,
    },
    penStroke: {
      slot: 'penStroke',
      layer: 'TEX',
      cat: 'foley',
      tags: 'pencil, pen, draw, paper, write, stroke',
      dur: [0.3, 1.6],
      variants: 1,
      align: 'onset',
      gain: 0.75,
    },
    stampTick: {
      slot: 'stampTick',
      layer: 'UI',
      cat: 'ui',
      tags: 'stamp, tick, click, mechanical, dry',
      dur: [0.08, 0.45],
      variants: 1,
      align: 'onset',
      gain: 0.7,
    },
    pageTurn: {
      slot: 'pageTurn',
      layer: 'WHOOSH',
      cat: 'foley',
      tags: 'paper, page turn, sheet, flip, soft',
      dur: [0.3, 1.2],
      variants: 1,
      align: 'onset',
      gain: 0.6,
    },
    setMark: {
      slot: 'setMark',
      layer: 'IMPACT',
      cat: 'impact',
      tags: 'soft thud, book close, wood, warm, low',
      dur: [0.8, 2.5],
      variants: 1,
      align: 'onset',
      gain: 0.9,
    },
  };

  spots(): SpotAnnotation[] {
    const pageTurns = [this.SC.record, this.SC.river, this.SC.stats, this.SC.privacy, this.SC.finale];
    return [
      {
        id: '安静的纸面底噪',
        fromSec: 0,
        toSec: FILM_PLAN.totalSeconds,
        layer: 'BG',
        slot: 'paperRoom',
        what: '全片一层极轻的室内底噪，让画面「落在纸上」',
      },
      // 每次翻页一声纸响 —— 图号从 US-00 走到 US-05，共五次
      ...pageTurns.map((sec, i) => ({
        id: `翻页 US-0${i + 1}`,
        fromSec: sec,
        toSec: sec + 0.8,
        layer: 'WHOOSH' as const,
        slot: 'pageTurn',
        what: `翻到第 ${i + 2} 屏`,
        force: true,
      })),
      {
        id: '第一笔落点',
        fromSec: this.K.firstMark,
        toSec: this.K.firstMark + 0.35,
        layer: 'UI',
        slot: 'stampTick',
        what: '第一个记录点钉在时间轴上',
      },
      {
        id: '画出散点',
        fromSec: this.K.scatter,
        toSec: this.K.scatter + 1.4,
        layer: 'TEX',
        slot: 'penStroke',
        what: '22 个散点逐个落下的笔触',
      },
      {
        id: '柱子生长',
        fromSec: this.K.barsGrow,
        toSec: this.K.barsGrow + 1.0,
        layer: 'TEX',
        slot: 'penStroke',
        what: '频率柱逐根画出来',
      },
      {
        id: '边界合拢',
        fromSec: this.K.boundary,
        toSec: this.K.boundary + 0.35,
        layer: 'UI',
        slot: 'stampTick',
        what: '设备边界闭合的那一下',
      },
      {
        id: '落版图章',
        fromSec: this.K.logoSet,
        toSec: this.K.logoSet + 2.0,
        layer: 'IMPACT',
        slot: 'setMark',
        what: 'Us 落版 —— 像图章盖在图纸上',
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
  /**
   * 弹性区：这套风格 82% 的时间是静止的，所以几乎每一屏都可以给足弹性 ——
   * 画面没在动，拉伸一点没人看得出来。
   * 只有「柱子生长」「散点落下」这两段有连续动作，收到 motion 档。
   * 落版刚性：图章落下那一刻的时值不能动。
   */
  zones(): ElasticZone[] {
    const total = FILM_PLAN.totalSeconds;
    /**
     * 这套风格 82% 的帧是静止的，所以弹性区要按「这一段画面到底动不动」来划，
     * 不能按幕划 —— 整幕一律给 motion 的话，静止段白白浪费了 30% 的预算，
     * 反而把需要对齐的拍点挤掉（实测 K.barsGrow 就因为差 4ms 被放弃）。
     *
     * 每一幕里真正有连续动作的只有：散点逐个落、柱子逐根长。
     * 这两段收到 motion（3% 上限），其余静止段一律 hold（30% 上限）。
     */
    const scatterFrom = this.K.scatter;
    const scatterTo = this.K.scatter + 1.9;
    const barsFrom = this.K.barsGrow - 0.3;
    const barsTo = this.K.barsGrow + 1.3;

    return [
      { name: 'cover-hold', kind: 'hold', fromSec: 0, toSec: this.SC.record },
      { name: 'record-hold', kind: 'hold', fromSec: this.SC.record, toSec: scatterFrom },
      { name: 'scatter-motion', kind: 'motion', fromSec: scatterFrom, toSec: scatterTo },
      { name: 'river-hold', kind: 'hold', fromSec: scatterTo, toSec: barsFrom },
      { name: 'bars-motion', kind: 'motion', fromSec: barsFrom, toSec: barsTo },
      { name: 'stats-hold', kind: 'hold', fromSec: barsTo, toSec: this.SC.finale },
      { name: 'finale-rigid', kind: 'video', fromSec: this.SC.finale, toSec: total },
    ];
  }

  hits(): VisualHit[] {
    return [
      {
        id: 'K.firstMark',
        sec: this.K.firstMark,
        priority: 'P2' as const,
        want: 'beat' as const,
        note: '第一个记录点落在轴上',
      },
      {
        id: 'K.scatter',
        sec: this.K.scatter,
        priority: 'P1' as const,
        want: 'downbeat' as const,
        note: '22 个散点开始落',
      },
      {
        id: 'K.barsGrow',
        sec: this.K.barsGrow,
        priority: 'P1' as const,
        want: 'downbeat' as const,
        note: '频率柱生长',
      },
      {
        id: 'K.logoSet',
        sec: this.K.logoSet,
        priority: 'P0' as const,
        want: 'drop' as const,
        note: 'Us 落版图章',
      },
    ];
  }
}
