/**
 * 换素材保位置 (sfx swap)
 * 对标 architecture.html §15.6：换素材不挪位置。
 *   ① 记下这个槽各片段的旧 from
 *   ② 用真实包络重跑计划（RISER 是按峰对齐终点放的，换一枚峰位不同的素材起点会跳）
 *   ③ 把新旧起点差累加进 sfxOffsets.json（累加后归零的删掉这一项）
 * 所以「落版起势」换素材后，听到的位置和换之前一样。
 */

import fs from 'node:fs';
import path from 'node:path';
import { TruthManager } from './truth.js';
import { getFilm } from '../../src/films.js';
import { buildSfxPlan, readManifest } from './plan.js';
import { writeManifest, readManifestRaw } from './pick.js';
import { EnvelopeProbe } from '../audio/envelope.js';

export interface SwapResult {
  slot: string;
  affectedKeys: string[];
  newFile: string;
  offsetAdjustments: Record<string, number>;
  removedOffsets: string[];
}

export async function swapSlotAsset(
  filmId: string,
  slot: string,
  newFile: string,
  options: { variantIndex?: number } = {}
): Promise<SwapResult> {
  const truthMgr = new TruthManager(filmId);
  const truth = truthMgr.readAll();
  const film = getFilm(filmId);
  const adapter = await film.getAdapter();

  if (!adapter.palette[slot]) {
    throw new Error(`[swap] 采购单里没有槽 '${slot}'`);
  }

  const rel = newFile.replace(/^public\//, '');
  const abs = path.join(process.cwd(), 'public', rel);
  if (!fs.existsSync(abs)) {
    throw new Error(`[swap] 素材不存在: ${abs}`);
  }

  // ① 旧起点（已含 offset，因为渲染端 start = fromSec + offset）
  const oldStarts = new Map<string, number>();
  for (const item of truth.plan) {
    if (item.slot === slot) {
      oldStarts.set(item.key, item.fromSec + (truth.offsets[item.key] ?? 0));
    }
  }

  // ② 换 manifest 里这个槽的条目，再用真实包络重跑计划
  const manifest = readManifestRaw(filmId);
  const probe = new EnvelopeProbe(filmId);
  const env = probe.measure(rel);
  const idx = options.variantIndex ?? 0;
  const entries = manifest[slot] ?? [];
  entries[idx] = {
    file: rel,
    title: path.basename(rel),
    durSec: env.durSec,
    onsetSec: env.onsetSec,
    peakAtSec: env.peakAtSec,
    peakDb: env.peakDb,
  };
  manifest[slot] = entries;
  writeManifest(filmId, manifest);
  probe.flush();

  const { plan } = buildSfxPlan(adapter, { prevPlan: truth.plan });

  // ③ 新旧起点差累加进 offsets
  const offsetAdjustments: Record<string, number> = {};
  const removedOffsets: string[] = [];
  const affectedKeys: string[] = [];

  for (const item of plan) {
    if (item.slot !== slot) continue;
    affectedKeys.push(item.key);
    const oldStart = oldStarts.get(item.key);
    if (oldStart === undefined) continue;

    // 想要的最终起点仍然是 oldStart；新的 fromSec 变了，差值吃进 offset
    const needed = Math.round((oldStart - item.fromSec) * 10000) / 10000;
    if (Math.abs(needed) < 1e-4) {
      if (truth.offsets[item.key] !== undefined) {
        delete truth.offsets[item.key];
        removedOffsets.push(item.key);
      }
    } else {
      truth.offsets[item.key] = needed;
      offsetAdjustments[item.key] = needed;
    }
  }

  truthMgr.write('plan', plan);
  truthMgr.write('offsets', truth.offsets);

  console.log(
    `[sfx swap] 槽 ${slot} → ${rel}（峰位 ${env.peakAtSec}s / 峰值 ${env.peakDb}dBFS）` +
      `\n           涉及 ${affectedKeys.length} 个片段，保位偏移 ${Object.keys(offsetAdjustments).length} 项，归零删除 ${removedOffsets.length} 项`
  );

  return { slot, affectedKeys, newFile: rel, offsetAdjustments, removedOffsets };
}

/** 读当前 manifest（供 CLI 展示） */
export { readManifest };
