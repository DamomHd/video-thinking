/**
 * 镜头轨 (Shot Rail)：一个世界、多个取景，镜头在取景之间移动
 *
 * 参考片开头 22 秒是一个连续镜头：同一条轨道一直在画面里，
 * 「背景 → 交接 → 要换轨 → 换轨标题」都是同一个世界里的不同取景，
 * 封面是镜头运动的落点，不是第一页。
 *
 * 本仓库原来的写法是每幕一个 Stage、镜头只在幕内推 4%，幕与幕之间整页淡化 ——
 * 镜头只用来「防止画面冻住」，没用来叙事。这里补的是「镜头叙事」那一层：
 *
 *   1. frameRect —— 「把世界里这块区域装进画面」换算成机位，编排时只想取景、不算像素
 *   2. shotRail  —— 一串取景 + 到达/离开时间 → CamKey[]；停留时缓推，移动时可以拉远再推近（弧线）
 *   3. worldSec  —— 幕内秒还原成全片乐谱秒：多幕共用同一个世界组件时，世界只认这一个时钟
 *
 * 跨幕连续的用法（不需要改幕表 schema）：
 *   相邻两幕 overlap = 0、enter = 'none'，两幕都渲同一个世界组件、都用 worldSec 驱动，
 *   切点前后两帧像素相同，幕边界在画面上不存在 —— 幕只剩给声音/对拍/单幕合成分段的作用。
 */

import { CamKey } from './camera';
import { camInOut, clamp01 } from './anim';
import { Rect } from './morph';
import { ScenePlanResolved } from './types';

export interface Framing {
  x: number;
  y: number;
  z: number;
}

/**
 * 把世界坐标里的矩形（左上原点，和 Stage 世界层的像素坐标一致）装进画面。
 * margin 是四周留白占画面的比例；矩形和画面比例不同时按较紧的一边定 z。
 */
export function frameRect(
  rect: Rect,
  options: { stage?: [number, number]; margin?: number } = {}
): Framing {
  const [W, H] = options.stage ?? [1920, 1080];
  const m = options.margin ?? 0.08;
  const z = Math.max(rect.w / (W * (1 - 2 * m)), rect.h / (H * (1 - 2 * m)));
  return { x: rect.x + rect.w / 2 - W / 2, y: rect.y + rect.h / 2 - H / 2, z };
}

export interface ShotStop {
  frame: Framing;
  /** 到位时刻（秒）—— 上一个取景到这里的移动在此刻结束 */
  arrive: number;
  /** 离开时刻（秒），缺省 = 下一站开始移动的时刻 = 到位后停住直到下一站 */
  leave?: number;
}

export interface ShotRailOptions {
  /** 停留期间缓推到 z × holdPush（默认 0.985），停住读字时画面不冻 */
  holdPush?: number;
  /**
   * 移动距离超过半个画面时，中途拉远到 z × arc 再推近（默认 1.25，传 1 关掉）。
   * 这是「镜头感」的主要来源：观众在移动中看到了世界的全貌，知道自己从哪来到哪去。
   */
  arc?: number;
}

const camIn = (p: number): number => Math.pow(clamp01(p), 3.5);
const camOutOnly = (p: number): number => 1 - Math.pow(1 - clamp01(p), 3.5);

/**
 * 一串取景 → CamKey[]，交给 evalCamera。
 *
 * 每站产生「到位」「离开」两个键：到位→离开之间是停留（缓推），离开→下一站到位之间是移动。
 * 移动段用 camInOut；带弧线时拆成「加速拉远」+「减速推近」两半，中点速度连续。
 */
export function shotRail(stops: ShotStop[], options: ShotRailOptions = {}): CamKey[] {
  const holdPush = options.holdPush ?? 0.985;
  const arc = options.arc ?? 1.25;
  const keys: CamKey[] = [];
  stops.forEach((s, i) => {
    const next = stops[i + 1];
    const leave = s.leave ?? (next ? next.arrive - moveSec(s, next) : s.arrive);
    const held = { ...s.frame, z: s.frame.z * holdPush };
    keys.push({ t: s.arrive, ...s.frame, ease: (p) => p });
    if (leave > s.arrive + 1e-6) keys.push({ t: leave, ...held });
    if (!next) return;
    // 最后一个键管的是「移动」这一段
    keys[keys.length - 1].ease = camInOut;
    const from = leave > s.arrive + 1e-6 ? held : s.frame;
    const dist = Math.hypot(next.frame.x - from.x, next.frame.y - from.y) / Math.max(from.z, next.frame.z);
    if (arc > 1 && dist > 960) {
      keys[keys.length - 1].ease = camIn;
      const tm = (leave + next.arrive) / 2;
      keys.push({
        t: tm,
        x: (from.x + next.frame.x) / 2,
        y: (from.y + next.frame.y) / 2,
        z: Math.max(from.z, next.frame.z) * arc,
        ease: camOutOnly,
      });
    }
  });
  return keys;
}

/** 两站之间默认移动多久：按屏幕上的位移和缩放比例估，1.2–2.4s */
function moveSec(a: ShotStop, b: ShotStop): number {
  const dist = Math.hypot(b.frame.x - a.frame.x, b.frame.y - a.frame.y) / Math.max(a.frame.z, b.frame.z);
  const zoom = Math.abs(Math.log(b.frame.z / a.frame.z));
  const est = 1.2 + dist / 1920 + zoom * 0.8;
  return Math.min(2.4, Math.min(est, Math.max(0, b.arrive - a.arrive)));
}

/** 幕内秒 → 全片乐谱秒。多幕共用一个世界时，世界组件只认这个时钟 */
export function worldSec(scene: Pick<ScenePlanResolved, 'start'>, localSec: number): number {
  return scene.start + localSec;
}
