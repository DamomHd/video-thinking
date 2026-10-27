/**
 * 计划生成器 (Plan Builder) —— 唯一的 sfxPlan.json 产出口
 * 对标 architecture.html §15.5。此前这段逻辑散在 bin/vw.ts 与 sync-choreo.ts 里
 * 并且音量写死 0.5、对齐一律 0，这里全部换成真实规则：
 *   1. key = <槽>·<事件名，去掉括号里的动态值>，重名加 #n —— 插入新事件不会让后面的 key 错位
 *   2. 覆盖判定：同层 ±0.4s 内已有声音则跳过（force 除外）
 *   3. 对齐：RISER(peak) 素材峰对事件终点；RISER(onset)/WHOOSH/IMPACT 可听起点对事件起点；
 *      take 只放截取段；BG/TEX 循环铺底
 *   4. 音量 = 层基准 × 峰值归一到 −6dBFS × palette.gain（真实 peakDb，来自 EnvelopeProbe）
 *   5. 变体：同 key 沿用上一版文件；新 key 才按该槽使用次数轮换
 *   6. 未采购（素材文件不存在）的槽不进计划 —— 采购完成前也能照常渲染
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  FilmAdapter,
  PaletteSpec,
  SfxPlanFile,
  SfxPlanItem,
  SpotAnnotation,
  MusicFile,
} from '../../src/shared/types.js';
import { calcPlanVolume } from '../../src/shared/audio-math.js';
import { EnvelopeProbe } from '../audio/envelope.js';
import { startTimer } from './timing.js';
import { ensurePitched } from './pitch.js';

/** 音效桥的起势长度（§15.5：入点前 2.5s） */
const BRIDGE_RISER_SEC = 2.5;
/** 循环铺底层的默认淡化（对标原版 20 帧 @30fps） */
const LOOP_FADE_SEC = 0.667;
/** take 截取段的淡化（对标原版 2 帧 @30fps） */
const TAKE_FADE_SEC = 0.067;
/** 一次性音效的默认淡化 */
const ONESHOT_FADE_SEC = 0.02;
/** WHOOSH / IMPACT 最短可听时长（对标原版 6 帧 @30fps） */
const MIN_ONESHOT_SEC = 0.2;
/** RISER(onset) 允许拖过事件终点的上限（对标原版 15 帧 @30fps） */
const RISER_OVERHANG_SEC = 0.5;
/** 覆盖判定窗口 */
const COVER_WINDOW_SEC = 0.4;

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** 事件名去掉括号里的动态值，让 key 不随动态内容漂移 */
export function normalizeEventName(id: string): string {
  return id.replace(/[（(][^）)]*[）)]/g, '').trim();
}

