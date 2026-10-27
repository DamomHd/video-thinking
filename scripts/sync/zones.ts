/**
 * 弹性区与位移分摊 (Elastic Zones & Displacement Distribution)
 * 对标 architecture.html §16.6 的第②层让步：
 *   画面让 —— 弹性区按 e·L 的比例分摊位移，刚性区一帧不动；
 *   超上限的夹紧，余量再分；取整后保证总和等于 round(D)。
 * 区的弹性档位与上限照抄原表：
 *   hold     e=1   上限 30%  位移 +2.0 / −0.4 s
 *   motion   e=0.3 上限  3%  位移 ±1.0 s
 *   physics / typing / video  e=0 一帧不动
 */

export type ZoneKind = 'hold' | 'motion' | 'physics' | 'typing' | 'video';

export interface ZoneSpec {
  elasticity: number;
  ratioCap: number;
  maxPlusSec: number;
  maxMinusSec: number;
}

export const ZONE_SPECS: Record<ZoneKind, ZoneSpec> = {
  hold: { elasticity: 1.0, ratioCap: 0.3, maxPlusSec: 2.0, maxMinusSec: 0.4 },
  motion: { elasticity: 0.3, ratioCap: 0.03, maxPlusSec: 1.0, maxMinusSec: 1.0 },
  physics: { elasticity: 0, ratioCap: 0, maxPlusSec: 0, maxMinusSec: 0 },
  typing: { elasticity: 0, ratioCap: 0, maxPlusSec: 0, maxMinusSec: 0 },
  video: { elasticity: 0, ratioCap: 0, maxPlusSec: 0, maxMinusSec: 0 },
};

export interface ZoneInput {
  name: string;
  kind: ZoneKind;
  fromSec: number;
  toSec: number;
  /**
   * 绝对位移上限的折算份额（默认 1）。
   * 区被锚点切开时，子区按长度份额继承父区的绝对上限，
   * 避免「切得越碎、总预算越大」。
   */
  capShare?: number;
}

export interface ResolvedZone extends ZoneInput, ZoneSpec {
  index: number;
  lengthSec: number;
  /** 已分摊到该区的位移（秒） */
  delta: number;
}

export interface ZoneValidation {
  valid: boolean;
  errors: string[];
}

/** 校验弹性区首尾相接、盖满全片（对标原版 check.mts 的 zones 规则） */
export function validateZones(zones: ZoneInput[], totalSec: number): ZoneValidation {
  const errors: string[] = [];
  if (zones.length === 0) {
    errors.push('zones 为空：必须盖满全片（刚性片也要显式声明 video 区）');
    return { valid: false, errors };
  }
  const sorted = [...zones].sort((a, b) => a.fromSec - b.fromSec);
  if (Math.abs(sorted[0].fromSec) > 1e-6) {
    errors.push(`首区未从 0 开始（实际 ${sorted[0].fromSec}s）`);
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].toSec <= sorted[i].fromSec) {
      errors.push(`区 '${sorted[i].name}' 区间非法: ${sorted[i].fromSec} → ${sorted[i].toSec}`);
    }
    if (i > 0 && Math.abs(sorted[i].fromSec - sorted[i - 1].toSec) > 1e-6) {
      errors.push(
        `区 '${sorted[i - 1].name}' 与 '${sorted[i].name}' 不相接: ${sorted[i - 1].toSec} ≠ ${sorted[i].fromSec}`
      );
    }
  }
  const last = sorted[sorted.length - 1];
  if (Math.abs(last.toSec - totalSec) > 0.01) {
    errors.push(`末区未盖到片尾（${last.toSec}s ≠ 总长 ${totalSec}s）`);
  }
  return { valid: errors.length === 0, errors };
}

