/**
 * 素材 provider 抽象
 * 对标 architecture.html §15 的采购链路，并且把「没有 Epidemic 凭据」这件事摆到明处：
 *   - EpidemicProvider：走官方 MCP，真检索、真下载、真声学画像
 *   - LocalSynthProvider：本仓库自带的物理建模合成器，用于没有会员凭据时的离线自给
 * resolveSfxProvider() 会打印当前走的是哪条路，日志绝不混淆两者。
 */

import fs from 'node:fs';
import path from 'node:path';
import { PaletteSpec } from '../../src/shared/types.js';
import { EpidemicMcpClient } from './client.js';
import { Candidate, rankCandidates } from './scoring.js';
import { extractFeatures } from '../audio/features.js';
import { synthForSpec } from '../composer/synth-sfx.js';
import { FreesoundProvider, KenneyProvider } from './cc0.js';

export interface SfxProvider {
  readonly name: 'epidemic' | 'local-synth' | 'freesound' | 'kenney';
  readonly label: string;
  /** 检索一个槽的候选，按分数排序，首位即当前选中 */
  searchSfx(spec: PaletteSpec, options?: { keep?: number; preview?: number }): Candidate[];
  /** 把候选取回 public/sfx-lib/，返回相对 public/ 的路径 */
  fetchWav(spec: PaletteSpec, cand: Candidate, variantIndex: number): string | null;
  /** 找与某个候选相似的音效；不支持时返回空数组 */
  searchSimilar?(spec: PaletteSpec, candidateId: string, first?: number): Candidate[];
}

const CACHE_DIR = () => path.join(process.cwd(), 'out', 'epidemic');

/* ------------------------------------------------------------------ */
/* Epidemic                                                            */
/* ------------------------------------------------------------------ */

export class EpidemicProvider implements SfxProvider {
  readonly name = 'epidemic' as const;
  readonly label = 'Epidemic Sound（官方 MCP）';

  constructor(private client = new EpidemicMcpClient()) {}

  searchSfx(spec: PaletteSpec, options: { keep?: number; preview?: number } = {}): Candidate[] {
    const keep = options.keep ?? 8;
    const previewN = options.preview ?? 6;

    /**
     * 参数契约是从 tools/list 的 inputSchema 实测出来的，不是按直觉写的：
     *   query:  { term }
     *   filter: { duration: {min, max}（毫秒）, tagSlugs: {matchType, values} }
     *   sort:   { by: RELEVANCE|POPULARITY|DATE|DURATION|TITLE, order: ASCENDING|DESCENDING }
     *   first:  整数
     * 用 term/limit/durationFrom 这类名字服务端会静默返回空集 —— 不报错，只是没结果。
     *
     * 检索范围照原版：每个检索串跑两轮（先按槽允许的 UCS 子类硬过滤，再不限类兜底），
     * 每轮两种排序；时长过滤放宽到 [0.6·min, 1.6·max]。
     */
    const termsList = [spec.tags, spec.alt].filter(Boolean) as string[];
    const sortings = ['RELEVANCE', 'POPULARITY'] as const;
    const collected = new Map<string, Candidate>();

    for (const term of termsList) {
      for (const useUcs of [true, false]) {
        if (useUcs && (!spec.ucs || spec.ucs.length === 0)) continue;
        for (const by of sortings) {
          const args: Record<string, unknown> = {
            query: { term },
            sort: { by, order: 'DESCENDING' },
            first: keep * 2,
            filter: {
              duration: {
                min: Math.max(0, Math.round(spec.dur[0] * 0.6 * 1000)),
                max: Math.round(spec.dur[1] * 1.6 * 1000),
              },
              ...(useUcs ? { tagSlugs: { matchType: 'ANY', values: spec.ucs } } : {}),
            },
          };
          const res = this.client.callTool('SearchSoundEffects', args);
          if (!res.ok) {
            console.warn(`[epidemic] 检索失败（${term} / ${by}）: ${res.error}`);
            continue;
          }
          const hits = normalizeHits(res.data);
          if (hits.length === 0) {
            console.warn(`[epidemic] 检索返回空集（${term} / ${by}）—— 检查参数契约或放宽时长过滤`);
          }
          for (const [i, item] of hits.entries()) {
            const prev = collected.get(item.id);
            const rank = {
              relevance: by === 'RELEVANCE' ? i + 1 : prev?.rank.relevance ?? 999,
              popularity: by === 'POPULARITY' ? i + 1 : prev?.rank.popularity ?? 999,
            };
            collected.set(item.id, { ...(prev ?? item), ...item, rank });
          }
        }
      }
    }

    const cands = [...collected.values()];
    // 只对前 N 条拉预览做声学画像（省流量，和原版口径一致）
    for (const cand of cands.slice(0, previewN)) {
      if (!cand.previewUrl) continue;
      const cacheFile = path.join(CACHE_DIR(), 'preview', `${cand.id.slice(0, 8)}.mp3`);
      if (!fs.existsSync(cacheFile)) {
        if (!EpidemicMcpClient.download(cand.previewUrl, cacheFile)) continue;
      }
      const feat = extractFeatures(cacheFile);
      if (feat) cand.feat = feat;
    }

    return rankCandidates(spec, cands);
  }

