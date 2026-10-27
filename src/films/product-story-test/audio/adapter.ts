import { ElasticZone, FilmAdapter, PaletteSpec, SpotAnnotation, VisualHit } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';
import { K as WK, EVENTS, MUSIC_KEY } from '../world/layout';
import { autoSpots, SoundMap, MotionEvent } from '../../../shared/events';

/**
 * product-story 风格样片的声音适配器。按风格 STYLE.md「声音」：
 *   界面拟音全部轻（落定软咔、打字和计数的细颗粒、标题的气声），成组落定按配乐调走音高；
 *   暗场一亮是低频重拍（第二高潮，作曲前面静默半小节），片尾收束是主高潮。全部分层合成，无口播。
 * 音效槽用本片独有的名字（ps*）。
 */
const SOUND_MAP: SoundMap = {
  land: { slot: 'psLand', layer: 'UI', pitched: true },
  pop: { slot: 'psLand', layer: 'UI', pitched: true },
  count: { slot: 'psTick', layer: 'UI' },
  focus: { slot: 'psAir', layer: 'WHOOSH' },
  morph: { slot: 'psSlide', layer: 'WHOOSH' },
  draw: { slot: 'psSwell', layer: 'RISER' },
  reveal: { slot: 'psSwell', layer: 'RISER' },
  stamp: { slot: 'psStamp', layer: 'IMPACT' },
  hero: { slot: 'psHero', layer: 'IMPACT' },
  tick: { slot: 'psTick', layer: 'UI' },
  preHit: { slot: 'psPre', layer: 'RISER', leadSec: 0.6 },
};

export class ProductStoryTestAdapter implements FilmAdapter {
  filmId = 'product-story-test';
  title = 'product-story 风格样片（售后工单助手 · 虚构）';
  fps = 60 as const;
  width = 1920;
  height = 1080;
  timeline = FILM_PLAN;

  SC: Record<string, number> = {
    open: FILM_PLAN.sceneStart('open'),
    ui: FILM_PLAN.sceneStart('ui'),
    stage: FILM_PLAN.sceneStart('stage'),
    numbers: FILM_PLAN.sceneStart('numbers'),
    end: FILM_PLAN.totalSeconds,
  };

  K: Record<string, number> = { ...WK };

  /** K 表的引用对账由「动作事件覆盖」接替 */
  ignoredKeys: string[] = Object.keys(WK).filter((k) => !['ignite', 'final'].includes(k));

  palette: Record<string, PaletteSpec> = {
    psRoom: { slot: 'psRoom', layer: 'BG', cat: 'ambient', tags: 'layered, room-tone', dur: [29, 31], variants: 1, align: 'onset', gain: 0.35 },
    psLand: { slot: 'psLand', layer: 'UI', cat: 'ui', tags: 'layered, card-land, pluck', dur: [0.5, 0.7], variants: 1, align: 'onset', gain: 0.45 },
    psTick: { slot: 'psTick', layer: 'UI', cat: 'ui', tags: 'layered, count-tick', dur: [0.04, 0.1], variants: 1, align: 'onset', gain: 0.25 },
    psAir: { slot: 'psAir', layer: 'WHOOSH', cat: 'whoosh', tags: 'layered, focus-air', dur: [0.3, 0.4], variants: 1, align: 'onset', gain: 0.28 },
    psSlide: { slot: 'psSlide', layer: 'WHOOSH', cat: 'whoosh', tags: 'layered, morph-slide', dur: [0.8, 1.0], variants: 1, align: 'onset', gain: 0.45 },
    psSwell: { slot: 'psSwell', layer: 'RISER', cat: 'riser', tags: 'layered, reveal-swell', dur: [0.8, 1.0], variants: 1, align: 'onset', gain: 0.35 },
    psStamp: { slot: 'psStamp', layer: 'IMPACT', cat: 'impact', tags: 'layered, stamp', dur: [0.4, 0.6], variants: 1, align: 'onset', gain: 0.5 },
    psHero: { slot: 'psHero', layer: 'IMPACT', cat: 'impact', tags: 'layered, hero-hit', dur: [2.2, 2.6], variants: 1, align: 'onset', gain: 0.85 },
    psPre: { slot: 'psPre', layer: 'RISER', cat: 'riser', tags: 'layered, pre-hit', dur: [0.6, 0.8], variants: 1, align: 'peak', gain: 0.45 },
  };

  events(): MotionEvent[] {
    return EVENTS;
  }

  spots(): SpotAnnotation[] {
    return [
      { id: '房间底噪', fromSec: 0, toSec: FILM_PLAN.totalSeconds, layer: 'BG', slot: 'psRoom', what: '全片极轻的空气声（无音高）' },
      ...autoSpots(EVENTS, SOUND_MAP, { key: MUSIC_KEY }),
    ];
  }

  typings() {
    return [];
  }

  /** 每段的停留可以轻微伸缩；暗场一亮和片尾落定之后刚性 */
  zones(): ElasticZone[] {
    const total = FILM_PLAN.totalSeconds;
    const K = this.K;
    return [
      { name: 'open', kind: 'hold', fromSec: 0, toSec: K.fly },
      { name: 'fly', kind: 'motion', fromSec: K.fly, toSec: K.flyLand },
      { name: 'ui', kind: 'hold', fromSec: K.flyLand, toSec: K.dim },
      { name: 'stage', kind: 'hold', fromSec: K.dim, toSec: K.out },
      { name: 'numbers', kind: 'hold', fromSec: K.out, toSec: K.final - 0.3 },
      { name: 'finale-rigid', kind: 'video', fromSec: K.final - 0.3, toSec: total },
    ];
  }

  hits(): VisualHit[] {
    const K = this.K;
    return [
      { id: 'K.ignite', sec: K.ignite, priority: 'P1', want: 'downbeat', note: '暗场光点点亮' },
      { id: 'K.final', sec: K.final, priority: 'P0', want: 'drop', note: '收束：128 格全亮' },
    ];
  }
}