/** 在给定时刻列表处切开弹性区，让每个锚点都落在区边界上（绝对上限按长度份额继承） */
export function splitZonesAt(zones: ZoneInput[], cuts: number[]): ZoneInput[] {
  const out: ZoneInput[] = [];
  for (const z of zones) {
    const inner = cuts
      .filter((c) => c > z.fromSec + 1e-6 && c < z.toSec - 1e-6)
      .sort((a, b) => a - b);
    const parentLen = z.toSec - z.fromSec;
    const parentShare = z.capShare ?? 1;
    let cursor = z.fromSec;
    for (const c of [...inner, z.toSec]) {
      const len = c - cursor;
      if (len <= 1e-9) continue;
      out.push({
        ...z,
        name: cursor === z.fromSec ? z.name : `${z.name}@${cursor.toFixed(2)}`,
        fromSec: cursor,
        toSec: c,
        capShare: parentLen > 0 ? parentShare * (len / parentLen) : parentShare,
      });
      cursor = c;
    }
  }
  return out.sort((a, b) => a.fromSec - b.fromSec);
}

/**
 * 把区表解析成带弹性参数的区段，并用最保守的刚性 video 区补齐 [spanFrom, spanTo] 内的缺口。
 */
export function resolveZones(
  zones: ZoneInput[],
  spanTo: number,
  spanFrom = 0
): ResolvedZone[] {
  const clipped = zones
    .map((z) => ({
      ...z,
      fromSec: Math.max(z.fromSec, spanFrom),
      toSec: Math.min(z.toSec, spanTo),
    }))
    .filter((z) => z.toSec - z.fromSec > 1e-9)
    .sort((a, b) => a.fromSec - b.fromSec);

  const filled: ZoneInput[] = [];
  let cursor = spanFrom;
  for (const z of clipped) {
    if (z.fromSec - cursor > 1e-6) {
      filled.push({ name: `auto-rigid@${cursor.toFixed(2)}`, kind: 'video', fromSec: cursor, toSec: z.fromSec });
    }
    filled.push(z);
    cursor = Math.max(cursor, z.toSec);
  }
  if (spanTo - cursor > 1e-6) {
    filled.push({ name: `auto-rigid@${cursor.toFixed(2)}`, kind: 'video', fromSec: cursor, toSec: spanTo });
  }

  return filled.map((z, index) => {
    const spec = ZONE_SPECS[z.kind];
    const share = z.capShare ?? 1;
    return {
      ...z,
      ...spec,
      maxPlusSec: spec.maxPlusSec * share,
      maxMinusSec: spec.maxMinusSec * share,
      index,
      lengthSec: z.toSec - z.fromSec,
      delta: 0,
    };
  });
}