  /**
   * 相似检索（§15.3 的 similar）。
   * 契约实测：SearchSimilarToSoundEffect({ id: uuid, first, after })，
   * 返回体与普通检索同形，所以复用 normalizeHits + 同一套打分。
   */
  searchSimilar(spec: PaletteSpec, candidateId: string, first = 12): Candidate[] {
    const res = this.client.callTool('SearchSimilarToSoundEffect', { id: candidateId, first });
    if (!res.ok) {
      console.warn(`[epidemic] 相似检索失败: ${res.error}`);
      return [];
    }
    const cands = normalizeHits(res.data);
    for (const cand of cands.slice(0, 6)) {
      if (!cand.previewUrl) continue;
      const cacheFile = path.join(CACHE_DIR(), 'preview', `${cand.id.slice(0, 8)}.mp3`);
      if (!fs.existsSync(cacheFile) && !EpidemicMcpClient.download(cand.previewUrl, cacheFile)) continue;
      const feat = extractFeatures(cacheFile);
      if (feat) cand.feat = feat;
    }
    return rankCandidates(spec, cands);
  }

  fetchWav(spec: PaletteSpec, cand: Candidate, variantIndex: number): string | null {
    const rel =
      spec.variants > 1
        ? `sfx-lib/epidemic/${spec.slot}-${variantIndex + 1}.wav`
        : `sfx-lib/epidemic/${spec.slot}.wav`;
    const dest = path.join(process.cwd(), 'public', rel);

    // 先查按槽缓存
    const cache = path.join(CACHE_DIR(), spec.slot, `${cand.id.slice(0, 8)}.wav`);
    if (fs.existsSync(cache)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(cache, dest);
      return rel;
    }

    // options.fileType 是必填（实测契约）；取 WAV
    const res = this.client.callTool('DownloadSoundEffect', {
      id: cand.id,
      options: { fileType: 'WAV' },
    });
    const url = res.ok ? pickUrl(res.data) : null;
    if (!url) {
      console.warn(`[epidemic] 取下载地址失败: ${cand.title} (${res.error ?? '无 url'})`);
      return null;
    }
    if (!EpidemicMcpClient.download(url, cache)) return null;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(cache, dest);
    return rel;
  }
}

/* ------------------------------------------------------------------ */
/* 本地合成                                                            */
/* ------------------------------------------------------------------ */

export class LocalSynthProvider implements SfxProvider {
  readonly name = 'local-synth' as const;
  readonly label = '本地物理建模合成器（离线自给，非 Epidemic 素材）';

  /**
   * 按采购单的层与目标时长现场合成，所以任何新片 `vw init` 之后都能离线自给；
   * 每个槽只有一个候选（合成是确定性的，没有「挑选」这件事）。
   */
  searchSfx(spec: PaletteSpec): Candidate[] {
    const rel = this.ensure(spec, 0);
    const abs = path.join(process.cwd(), 'public', rel);
    if (!fs.existsSync(abs)) return [];

    const feat = extractFeatures(abs) ?? undefined;
    const cand: Candidate = {
      id: `local:${spec.slot}`,
      title: `${spec.slot}（本地合成 · ${spec.layer}）`,
      tags: spec.tags.split(',').map((t) => t.trim()),
      slugs: [],
      durationSec: feat ? 0 : 0,
      rank: { relevance: 1, popularity: 1 },
      feat,
      file: rel,
    };
    return rankCandidates(spec, [cand]);
  }

