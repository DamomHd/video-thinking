/**
 * Adapt 配方池 (对标 architecture.html §16.3)
 *   "配方池：r8、r16、r8-peak、r8-noIntro、r16-peak、r12、r8-noBuild、r8-peak-noIntro，取前 N 个。
 *    快速改编 N=1，比选改编 N=6。"
 *
 * 要点：**接口没有 recipe 这个字段**（实测 EditRecording 的 input 只有
 * targetDurationMs / loopable / preferenceRegions / requiredRegionsAtOffsets /
 * downloadAudioFormat / skipStems / maxResults / forceDuration）。
 * 所以「配方」是客户端的概念 —— 一组命名好的参数组合：
 *   r8 / r12 / r16  段落偏好的粒度（按 8 / 12 / 16 小节划分偏好区）
 *   peak            钉主高潮（requiredRegionsAtOffsets）
 *   noIntro         把 intro 段标成 AVOID
 *   noBuild         把 build 段标成 AVOID
 * 不同组合让接口在同一段素材上给出不同的剪法，再用改编候选分挑最好的那版。
 */

import { BeatGrid } from '../sync/analyze.js';

export type RecipeName =
  | 'r8' | 'r16' | 'r8-peak' | 'r8-noIntro' | 'r16-peak'
  | 'r12' | 'r8-noBuild' | 'r8-peak-noIntro'
  | 'custom' | 'custom16' | 'custom16-peak';

/** 配方池的排序就是优先级：取前 N 个 */
export const RECIPE_POOL: RecipeName[] = [
  'r8', 'r16', 'r8-peak', 'r8-noIntro', 'r16-peak', 'r12', 'r8-noBuild', 'r8-peak-noIntro',
];

/** 带自定义偏好时的池子（§16.3：快速只跑 custom，比选再加 custom16 / custom16-peak） */
export const CUSTOM_POOL: RecipeName[] = ['custom', 'custom16', 'custom16-peak'];

export interface PreferenceRegion {
  fromSec: number;
  toSec: number;
  preference: 'more' | 'less';
}

export interface RecipeSpec {
  name: RecipeName;
  /**
   * 小节数，管两件事：
   *   1. 钉高潮时要保住的 drop 区间长度（bars × barSec）
   *   2. 偏好区的切片粒度
   * 只当切片粒度的话 r8 和 r16 会跑出完全一样的结果 —— 实测过，
   * 因为 drop 段本身比两种切片都短，切不开。
   */
  bars: number;
  /** 要不要钉主高潮 */
  pinDrop: boolean;
  /** 要 AVOID 掉哪些段落类型 */
  avoid: ('intro' | 'build' | 'bridge' | 'outro')[];
}

export function parseRecipe(name: RecipeName): RecipeSpec {
  const bars = /16/.test(name) ? 16 : /12/.test(name) ? 12 : 8;
  return {
    name,
    bars,
    pinDrop: name.includes('peak'),
    avoid: [
      ...(name.includes('noIntro') ? (['intro'] as const) : []),
      ...(name.includes('noBuild') ? (['build'] as const) : []),
    ],
  };
}

/**
 * 把配方 + 真实分析翻成段落偏好区。
 * 用分析出来的 sections：drop 段永远 PREFER，avoid 列表里的类型标 AVOID。
 * 尾奏（outro）一律不标 AVOID —— §18.3 的规矩："尾奏和 drop 段不许设成少用"。
 */
export function recipePreferences(
  spec: RecipeSpec,
  grid: BeatGrid,
  custom?: PreferenceRegion[]
): PreferenceRegion[] {
  if (spec.name.startsWith('custom')) {
    return (custom ?? []).filter((r) => r.toSec > r.fromSec);
  }

  const out: PreferenceRegion[] = [];
  const sections = grid.sections ?? [];
  if (sections.length === 0) return out;

  const barSec0 = grid.barSec > 0 ? grid.barSec : 2;
  for (const sec of sections) {
    if (sec.kind === 'drop') {
      /**
       * PREFER 窗口从 drop 段首起算 spec.bars 小节，**只按曲长裁，不按段尾裁**。
       * 裁到段尾的话 8 小节和 16 小节会被裁成同一个区间（drop 段往往不到 8 小节），
       * r8 和 r16 就跑出字节完全相同的结果 —— 实测踩过。
       */
      out.push({
        fromSec: sec.startSec,
        toSec: Math.min(grid.totalSec, sec.startSec + spec.bars * barSec0),
        preference: 'more',
      });
      continue;
    }
    if (sec.kind === 'outro') continue; // 尾奏不许标少用
    if (spec.avoid.includes(sec.kind as 'intro' | 'build' | 'bridge')) {
      out.push({ fromSec: sec.startSec, toSec: sec.endSec, preference: 'less' });
    }
  }

  // 粒度：按 spec.bars 把过长的偏好区切开，让接口有更细的选择空间
  const barSec = grid.barSec > 0 ? grid.barSec : 2;
  const maxLen = barSec * spec.bars;
  const sliced: PreferenceRegion[] = [];
  for (const r of out) {
    let from = r.fromSec;
    while (from < r.toSec - 1e-6) {
      const to = Math.min(r.toSec, from + maxLen);
      sliced.push({ fromSec: from, toSec: to, preference: r.preference });
      from = to;
    }
  }
  return sliced;
}

