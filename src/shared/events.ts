/**
 * 动作事件表 → 自动配声
 *
 * 问题：画面动作和声音是两份各写各的清单，画面加了一个数字滚动，声音不会知道，漏没漏全靠人记得。
 * 解法：片子把画面上的动作登记成事件（同一份时间单源，画面和声音都从这里取时间），
 *       声音按事件类型自动生成；没配声、也没写明为什么留白的事件，守门报出来。
 *
 * 编排（哪些动作登记、用什么分量、哪些故意留白）由片子决定；这里只做「事件 → 音效」的衔接。
 */

import { SpotAnnotation, AudioLayer, SfxLayer } from './types';
import { countUp } from './anim';
import { scaleSemis } from './beats';

export type MotionKind =
  | 'count'   // 数字滚动
  | 'reveal'  // 渐显 / 图片浮现
  | 'pop'     // 弹出（小元素）
  | 'land'    // 卡片落定
  | 'focus'   // 拉焦换字
  | 'morph'   // 形变挪位
  | 'draw'    // 描线 / 铺开
  | 'stamp'   // 盖章 / 确认
  | 'hero';   // 全片级的重拍（落版等）

export type MotionWeight = 'light' | 'normal' | 'heavy';

export interface MotionEvent {
  id: string;
  kind: MotionKind;
  /** 动作开始（乐谱秒） */
  at: number;
  /** 到位 / 落定时刻；缺省 = at */
  land?: number;
  /** 结束时刻（描线 / 数字滚动这类持续动作）；缺省 = land */
  end?: number;
  weight?: MotionWeight;
  /** 数字滚动：起止值（用来按滚动曲线排咔哒声） */
  count?: { from: number; to: number };
  /** 故意留白：写明理由，守门放行 */
  silent?: string;
  /** 一组里的第几个（序列音高按它走） */
  index?: number;
  of?: number;
}

/** 声音映射：事件类型 → 槽（片子在适配器里给，换风格换一张表） */
export type SoundMap = Partial<Record<MotionKind, { slot: string; layer: SfxLayer; pitched?: boolean }>> & {
  /** 重拍前的反向吸气（heavy / hero 事件落定前） */
  preHit?: { slot: string; layer: SfxLayer; leadSec?: number };
  /** 数字滚动的咔哒 */
  tick?: { slot: string; layer: SfxLayer };
};

/**
 * 数字滚动的咔哒时刻：按 anim.countUp 的滚动曲线（easeOutExpo，前快后慢）把值域等分成 n 份，
 * 每跨过一份响一下 —— 开头密、越接近终值越疏，和数字跳动的观感一致。
 */
export function countTicks(at: number, durSec: number, n = 12): number[] {
  const out: number[] = [];
  const STEPS = Math.max(1, Math.round(durSec * 240));
  let next = 1;
  // 用整数步数采样（浮点累加会漏掉终点那一刻）
  for (let k = 0; k <= STEPS && next <= n; k++) {
    const t = (k / STEPS) * durSec;
    const v = countUp(t, 0, n * 1000, durSec) / 1000;
    while (next <= n && v >= next) {
      out.push(Math.round((at + t) * 10000) / 10000);
      next++;
    }
  }
  return out;
}

/**
 * 事件表 → 音效标注。每条标注的 id 以事件 id 开头（守门据此对账）。
 *   land / pop / stamp / hero / reveal / focus / morph / draw：落定（或开始）那一刻一声
 *   pitched 的槽按组内序号走配乐调内的音阶
 *   count：滚动过程的一串咔哒 + 落定一声
 *   heavy / hero：落定前加一段反向吸气（preHit）
 */
export function autoSpots(events: MotionEvent[], map: SoundMap, options: { key?: string } = {}): SpotAnnotation[] {
  const spots: SpotAnnotation[] = [];
  for (const e of events) {
    if (e.silent) continue;
    const land = e.land ?? e.at;
    const end = e.end ?? land;
    const m = map[e.kind];
    if (e.kind === 'count' && map.tick) {
      countTicks(e.at, Math.max(0.2, end - e.at), 10).forEach((t, i) =>
        spots.push({ id: `${e.id} · 咔哒 ${i + 1}`, fromSec: t, toSec: t + 0.06, layer: map.tick!.layer, slot: map.tick!.slot, what: `${e.id} 数字滚动` })
      );
    }
    if (m) {
      // 描线 / 铺开这类持续动作：声音铺满动作区间；其余落在到位那一刻
      const sustained = e.kind === 'draw' || e.kind === 'reveal';
      const from = sustained ? e.at : land;
      const to = sustained ? Math.max(end, e.at + 0.3) : land + 0.4;
      const spot: SpotAnnotation = { id: e.id, fromSec: from, toSec: to, layer: m.layer, slot: m.slot, what: `${e.kind} · ${e.id}` };
      if (m.pitched && e.index !== undefined) spot.pitchSemis = scaleSemis(e.index, e.of ?? 1, { key: options.key });
      spots.push(spot);
    }
    if ((e.weight === 'heavy' || e.kind === 'hero') && map.preHit) {
      const lead = map.preHit.leadSec ?? 0.6;
      spots.push({ id: `${e.id} · 吸气`, fromSec: Math.max(0, land - lead), toSec: land, layer: map.preHit.layer, slot: map.preHit.slot, what: `${e.id} 落定前的反向吸气`, force: true });
    }
  }
  return spots;
}

/** 覆盖对账：没有任何以事件 id 开头的音效、也没写 silent 理由的事件 */
export function uncoveredEvents(events: MotionEvent[], spots: SpotAnnotation[]): MotionEvent[] {
  return events.filter((e) => !e.silent && !spots.some((s) => s.id === e.id || s.id.startsWith(`${e.id} `)));
}

/** 一组元素按落点生成事件（序号 / 组大小自动带上，序列音高按它走） */
export function eventGroup(idPrefix: string, kind: MotionKind, lands: number[], options: { dur?: number; weight?: MotionWeight } = {}): MotionEvent[] {
  return lands.map((land, i) => ({
    id: `${idPrefix} ${i + 1}`,
    kind,
    at: land - (options.dur ?? 0.3),
    land,
    weight: options.weight,
    index: i,
    of: lands.length,
  }));
}