  fetchWav(spec: PaletteSpec, _cand: Candidate, variantIndex = 0): string | null {
    const rel = this.ensure(spec, variantIndex);
    return fs.existsSync(path.join(process.cwd(), 'public', rel)) ? rel : null;
  }

  private ensure(spec: PaletteSpec, variantIndex: number): string {
    const rel =
      spec.variants > 1
        ? `sfx-lib/epidemic/${spec.slot}-${variantIndex + 1}.wav`
        : `sfx-lib/epidemic/${spec.slot}.wav`;
    if (!fs.existsSync(path.join(process.cwd(), 'public', rel))) {
      synthForSpec(
        { ...spec, slot: variantIndex === 0 ? spec.slot : `${spec.slot}#${variantIndex}` },
        rel
      );
    }
    return rel;
  }
}

/* ------------------------------------------------------------------ */

export type SfxSource = 'epidemic' | 'local' | 'freesound' | 'kenney';

/**
 * 选 provider：
 *   指定 source（--source=freesound|kenney|local|epidemic）就用它，凭据 / 索引缺失时直接报错，不悄悄换源；
 *   不指定时照旧：有 Epidemic 凭据走 Epidemic，没有就走本地合成，并明确告知。
 */
export function resolveSfxProvider(options: { forceLocal?: boolean; source?: SfxSource } = {}): SfxProvider {
  if (options.source === 'freesound') {
    const p = new FreesoundProvider();
    if (!p.available()) throw new Error('[provider] 没有 FREESOUND_API_KEY（.env），用不了 Freesound');
    console.log(`[provider] 使用 ${p.label}`);
    return p;
  }
  if (options.source === 'kenney') {
    const p = new KenneyProvider();
    if (!p.available()) throw new Error('[provider] Kenney 索引是空的 —— 先跑 vw sfx kenney sync');
    console.log(`[provider] 使用 ${p.label}`);
    return p;
  }
  if (options.source === 'local') options = { ...options, forceLocal: true };
  if (!options.forceLocal) {
    const client = new EpidemicMcpClient();
    if (client.available()) {
      console.log(`[provider] 使用 ${new EpidemicProvider(client).label}`);
      return new EpidemicProvider(client);
    }
    console.warn(
      `[provider] 未配置 EPIDEMIC_SOUND_API_KEY（环境变量或 .env），` +
        `改用本地合成 provider —— 产出的不是 Epidemic 素材。`
    );
  }
  const local = new LocalSynthProvider();
  console.log(`[provider] 使用 ${local.label}`);
  return local;
}

 /**
 * 候选池里可能混着几个来源（不同槽、或同一槽先后用不同 --source 检索）；
 * 落定时按候选自己的来源取回，而不是按本次命令的 provider。
 */
export function providerForCandidate(cand: Candidate, fallback: SfxProvider): SfxProvider {
  if (cand.id.startsWith('fs:')) return fallback.name === 'freesound' ? fallback : new FreesoundProvider();
  if (cand.id.startsWith('kenney:')) return fallback.name === 'kenney' ? fallback : new KenneyProvider();
  if (cand.id.startsWith('local:')) return fallback.name === 'local-synth' ? fallback : new LocalSynthProvider();
  return fallback;
}

/* ------------------------------------------------------------------ */
/* 响应归一化                                                          */
/* ------------------------------------------------------------------ */

/**
 * 把 MCP 的响应统一成 Candidate。
 *
 * 真实形状（2026-10 实测，不是猜的）是 GraphQL 风格的三层嵌套：
 *   { data: { soundEffects | recordings: { nodes: [ { soundEffect | recording: {…} } ], meta, pageInfo } } }
 * 最内层的字段名也和直觉不同：
 *   时长在 audioFile.durationInMilliseconds，预览在 audioFile.lqmp3Url，
 *   标签是 [{displayName, slug, dimension}]，艺人在 credits[].artist.name。
 * 所以这里按真实路径取，同时保留几种扁平写法的兜底（万一接口改版）。
 */
