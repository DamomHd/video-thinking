/**
 * 配乐离线剪辑 (short-music)
 * 对标 architecture.html §16.4 末段：
 *   "短片的配乐是离线手剪的：用 jumpCost 找接缝，用 ffmpeg 按采样点 atrim + 6ms acrossfade 拼接，
 *    没有走 Remotion 的 startFrom，因为它按帧量化，接缝会错 16–33ms。"
 *
 * 做法：
 *   1. 真实分析原曲，拿到拍、小节头、段落、drop
 *   2. 目标是「把 drop 挪到指定秒数、总长剪到指定长度」
 *   3. 候选接缝只取小节头；用 jumpCost 挑代价最低的一处
 *   4. ffmpeg 按**采样点**（不是帧）atrim 两段，6ms acrossfade 拼起来
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { analyzeMusicFile } from '../sync/analyze.js';
import { decodeMono } from '../audio/decode.js';
import { beatFeatures, jumpCost, BeatFeature } from '../sync/surgery.js';

export interface CutOptions {
  /** 源曲，相对 public/ */
  srcRel: string;
  /** 产物，相对 public/ */
  outRel: string;
  /** 目标总长（秒） */
  targetSec: number;
  /** 希望 drop 落在成品的第几秒 */
  dropAtSec: number;
  nominalBpm?: number;
  /** 交叉淡化长度（毫秒），默认 6ms */
  crossfadeMs?: number;
}

export interface CutResult {
  ok: boolean;
  outRel?: string;
  /** 'remove' = 删掉整数小节把 drop 提前；'insert' = 重复整数小节把 drop 推后 */
  kind?: 'remove' | 'insert' | 'trim-only';
  /** 删掉 / 重复的区间 [起秒, 止秒] */
  region?: [number, number];
  bars?: number;
  seamCost?: number;
  /** 成品里 drop 的实测落点 */
  actualDropSec?: number;
  /** 实测落点与目标的差（秒） */
  dropErrSec?: number;
  /** drop 是否真的落到了目标（容差一小节）；false 时 reason 里写明差多少 */
  verified?: boolean;
  durationSec?: number;
  reason?: string;
}

