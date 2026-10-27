/**
 * 质感床 / 氛围床：铺在段落底下的长音色（声音的「底色」），跟着段落换。
 *
 * 动作事件表（events.ts）只会生成「点」：落定、描线、重拍……一个动作一声。
 * 段落底下那层持续的颜色——这一段暖、下一段紧、暗场里低沉、结尾打开——要按段落另外铺，就是这里。
 *
 * 片子在适配器 spots() 里调用 sectionBeds(段落表, { key })：
 *   · 每段一条：写这一段用哪个槽（采购单里 tags 写 `layered, texture-bed, warm|air|low|glass|tension`，或 CC0 的 drone / texture 素材）；
 *     slot 写 null = 这一段故意不铺（留白，写在 what 里说明）
 *   · 相邻两段的床互相伸进去 xfadeSec / 2，交叉淡化（循环素材本身有 0.667s 的淡入淡出）
 *   · carve：要真静默的区间（重拍前的屏息、口播最要紧的一句），床在这里断开，静默之后再接上
 *   · 有调号时整体变调到配乐的主音（素材调在 A），和配乐不打架
 * 纯函数，同输入同输出。
 */
import { SfxLayer, SpotAnnotation } from './types';
import { camelotTonic } from './beats';

export interface BedSection {
  /** 段落名（会进音效 id：「质感床 · <id>」） */
  id: string;
  from: number;
  to: number;
  /** 这一段用的槽；null = 故意不铺 */
  slot: string | null;
  /** 这一段为什么用这个音色（进工作台和 spot sheet） */
  what?: string;
}

export interface BedOptions {
  /** 铺在哪一层，缺省 TEX（质感床）；氛围随段落换时用 BG */
  layer?: SfxLayer;
  /** 相邻两段的交叉淡化总长（秒），缺省 1.2 */
  xfadeSec?: number;
  /** 要真静默的区间（乐谱秒） */
  carve?: [number, number][];
  /** 配乐调号（Camelot，music.json 的 track.key）；给了就把 A 调的素材变到主音 */
  key?: string;
  /** 片段太短就不铺（秒），缺省 0.8 */
  minSec?: number;
}

/** 把 A 调的床变到配乐主音：取离 A 最近的那个八度（−6…+5 半音，变调越少音色越不走样） */
export function bedSemis(key: string | undefined): number {
  if (!key) return 0;
  const s = camelotTonic(key).semisFromA;
  return s > 5 ? s - 12 : s;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** 从一段区间里挖掉 carve 区间，返回剩下的几段 */
function subtract(a: number, b: number, carve: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]];
  for (const [c0, c1] of [...carve].sort((x, y) => x[0] - y[0])) {
    parts = parts.flatMap(([p0, p1]) => {
      if (c1 <= p0 || c0 >= p1) return [[p0, p1] as [number, number]];
      const out: [number, number][] = [];
      if (c0 > p0) out.push([p0, c0]);
      if (c1 < p1) out.push([c1, p1]);
      return out;
    });
  }
  return parts;
}

export function sectionBeds(sections: BedSection[], options: BedOptions = {}): SpotAnnotation[] {
  const layer = options.layer ?? 'TEX';
  const half = (options.xfadeSec ?? 1.2) / 2;
  const minSec = options.minSec ?? 0.8;
  const semis = bedSemis(options.key);
  const name = layer === 'BG' ? '氛围床' : '质感床';
  const sorted = [...sections].sort((x, y) => x.from - y.from);
  const out: SpotAnnotation[] = [];
  sorted.forEach((s, i) => {
    if (!s.slot) return;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    // 和有床的邻段交叉淡化：两边各伸进去 half；邻段留白时不伸
    const a = prev?.slot ? Math.max(0, s.from - half) : s.from;
    const b = next?.slot ? s.to + half : s.to;
    const parts = subtract(a, b, options.carve ?? []).filter(([p0, p1]) => p1 - p0 >= minSec);
    parts.forEach(([p0, p1], k) => {
      const spot: SpotAnnotation = {
        id: `${name} · ${s.id}${parts.length > 1 ? ` ${k + 1}` : ''}`,
        fromSec: r3(p0),
        toSec: r3(p1),
        layer,
        slot: s.slot!,
        what: s.what ?? `${name}（${s.id}）`,
        force: true,
      };
      if (semis) spot.pitchSemis = semis;
      out.push(spot);
    });
  });
  return out;
}