/** 最大余数法：把浮点位移取整到帧，并保证总和等于 round(D) */
export function roundToFrames(
  values: number[],
  targetSec: number,
  fps: number,
  /**
   * 每一项最多能取多少秒（区的剩余额度）。
   *
   * 不传上限的话，最大余数法会把「多出来的那一帧」给余数最大的区，
   * 而不管它还有没有额度 —— 实测一个 1.9s 的 motion 区本来分到 1.71 帧（3% 以内），
   * 被进位成 2 帧，形变比率 3.51%，求解器自己写出了守门不认的结果。
   * 进位只能进到还有余量的区；进不了就少达成一点，交给锚点的残差容差去判。
   */
  maxSecs?: number[]
): number[] {
  const targetFrames = Math.round(targetSec * fps);
  const raw = values.map((v) => v * fps);
  const floors = raw.map((v) => Math.floor(v + 1e-9));
  const capFrames = raw.map((v, i) =>
    maxSecs ? Math.floor(maxSecs[i] * fps + 1e-6) : Number.POSITIVE_INFINITY
  );
  let used = floors.reduce((a, c) => a + c, 0);
  const remainders = raw
    .map((v, i) => ({ i, rem: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.rem - a.rem);
  let k = 0;
  while (used < targetFrames && k < remainders.length * 4) {
    const i = remainders[k % remainders.length].i;
    k += 1;
    if (floors[i] + 1 > capFrames[i]) continue; // 这个区没额度了，进位给下一个
    floors[i] += 1;
    used += 1;
  }
  while (used > targetFrames) {
    // 从分摊最多的区回收
    let maxI = 0;
    for (let i = 1; i < floors.length; i++) if (floors[i] > floors[maxI]) maxI = i;
    if (floors[maxI] === 0) break;
    floors[maxI] -= 1;
    used -= 1;
  }
  return floors.map((f) => f / fps);
}

export type AllocFailReason = 'rigid-grid' | 'budget' | null;

export interface AllocResult {
  achievedSec: number;
  reason: AllocFailReason;
  /** 每个区本次新增的位移（秒），下标对应 zones */
  added: number[];
}

/**
 * 弹性位移求解器：按乐谱时间顺序逐个锚点分摊位移。
 * 每个锚点只向「上一个锚点之后」的区段借预算，已钉住的锚点不会被后来者推走。
 */
export class ElasticSolver {
  readonly zones: ResolvedZone[];
  readonly spanFrom: number;
  readonly spanTo: number;
  private cursorSec: number;

  constructor(zones: ZoneInput[], spanTo: number, spanFrom = 0) {
    this.zones = resolveZones(zones, spanTo, spanFrom);
    this.spanFrom = spanFrom;
    this.spanTo = spanTo;
    this.cursorSec = spanFrom;
  }

  /** 累计到某个乐谱时刻的时间位移（区内匀速，按比例折算） */
  cumulativeAt(scoreSec: number): number {
    let acc = 0;
    for (const z of this.zones) {
      if (scoreSec >= z.toSec) acc += z.delta;
      else if (scoreSec > z.fromSec) acc += z.delta * ((scoreSec - z.fromSec) / z.lengthSec);
      else break;
    }
    return acc;
  }

  /** 在 (cursor, scoreSec] 区段内还能借到多少位移（带符号方向的绝对上限） */
  budgetFor(scoreSec: number, sign: number): number {
    let total = 0;
    for (const part of this.portions(scoreSec)) {
      const z = this.zones[part.index];
      if (z.elasticity <= 0) continue;
      const already = Math.abs(z.delta);
      const cap = Math.min(
        z.ratioCap * z.lengthSec,
        sign > 0 ? z.maxPlusSec : z.maxMinusSec
      );
      total += Math.max(0, cap - already) * (part.lengthSec / z.lengthSec);
    }
    return total;
  }

  /**
   * 让 scoreSec 处的累计位移达到 targetShift。
   * 按 e·L 的比例分摊，超上限夹紧，余量在还有余力的区里再分。
   */
  allocate(scoreSec: number, targetShift: number, fps: number): AllocResult {
    const need = targetShift - this.cumulativeAt(scoreSec);
    const added = new Array(this.zones.length).fill(0);
    if (Math.abs(need) < 1e-9) {
      this.cursorSec = Math.max(this.cursorSec, scoreSec);
      return { achievedSec: 0, reason: null, added };
    }

    const sign = need > 0 ? 1 : -1;
    const parts = this.portions(scoreSec).filter((p) => this.zones[p.index].elasticity > 0);

    if (parts.length === 0) {
      return { achievedSec: 0, reason: 'rigid-grid', added };
    }

    // 每个区段的可用余量
    const slots = parts.map((p) => {
      const z = this.zones[p.index];
      const share = p.lengthSec / z.lengthSec;
      const cap = Math.min(z.ratioCap * z.lengthSec, sign > 0 ? z.maxPlusSec : z.maxMinusSec);
      const remaining = Math.max(0, cap - Math.abs(z.delta)) * share;
      return { index: p.index, weight: z.elasticity * p.lengthSec, remaining, assigned: 0 };
    });

    let remainingNeed = Math.abs(need);
    // 比例分摊 + 夹紧 + 余量再分（最多 8 轮收敛）
    for (let round = 0; round < 8 && remainingNeed > 1e-9; round++) {
      const open = slots.filter((s) => s.remaining - s.assigned > 1e-9 && s.weight > 0);
      if (open.length === 0) break;
      const wSum = open.reduce((a, c) => a + c.weight, 0);
      if (wSum <= 0) break;
      let consumed = 0;
      for (const s of open) {
        const want = remainingNeed * (s.weight / wSum);
        const room = s.remaining - s.assigned;
        const give = Math.min(want, room);
        s.assigned += give;
        consumed += give;
      }
      if (consumed <= 1e-12) break;
      remainingNeed -= consumed;
    }

    const assignedSecs = slots.map((s) => s.assigned);
    const achievedAbs = assignedSecs.reduce((a, c) => a + c, 0);

    // 取整到帧，并保证总和等于 round(已达成位移)
    const rounded = roundToFrames(
      assignedSecs,
      achievedAbs,
      fps,
      slots.map((s) => s.remaining)
    );

    slots.forEach((s, i) => {
      this.zones[s.index].delta += sign * rounded[i];
      added[s.index] += sign * rounded[i];
    });

    this.cursorSec = Math.max(this.cursorSec, scoreSec);
    const achieved = sign * rounded.reduce((a, c) => a + c, 0);

    return {
      achievedSec: achieved,
      reason: remainingNeed > 1e-6 ? 'budget' : null,
      added,
    };
  }

  /** knots：区内匀速，节点落在各区边界（[乐谱秒, 放映秒]） */
  knots(): { outer: number; inner: number }[] {
    // outer = 放映时间；inner = 乐谱时间（与 shared/warp.ts 的 knotMap 口径一致）
    const out: { outer: number; inner: number }[] = [];
    let acc = 0;
    out.push({ outer: this.spanFrom, inner: this.spanFrom });
    for (const z of this.zones) {
      acc += z.delta;
      out.push({
        outer: Math.round((z.toSec + acc) * 10000) / 10000,
        inner: Math.round(z.toSec * 10000) / 10000,
      });
    }
    // 单调化：放映时间必须严格递增
    for (let i = 1; i < out.length; i++) {
      if (out[i].outer <= out[i - 1].outer) out[i].outer = out[i - 1].outer + 1e-4;
    }
    return out;
  }

  /**
   * 分摊报告。
   *
   * 比率上限是按**声明的区**定的（作者把一段画面声明成 motion，意思是这一段
   * 整体最多形变 3%）。区被锚点切开后产生的子区只是分配的中间产物，
   * 它们各自的局部比率跟那个上限不是一回事 ——
   * 之前这里逐个子区打印「局部比率 / 父区上限」，于是出现
   * 「4.17% / 上限 3%」这种看着超标、实际合规的假警报。
   *
   * 所以这里按父区聚合后再和上限比；子区的位移仍然列出来，但不再谎称它有上限。
   */
  report() {
    const totalDelta = this.zones.reduce((a, z) => a + Math.abs(z.delta), 0);

    // 按父区名聚合（子区名形如 `<父区>@12.34`）
    const parents = new Map<
      string,
      { name: string; kind: string; delta: number; length: number; cap: number }
    >();
    for (const z of this.zones) {
      const parentName = z.name.split('@')[0];
      const p = parents.get(parentName) ?? {
        name: parentName,
        kind: z.kind,
        delta: 0,
        length: 0,
        cap: z.ratioCap,
      };
      p.delta += z.delta;
      p.length += z.lengthSec;
      parents.set(parentName, p);
    }

    const parentRows = [...parents.values()].map((p) => ({
      name: p.name,
      kind: p.kind,
      deltaSec: Math.round(p.delta * 10000) / 10000,
      ratio: p.length > 0 ? Math.round((Math.abs(p.delta) / p.length) * 10000) / 10000 : 0,
      cap: Math.round(p.cap * 10000) / 10000,
    }));

    const maxRatio = parentRows.reduce((m, p) => Math.max(m, p.ratio), 0);

    return {
      maxRatio: Math.round(maxRatio * 10000) / 10000,
      totalDeltaSec: Math.round(totalDelta * 10000) / 10000,
      /** 按声明的区聚合 —— 上限就是对这一层定的 */
      zones: parentRows,
      /** 锚点切分出来的子区，只报位移，不报上限 */
      segments: this.zones.map((z) => ({
        name: z.name,
        kind: z.kind,
        deltaSec: Math.round(z.delta * 10000) / 10000,
      })),
    };
  }

  /** (cursor, scoreSec] 覆盖到的各区区段 */
  private portions(scoreSec: number): { index: number; lengthSec: number }[] {
    const lo = this.cursorSec;
    const hi = scoreSec;
    const out: { index: number; lengthSec: number }[] = [];
    if (hi <= lo) return out;
    for (const z of this.zones) {
      const a = Math.max(lo, z.fromSec);
      const b = Math.min(hi, z.toSec);
      if (b - a > 1e-9) out.push({ index: z.index, lengthSec: b - a });
    }
    return out;
  }
}