/** 钉高潮时要保住的区间长度（秒）：配方的小节数 × 小节长 */
export function requiredRegionSec(spec: RecipeSpec, barSec: number): number {
  return spec.bars * (barSec > 0 ? barSec : 2);
}

/** 取前 N 个配方（快速 N=1，比选 N=6） */
export function recipesFor(pool: number, hasCustom: boolean): RecipeName[] {
  if (hasCustom) {
    return pool <= 1 ? ['custom'] : [...CUSTOM_POOL, ...RECIPE_POOL].slice(0, pool);
  }
  return RECIPE_POOL.slice(0, Math.max(1, pool));
}

/**
 * 校验人手设的段落偏好（§18.3）：尾奏和 drop 段不许设成「少用」。
 *
 * drop 是钉高潮的那一段、尾奏决定片子怎么收 —— 让接口少用它们，
 * 改编出来要么没有高潮、要么戛然而止。工作台界面会拦，
 * 但命令行和 API 也能直接传偏好进来，所以规则必须在后端再查一遍。
 *
 * 返回违规描述；空数组表示合法。
 */
/** drop 点起保护几个小节 —— 和钉高潮时要保住的长度一致 */
export const DROP_GUARD_BARS = 4;

export function validatePreferences(prefs: PreferenceRegion[], grid: BeatGrid): string[] {
  const errors: string[] = [];
  /**
   * 受保护的区间：被标成 drop / outro 的段，**再加上 drop 点起的 4 个小节**。
   *
   * 只认段落标签不够：分析器只在 drop 正好落在段落边界附近时才把那一段标成 drop，
   * 实测一首曲子 drop 在 93.46s，落在一段标成 build 的区间里（77.4–95.1），
   * 段落表里根本没有 drop 段 —— 只看标签的话，在它上面设「少用」照样放行。
   */
  const guarded: { kind: string; startSec: number; endSec: number }[] = (grid.sections ?? []).filter(
    (s) => s.kind === 'drop' || s.kind === 'outro'
  );
  // drop 点保护区放最前：同时压到 drop 和尾奏时先报 drop
  if (grid.dropSec > 0 && grid.barSec > 0) {
    guarded.unshift({
      kind: 'drop',
      startSec: grid.dropSec,
      endSec: Math.min(grid.totalSec, grid.dropSec + DROP_GUARD_BARS * grid.barSec),
    });
  }
  for (const p of prefs) {
    if (!(p.toSec > p.fromSec)) {
      errors.push(`偏好区 ${p.fromSec}–${p.toSec}s 起止不合法`);
      continue;
    }
    if (p.fromSec < 0 || p.toSec > grid.totalSec + 0.05) {
      errors.push(`偏好区 ${p.fromSec.toFixed(2)}–${p.toSec.toFixed(2)}s 越过了曲长 ${grid.totalSec}s`);
    }
    if (p.preference !== 'less') continue;
    // drop 段和 drop 点保护区常常重叠：一个偏好只报一次，报最先压到的那块
    const g = guarded.find((x) => p.fromSec < x.endSec && p.toSec > x.startSec);
    if (g) {
      errors.push(
        `${p.fromSec.toFixed(2)}–${p.toSec.toFixed(2)}s 设成了「少用」，但它压到了` +
          `${g.kind === 'drop' ? ' drop 段' : '尾奏'}（${g.startSec.toFixed(2)}–${g.endSec.toFixed(2)}s）`
      );
    }
  }
  return errors;
}