export function cutMusic(options: CutOptions): CutResult {
  const { srcRel, outRel, targetSec, dropAtSec } = options;
  const crossfadeMs = options.crossfadeMs ?? 6;
  const srcAbs = path.join(process.cwd(), 'public', srcRel);
  const outAbs = path.join(process.cwd(), 'public', outRel);

  if (!fs.existsSync(srcAbs)) return { ok: false, reason: `源曲不存在: ${srcAbs}` };

  const grid = analyzeMusicFile(srcRel, { nominalBpm: options.nominalBpm ?? 108 });
  if (grid.source !== 'measured') {
    return { ok: false, reason: '源曲无法真实分析，拒绝盲剪' };
  }

  const dec = decodeMono(srcAbs);
  if (!dec) return { ok: false, reason: '源曲解码失败' };
  const feats = beatFeatures(dec.mono, dec.rate, grid);
  if (feats.length < 8) return { ok: false, reason: '拍数太少' };

  // 需要把 drop 挪动多少秒：正数 = 要提前（删段），负数 = 要推后（插段）
  const shift = grid.dropSec - dropAtSec;
  const bars = Math.round(Math.abs(shift) / grid.barSec);

  // 刀口只落在小节头 —— 半小节刀口会让后面的网格整体错两拍
  const pre = grid.downbeats.filter((d) => d < grid.dropSec - grid.barSec * 0.5);
  const all = grid.downbeats;

  const xf = crossfadeMs / 1000;
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });

  let filter: string;
  let kind: CutResult['kind'];
  let region: [number, number] | undefined;
  let seamCost: number | undefined;

  if (bars === 0) {
    // 不足一小节：只按长度裁，不动结构
    kind = 'trim-only';
    filter = `[0:a]atrim=start=0:end=${targetSec.toFixed(6)},asetpts=N/SR/TB[out]`;
  } else if (shift > 0) {
    // ── 删段：drop 太晚，删掉 drop 之前的 bars 个小节
    if (pre.length < 2) {
      return { ok: false, reason: 'drop 之前没有足够的小节头可做删段接缝' };
    }
    const best = pickSeam(feats, pre, bars, 'remove');
    if (!best) return { ok: false, reason: '找不到可用的删段接缝' };
    // 删掉这一段之后还剩多少素材；不够铺满目标长度就别硬剪
    const available = dec.durationSec - (best.to - best.from);
    if (available < targetSec - 0.05) {
      return {
        ok: false,
        reason:
          `删掉 ${(best.to - best.from).toFixed(2)}s 之后只剩 ${available.toFixed(2)}s，` +
          `铺不满目标 ${targetSec.toFixed(2)}s。源曲太短，改用作曲引擎生成。`,
      };
    }
    kind = 'remove';
    region = [round3(best.from), round3(best.to)];
    seamCost = best.cost;

    const tailEnd = Math.min(dec.durationSec, best.to + (targetSec - best.from) + xf);
    filter =
      `[0:a]atrim=start=0:end=${best.from.toFixed(6)},asetpts=N/SR/TB[a];` +
      `[0:a]atrim=start=${best.to.toFixed(6)}:end=${tailEnd.toFixed(6)},asetpts=N/SR/TB[b];` +
      `[a][b]acrossfade=d=${xf.toFixed(6)}:c1=tri:c2=tri[x];` +
      `[x]atrim=start=0:end=${targetSec.toFixed(6)},asetpts=N/SR/TB[out]`;
  } else {
    // ── 插段：drop 太早，往 drop 之前塞 bars 个整小节，把 drop 推后。
    // 供体不限定在 drop 之前（很多曲子 drop 就在第一个小节头上，前面根本没东西可重复），
    // 而是在全曲里找一段「回跳接缝代价最低」的等长窗口，当作可循环的素材。
    // 供体不能是 drop 段本身：插在 drop 前面等于把高潮复制一遍，成品会有两个高潮
    const dropSection = (grid.sections ?? []).find((sec) => sec.kind === 'drop');
    const forbid: [number, number] | null = dropSection
      ? [dropSection.startSec, dropSection.endSec]
      : [grid.dropSec, grid.dropSec + grid.barSec * 2];
    const best = pickSeam(feats, all, bars, 'insert', forbid);
    if (!best) {
      return {
        ok: false,
        reason:
          `这首曲子没有可用作前奏的素材：drop 之前只有 ${pre.length} 个小节头，` +
          `全曲也找不到 ${bars} 个不与 drop 段重叠的整小节。改用作曲引擎按结构生成。`,
      };
    }
    // 插入点：drop 所在的那个小节头（插在它前面，drop 整体后移）
    const spliceAt = pre.length > 0 ? pre[pre.length - 1] : all[0];
    kind = 'insert';
    region = [round3(best.from), round3(best.to)];
    seamCost = best.cost;

    // 输出 = [0, spliceAt) + [donorFrom, donorTo) + [spliceAt, 尾)
    const head = spliceAt;
    const parts: string[] = [];
    let chain: string;
    if (head > xf * 2) {
      parts.push(`[0:a]atrim=start=0:end=${head.toFixed(6)},asetpts=N/SR/TB[a]`);
      parts.push(`[0:a]atrim=start=${best.from.toFixed(6)}:end=${best.to.toFixed(6)},asetpts=N/SR/TB[b]`);
      parts.push(`[0:a]atrim=start=${head.toFixed(6)}:end=${dec.durationSec.toFixed(6)},asetpts=N/SR/TB[c]`);
      parts.push(`[a][b]acrossfade=d=${xf.toFixed(6)}:c1=tri:c2=tri[ab]`);
      parts.push(`[ab][c]acrossfade=d=${xf.toFixed(6)}:c1=tri:c2=tri[x]`);
      chain = '[x]';
    } else {
      // drop 就在曲首：供体直接接在最前面，只有一处接缝
      parts.push(`[0:a]atrim=start=${best.from.toFixed(6)}:end=${best.to.toFixed(6)},asetpts=N/SR/TB[b]`);
      parts.push(`[0:a]atrim=start=${head.toFixed(6)}:end=${dec.durationSec.toFixed(6)},asetpts=N/SR/TB[c]`);
      parts.push(`[b][c]acrossfade=d=${xf.toFixed(6)}:c1=tri:c2=tri[x]`);
      chain = '[x]';
    }
    parts.push(`${chain}atrim=start=0:end=${targetSec.toFixed(6)},asetpts=N/SR/TB[out]`);
    filter = parts.join(';');
  }

  try {
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', srcAbs, '-filter_complex', filter,
        '-map', '[out]', '-ar', '48000', '-ac', '2', outAbs],
      { stdio: 'pipe' }
    );
  } catch (e: any) {
    return { ok: false, reason: `ffmpeg 剪辑失败: ${String(e.stderr ?? e.message).slice(0, 300)}` };
  }

  // 验证：重新分析成品，看 drop 是否真的落到目标（容差一小节）
  const after = analyzeMusicFile(outRel, { nominalBpm: grid.bpm });
  const actualDropSec = after.source === 'measured' ? after.dropSec : undefined;
  const dropErr = actualDropSec === undefined ? undefined : Math.abs(actualDropSec - dropAtSec);
  const verified = dropErr !== undefined && dropErr <= grid.barSec;

  return {
    ok: true,
    outRel,
    kind,
    region,
    bars,
    seamCost,
    actualDropSec,
    dropErrSec: dropErr === undefined ? undefined : Math.round(dropErr * 1000) / 1000,
    verified,
    durationSec: after.totalSec,
    reason: verified
      ? undefined
      : `成品 drop 实测在 ${actualDropSec?.toFixed(2)}s，距目标 ${dropAtSec}s 差 ${dropErr?.toFixed(2)}s（超过一小节 ${grid.barSec.toFixed(2)}s）`,
  };
}