export function normalizeHits(data: any): Candidate[] {
  const d = data?.data ?? data;
  /**
   * 返回体有三种外壳（都是实测，不是猜的）：
   *   普通检索  soundEffects.nodes[] / recordings.nodes[]
   *   相似检索  soundEffect.similarSoundEffects.nodes[]  ← 单数外壳，里面再套一层
   *   少数接口直接给数组
   * 少认一种就会「ok=true 却 0 条」，和参数写错的表现一模一样，极难查。
   */
  const collection =
    d?.soundEffects ??
    d?.recordings ??
    d?.soundEffect?.similarSoundEffects ??
    d?.recording?.similarRecordings ??
    null;

  const raw: any[] =
    collection?.nodes ??
    (Array.isArray(data) ? data : null) ??
    data?.results ??
    data?.items ??
    data?.entries ??
    [];

  return raw
    .map((node: any): Candidate | null => {
      // 节点外面还包一层 soundEffect / recording
      const e = node?.soundEffect ?? node?.recording ?? node;
      const id = String(e?.id ?? '');
      if (!id) return null;

      const af = e?.audioFile ?? {};
      const ms = Number(af.durationInMilliseconds ?? e?.lengthInMs ?? e?.durationMs ?? 0);

      // 标签：[{displayName, slug, dimension:{name}}]
      const tagObjs: any[] = Array.isArray(e?.tags) ? e.tags : [];
      const tags = tagObjs.map((t) => String(t?.displayName ?? t?.name ?? t)).filter(Boolean);
      const slugs = tagObjs.map((t) => String(t?.slug ?? '')).filter(Boolean);

      // UCS 子类：音效的 slug 形如 "voices--scream"，取整条当子类
      const ucs = slugs.find((sl) => sl.includes('--'));

      return {
        id,
        title: String(e?.title ?? id),
        tags,
        slugs,
        durationSec: ms > 0 ? ms / 1000 : Number(e?.durationSec ?? 0),
        previewUrl: af.lqmp3Url ?? af.mp3Url ?? e?.previewUrl,
        rank: { relevance: 999, popularity: 999 },
        ucs,
      };
    })
    .filter((c): c is Candidate => c !== null);
}

/** 配乐节点额外带的信息（bpm / 艺人），选曲打分要用 */
export function recordingMeta(node: any): { bpm: number; artist: string } {
  const e = node?.recording ?? node;
  const composer = (e?.credits ?? []).find((c: any) => c?.role === 'COMPOSER' || c?.role === 'MAIN_ARTIST');
  return {
    bpm: Number(e?.bpm ?? 0),
    artist: String(composer?.artist?.name ?? ''),
  };
}

function toStringArray(v: any): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.map((x) => String(x?.name ?? x?.slug ?? x));
  if (typeof v === 'string') return v.split(',').map((s) => s.trim());
  return [];
}

/**
 * 从下载响应里挑一个可用的 url。
 * 实测的真实路径：
 *   DownloadRecordingEdit → data.recordingEditDownload.assetUrl
 *   DownloadRecording     → data.recordingDownload.assetUrl
 *   DownloadSoundEffect   → data.soundEffectDownload.assetUrl
 * 统一做法：递归找第一个叫 assetUrl / url / downloadUrl 的 http 字符串。
 */
export function pickUrl(data: any): string | null {
  if (typeof data === 'string') return data.startsWith('http') ? data : null;
  if (!data || typeof data !== 'object') return null;

  const KEYS = ['assetUrl', 'url', 'downloadUrl', 'wavUrl', 'fileUrl', 'href'];
  for (const k of KEYS) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.startsWith('http')) return v;
  }
  for (const v of Object.values(data)) {
    if (v && typeof v === 'object') {
      const u = pickUrl(v);
      if (u) return u;
    }
  }
  return null;
}