/** 生成稳定 key；重名在同一槽内加 #n */
export function planKey(slot: string, eventId: string, seen: Map<string, number>): string {
  const base = `${slot}·${normalizeEventName(eventId)}`;
  const n = (seen.get(base) ?? 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

/** 同层 ±0.4s 内是否已有声音（对标原版 core.mts 的 isCovered） */
export function isCovered(
  spot: SpotAnnotation,
  accepted: { layer: string; fromSec: number }[]
): boolean {
  return accepted.some(
    (a) => a.layer === spot.layer && Math.abs(a.fromSec - spot.fromSec) <= COVER_WINDOW_SEC
  );
}

export interface SlotManifestEntry {
  file: string;
  title?: string;
  id?: string;
  durSec?: number;
  /**
   * 实测包络（由 sfx pick 写入）。手写 cue 表的 align:'peak' 靠它把素材峰
   * 对到画面那一刻 —— 对标原版的 peakAt(t, 素材峰秒)，但峰位是量出来的不是手填的。
   */
  onsetSec?: number;
  peakAtSec?: number;
  peakDb?: number;
  /** 外部来源与许可证（由 sfx pick 从候选上抄过来；vw review 据此核对） */
  source?: 'freesound' | 'kenney';
  license?: string;
  url?: string;
  author?: string;
}
export type SlotManifest = Record<string, SlotManifestEntry[]>;

/** 读 manifest.json（槽 → 已采购素材列表）；兼容 "槽: 单个文件名" 的旧写法 */
export function readManifest(filmId: string): SlotManifest {
  const p = path.join(process.cwd(), 'src', 'films', filmId, 'audio', 'manifest.json');
  if (!fs.existsSync(p)) return {};
  let raw: any;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
  const out: SlotManifest = {};
  for (const [slot, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[slot] = v as SlotManifestEntry[];
    else if (typeof v === 'string') out[slot] = [{ file: v }];
    else if (v && typeof v === 'object') out[slot] = [v as SlotManifestEntry];
  }
  return out;
}

/** 槽的候选素材文件列表：manifest 优先，否则按 <槽>.wav / <槽>-n.wav 约定在盘上找 */
export function slotFiles(slot: string, spec: PaletteSpec | undefined, manifest: SlotManifest): string[] {
  const fromManifest = (manifest[slot] ?? []).map((e) => e.file).filter(Boolean);
  if (fromManifest.length > 0) return fromManifest;

  const variants = Math.max(1, spec?.variants ?? 1);
  const found: string[] = [];
  const pub = path.join(process.cwd(), 'public');
  if (variants === 1) {
    const f = `sfx-lib/epidemic/${slot}.wav`;
    if (fs.existsSync(path.join(pub, f))) found.push(f);
  } else {
    for (let i = 1; i <= variants; i++) {
      const f = `sfx-lib/epidemic/${slot}-${i}.wav`;
      if (fs.existsSync(path.join(pub, f))) found.push(f);
    }
    // 变体没采齐时退回单文件命名
    if (found.length === 0) {
      const f = `sfx-lib/epidemic/${slot}.wav`;
      if (fs.existsSync(path.join(pub, f))) found.push(f);
    }
  }
  return found;
}

export interface BuildPlanResult {
  plan: SfxPlanFile;
  skippedCovered: SpotAnnotation[];
  skippedUnpurchased: SpotAnnotation[];
  keyMap: Map<string, string>; // 旧 key -> 新 key（同槽同事件名的迁移）
  byLayer: Record<string, number>;
}

/**
 * 按真实素材包络生成计划。
 * prevPlan 用于「同 key 沿用上一版文件」和手动参数的 key 迁移。
 */
/**
 * 音效桥 (§15.5 的 bridgeSpots)
 *
 * music.json 里 join.kind = 'bridge' 的段，靠一条音效桥把上一段接过来：
 * 入点**前 2.5s** 铺一条 riser 起势，入点**正上**落一枚 impact。
 * 两条都带 force —— 桥本来就是要盖在别的声音上面的，
 * 被覆盖判定吃掉就失去意义了。
 *
 * 之前 join.kind 能设成 'bridge'，但没有任何代码为它发声，
 * 设了等于没设。
 */
export function bridgeSpots(
  adapter: FilmAdapter,
  music: MusicFile | undefined
): SpotAnnotation[] {
  const cues = music?.cues ?? [];
  const out: SpotAnnotation[] = [];

  for (const cue of cues) {
    if (cue.join?.kind !== 'bridge') continue;

    const at = cue.in.sec;
    // 桥用哪两个槽：按层在采购单里找，找不到就跳过（不编造槽名）
    const riserSlot = Object.keys(adapter.palette).find((k) => adapter.palette[k].layer === 'RISER');
    const impactSlot = Object.keys(adapter.palette).find((k) => adapter.palette[k].layer === 'IMPACT');

    if (riserSlot) {
      out.push({
        id: `音效桥起势(${cue.id})`,
        fromSec: Math.max(0, at - BRIDGE_RISER_SEC),
        toSec: at,
        layer: 'RISER',
        slot: riserSlot,
        what: `段 ${cue.id} 的音效桥：入点前 ${BRIDGE_RISER_SEC}s 起势`,
        force: true,
      });
    }
    if (impactSlot) {
      out.push({
        id: `音效桥落点(${cue.id})`,
        fromSec: at,
        toSec: at + 0.6,
        layer: 'IMPACT',
        slot: impactSlot,
        what: `段 ${cue.id} 的音效桥：入点落一枚 impact`,
        force: true,
      });
    }
  }
  return out;
}

export function buildSfxPlan(
  adapter: FilmAdapter,
  options: { prevPlan?: SfxPlanFile; probe?: EnvelopeProbe; music?: MusicFile } = {}
): BuildPlanResult {
  const timer = startTimer('sfx plan');
  const probe = options.probe ?? new EnvelopeProbe(adapter.filmId);
  const manifest = readManifest(adapter.filmId);
  timer.step('读 manifest');
  const prevByKey = new Map((options.prevPlan ?? []).map((p) => [p.key, p]));

  // 适配器自己标的 spots + 配乐段的音效桥（§15.5）
  const spots = [...adapter.spots(), ...bridgeSpots(adapter, options.music)].sort(
    (a, b) => a.fromSec - b.fromSec
  );

  const seen = new Map<string, number>();
  const accepted: { layer: string; fromSec: number }[] = [];
  const plan: SfxPlanItem[] = [];
  const skippedCovered: SpotAnnotation[] = [];
  const skippedUnpurchased: SpotAnnotation[] = [];
  const keyMap = new Map<string, string>();
  const slotUseCount = new Map<string, number>();

  for (const spot of spots) {
    const spec = adapter.palette[spot.slot];

    // UI 层是密集挂载（点击、勾选、弹出），不参与覆盖判定
    if (spot.layer !== 'UI' && !spot.force && isCovered(spot, accepted)) {
      skippedCovered.push(spot);
      continue;
    }

    const files = slotFiles(spot.slot, spec, manifest);
    if (files.length === 0) {
      skippedUnpurchased.push(spot);
      continue;
    }

    const key = planKey(spot.slot, spot.id, seen);
    keyMap.set(key, key);

    // 变体：同 key 沿用上一版文件；新 key 按该槽使用次数轮换
    const useN = (slotUseCount.get(spot.slot) ?? 0) + 1;
    slotUseCount.set(spot.slot, useN);
    const prev = prevByKey.get(key);
    let file =
      prev && files.includes(prev.file) ? prev.file : files[(useN - 1) % files.length];

    // 变调：换成离线变调好的文件再量包络 —— 起音 / 峰 / 时长都按变调后的实测，渲染端与工作台都原速播放
    if (spot.pitchSemis) file = ensurePitched(file, spot.pitchSemis);
    const env = probe.measure(file);
    const eventDur = Math.max(0, spot.toSec - spot.fromSec);
    const align = spec?.align ?? 'onset';

    let fromSec = spot.fromSec;
    let startFromSec = 0;
    let durSec = eventDur;
    let fadeSec = ONESHOT_FADE_SEC;
    let loop: boolean | undefined;

    if (spot.take) {
      // take：一条素材里录了好几下，只放其中一段
      const [a, b] = spot.take;
      startFromSec = Math.max(0, a);
      durSec = Math.max(0.05, b - a);
      fadeSec = TAKE_FADE_SEC;
    } else if (spot.layer === 'BG' || spot.layer === 'TEX') {
      // 铺底层：循环填满事件区间
      loop = true;
      durSec = Math.max(0.1, eventDur);
      fadeSec = LOOP_FADE_SEC;
      startFromSec = 0;
    } else if (spot.layer === 'RISER' && align === 'peak') {
      // 素材峰对事件终点
      fromSec = spot.toSec - env.peakAtSec;
      durSec = env.durSec > 0 ? env.durSec : Math.max(eventDur, 0.1);
      startFromSec = 0;
      fadeSec = ONESHOT_FADE_SEC;
    } else {
      // 可听起点对事件起点，整条放完
      startFromSec = env.onsetSec;
      const audible = Math.max(0, env.durSec - env.onsetSec);
      const cap =
        spot.layer === 'RISER' ? eventDur + RISER_OVERHANG_SEC : Number.POSITIVE_INFINITY;
      durSec = Math.max(MIN_ONESHOT_SEC, Math.min(audible > 0 ? audible : eventDur, cap));
      fadeSec = ONESHOT_FADE_SEC;
    }

    // from < 0：把差值吃进 startFrom，绝不出现负起点
    if (fromSec < 0) {
      const deficit = -fromSec;
      startFromSec = r4(startFromSec + deficit);
      durSec = Math.max(0.05, durSec - deficit);
      fromSec = 0;
    }

    const volume = calcPlanVolume(
      spot.layer,
      env.source === 'measured' ? env.peakDb : -6,
      spec?.gain ?? 1.0
    );

    const entry: SfxPlanItem = {
      key,
      what: spot.what,
      layer: spot.layer,
      slot: spot.slot,
      file,
      title: manifest[spot.slot]?.find((e) => e.file === file)?.title ?? spot.what,
      fromSec: r4(fromSec),
      durSec: r4(durSec),
      startFromSec: r4(startFromSec),
      volume,
      fadeSec: r4(Math.min(fadeSec, durSec / 2)),
    };
    if (loop) entry.loop = true;
    if (spot.pitchSemis) entry.pitchSemis = spot.pitchSemis;

    plan.push(entry);
    accepted.push({ layer: spot.layer, fromSec: spot.fromSec });
  }

  probe.flush();
  timer.step('量包络 + 生成条目');
  timer.done(`sfx plan ${adapter.filmId}`);

  const byLayer: Record<string, number> = {};
  for (const p of plan) byLayer[p.layer] = (byLayer[p.layer] ?? 0) + 1;

  return { plan, skippedCovered, skippedUnpurchased, keyMap, byLayer };
}

/** 把手动调参真值按 key 迁移到新计划：新计划里不存在的 key 才删 */
export function migrateParamsToPlan(
  plan: SfxPlanFile,
  truth: {
    offsets: Record<string, number>;
    gains: Record<string, number>;
    fades: { in: Record<string, number>; out: Record<string, number> };
    ducks: Record<string, any>;
  }
): { dropped: string[] } {
  const valid = new Set(plan.map((p) => p.key));
  const dropped: string[] = [];
  const sweep = (dict: Record<string, any>, label: string) => {
    for (const k of Object.keys(dict)) {
      if (!valid.has(k)) {
        delete dict[k];
        dropped.push(`${label}:${k}`);
      }
    }
  };
  sweep(truth.offsets, 'offsets');
  sweep(truth.gains, 'gains');
  sweep(truth.fades.in, 'fades.in');
  sweep(truth.fades.out, 'fades.out');
  sweep(truth.ducks, 'ducks');
  return { dropped };
}