/** 插段供体的目标相对能量：当前奏用，要比高潮弱但不能是近乎无声的尾奏 */
const DONOR_TARGET_ENERGY = 0.45;
/** 能量不合适的罚分权重（与接缝代价同量纲） */
const DONOR_ENERGY_WEIGHT = 3.0;

/**
 * 在小节头里挑一处接缝。
 * remove：接缝是 from 的末尾直接接到 to，中间整段删掉 —— 只看接缝代价。
 * insert：接缝是 to 的末尾回跳到 from（循环一遍），除了回跳代价，
 *         还要看这段**能不能当前奏用**：只按接缝平滑度挑，必然挑中全曲最安静的尾奏
 *         （静接静代价最低），插到片头就是一段死寂。所以加一个能量适配项。
 */
function pickSeam(
  feats: BeatFeature[],
  downbeats: number[],
  bars: number,
  mode: 'remove' | 'insert',
  /** insert 专用：不许与这个区间重叠（通常是 drop 段） */
  forbid?: [number, number] | null
): { from: number; to: number; cost: number; relEnergy?: number } | null {
  // 各拍 RMS 的全曲峰值，用来把供体能量归一到 0..1
  const maxRms = feats.reduce((m, f) => Math.max(m, f.rms), 1e-9);

  let best: { from: number; to: number; cost: number; relEnergy?: number } | null = null;
  for (let i = 0; i + bars < downbeats.length; i++) {
    const from = downbeats[i];
    const to = downbeats[i + bars];
    if (forbid && from < forbid[1] && to > forbid[0]) continue; // 与禁区重叠
    const iIdx = nearestBeat(feats, from);
    const jIdx = nearestBeat(feats, to);
    if (iIdx < 0 || jIdx < 0) continue;

    // remove: i → j 直接相接；insert: j → i 回跳
    const seam = mode === 'remove' ? jumpCost(feats, iIdx, jIdx) : jumpCost(feats, jIdx, iIdx);

    let score = seam;
    let relEnergy: number | undefined;
    if (mode === 'insert') {
      const slice = feats.filter((f) => f.sec >= from && f.sec < to);
      if (slice.length === 0) continue;
      relEnergy = slice.reduce((a, f) => a + f.rms, 0) / slice.length / maxRms;
      score += DONOR_ENERGY_WEIGHT * Math.abs(relEnergy - DONOR_TARGET_ENERGY);
    }

    if (!best || score < best.cost) {
      best = {
        from,
        to,
        cost: Math.round(score * 1000) / 1000,
        relEnergy: relEnergy === undefined ? undefined : Math.round(relEnergy * 1000) / 1000,
      };
    }
  }
  return best;
}

function nearestBeat(feats: { sec: number }[], sec: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < feats.length; i++) {
    const d = Math.abs(feats[i].sec - sec);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
