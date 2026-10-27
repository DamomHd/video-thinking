/**
 * 素材落定 (sfx pick-all)
 * 对标 architecture.html §15.4：
 *   每槽取候选的前 variants 名 → WAV 先查缓存、没有才下载 → 拷到 public/sfx-lib/
 *   → 重写 manifest 里这个槽的条目（打字槽另写 sfxTyping.json）。
 * 槽名贯穿全链：PALETTE 键 = 候选池键 = manifest 键 = WAV 文件名 = 计划里的 slot。
 */

import fs from 'node:fs';
import path from 'node:path';
import { FilmAdapter } from '../../src/shared/types.js';
import { SfxProvider, SfxSource, providerForCandidate, resolveSfxProvider } from '../epidemic/provider.js';
import { readPool } from './search.js';
import { SlotManifest } from './plan.js';
import { EnvelopeProbe } from '../audio/envelope.js';
import { startTimer } from './timing.js';

export interface PickResult {
  provider: string;
  picked: Record<string, string[]>;
  missing: string[];
}

export function manifestPath(filmId: string): string {
  return path.join(process.cwd(), 'src', 'films', filmId, 'audio', 'manifest.json');
}

export function readManifestRaw(filmId: string): SlotManifest {
  const p = manifestPath(filmId);
  if (!fs.existsSync(p)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const out: SlotManifest = {};
    for (const [k, v] of Object.entries(raw)) {
      if (Array.isArray(v)) out[k] = v as SlotManifest[string];
      else if (typeof v === 'string') out[k] = [{ file: v }];
    }
    return out;
  } catch {
    return {};
  }
}

export function writeManifest(filmId: string, manifest: SlotManifest): void {
  const p = manifestPath(filmId);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

/**
 * 落定素材。slots 为空时处理采购单里的全部槽。
 * UI 槽的 variants 必须为 1 —— 挂载按 <槽>.wav 取文件。
 */
export function pickAll(
  adapter: FilmAdapter,
  slots: string[] = [],
  options: { provider?: SfxProvider; forceLocal?: boolean; source?: SfxSource } = {}
): PickResult {
  const timer = startTimer('sfx pick');
  const provider = options.provider ?? resolveSfxProvider({ forceLocal: options.forceLocal, source: options.source });
  const pool = readPool(adapter.filmId);
  const manifest = readManifestRaw(adapter.filmId);
  const probe = new EnvelopeProbe(adapter.filmId);

  const targets = slots.length > 0 ? slots : Object.keys(adapter.palette);
  const picked: Record<string, string[]> = {};
  const missing: string[] = [];

  for (const slot of targets) {
    const spec = adapter.palette[slot];
    if (!spec) continue;
    if (spec.layer === 'UI' && spec.variants !== 1) {
      throw new Error(`[sfx pick] UI 槽 '${slot}' 的 variants 必须为 1（挂载按 <槽>.wav 取文件）`);
    }

    const cands = pool[slot] ?? provider.searchSfx(spec);
    if (cands.length === 0) {
      missing.push(slot);
      console.warn(`[sfx pick] 槽 ${slot} 没有候选，跳过（未采购的槽不会进计划）`);
      continue;
    }

    const entries: SlotManifest[string] = [];
    const files: string[] = [];
    for (let i = 0; i < Math.max(1, spec.variants); i++) {
      const cand = cands[i];
      if (!cand) break;
      const rel = providerForCandidate(cand, provider).fetchWav(spec, cand, i);
      if (!rel) continue;
      const env = probe.measure(rel);
      entries.push({
        file: rel,
        title: cand.title,
        id: cand.id,
        durSec: env.durSec,
        onsetSec: env.onsetSec,
        peakAtSec: env.peakAtSec,
        peakDb: env.peakDb,
        ...(cand.source ? { source: cand.source, license: cand.license, url: cand.url, author: cand.author } : {}),
      });
      files.push(rel);
    }

    if (entries.length === 0) {
      missing.push(slot);
      continue;
    }

    manifest[slot] = entries;
    picked[slot] = files;
    timer.step(`落定 ${slot}`);
    console.log(`[sfx pick] 槽 ${slot}: ${files.length} 个变体 → ${files.join(', ')}`);
  }

  probe.flush();
  writeManifest(adapter.filmId, manifest);
  timer.step('写 manifest');
  timer.done(`sfx pick ${adapter.filmId}`);

  return { provider: provider.name, picked, missing };
}
