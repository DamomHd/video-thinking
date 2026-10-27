/**
 * 配乐检索与 Adapt 改编闭环
 * 对标 architecture.html §16.2 / §16.3：
 *   检索 → mscore 打分（可选按拍点选速度的网格代价）→ Adapt 按片长改编并把 drop 钉到画面主高潮
 *   → 闭环修正（实测落点、误差 ≤ 0.6 拍收工、超 4 小节停、最多 3 轮）→ 落定并分析。
 * 接口的实测边界照抄原版注释：只有一个硬钉点可靠；COMPLETED 但 edit=null 是软失败；
 * editId 完成后还会漂移（停 1.5s 再轮询、下载前再取一次）；预览比 WAV 晚 23ms；段长上限 300s。
 */

import fs from 'node:fs';
import path from 'node:path';
import { EpidemicMcpClient } from './client.js';
import { normalizeHits, pickUrl, recordingMeta } from './provider.js';
import { analyzeMusicFile, BeatGrid } from '../sync/analyze.js';
import {
  recipesFor,
  parseRecipe,
  recipePreferences,
  requiredRegionSec,
  RecipeName,
} from './recipes.js';
import { rankCandidates, pickSecondClimax, ScoredCandidate } from './adapt-score.js';
import { computeMscore, CandidateTrack } from '../sync/mscore.js';
import { VisualHit } from '../../src/shared/types.js';

/** 预览 mp3 比 WAV 晚 23ms（实测） */
export const PREVIEW_LAG_SEC = 0.023;
/** 段长上限 */
export const MAX_CUE_SEC = 300;
/** 改编配方池 */
export const RECIPES = [
  'r8', 'r16', 'r8-peak', 'r8-noIntro', 'r16-peak', 'r12', 'r8-noBuild', 'r8-peak-noIntro',
] as const;

export interface MusicCandidate extends CandidateTrack {
  previewUrl?: string;
  mscore?: number;
  parts?: Record<string, number>;
}

export interface AdaptRequest {
  trackId: string;
  targetDurationSec: number;
  /** 主高潮在段内的秒数；null 表示只改时长 */
  dropAtSec: number | null;
  /** 原曲里要保住的那一段（drop 段）的区间，秒。接口要的是区间不是单点 */
  dropRegion?: { startSec: number; endSec: number };
  recipe?: string;
  preferenceRegions?: { fromSec: number; toSec: number; preference: 'more' | 'less' }[];
  /** 曲目声明的 bpm，分析器拿它当初值、打分拿它衡量网格有没有跑偏 */
  nominalBpm?: number;
  /** 目标第二高潮（秒，段内）；比选打分用 */
  drop2AtSec?: number | null;
}

export interface AdaptResult {
  ok: boolean
  editId?: string;
  /** 落定后的本地文件（相对 public/） */
  file?: string;
  durationSec?: number;
  /** 实测到的 drop 落点（秒） */
  actualDropSec?: number;
  /** 与目标的误差（拍） */
  errBeats?: number;
  rounds?: number;
  recipe?: string;
  /** 实测到的拍网格（比选打分要用） */
  grid?: BeatGrid;
  error?: string;
}

export interface AdaptCompareResult {
  ok: boolean;
  /** 胜出的那版（已落到正式路径） */
  winner?: ScoredCandidate;
  /** 全部跑通的候选，按分从高到低 */
  ranked: ScoredCandidate[];
  /** 没跑通的配方和原因 */
  failed: { recipe: string; error: string }[];
  file?: string;
  error?: string;
}

export class EpidemicMusicService {
  constructor(private client = new EpidemicMcpClient()) {}

  available(): boolean {
    return this.client.available();
  }

  /** 检索配乐候选并按 mscore 排序 */
  search(
    brief: string,
    options: {
      targetDurationSec: number;
      limit?: number;
      useGridFit?: boolean;
      gridHits?: VisualHit[];
      dropSec?: number;
      prevTrack?: CandidateTrack;
    }
  ): MusicCandidate[] {
    // 参数契约同 SearchSoundEffects：query / filter / sort / first（实测自 inputSchema）
    const res = this.client.callTool('SearchRecordings', {
      query: { term: brief },
      sort: { by: 'RELEVANCE', order: 'DESCENDING' },
      first: options.limit ?? 12,
      filter: {
        duration: {
          min: Math.max(0, Math.round(options.targetDurationSec * 0.8 * 1000)),
          max: Math.round(Math.min(MAX_CUE_SEC, options.targetDurationSec * 4) * 1000),
        },
      },
    });
    if (!res.ok) {
      console.warn(`[music] 检索失败: ${res.error}`);
      return [];
    }

    // bpm 与艺人在节点的 bpm / credits 上，normalizeHits 不带，这里按真实路径补
    const nodes: any[] = (res.data as any)?.data?.recordings?.nodes ?? [];
    const metaById = new Map<string, { bpm: number; artist: string }>();
    for (const n of nodes) {
      const e = n?.recording ?? n;
      if (e?.id) metaById.set(String(e.id), recordingMeta(n));
    }

    const cands: MusicCandidate[] = normalizeHits(res.data).map((c, i) => {
      const meta = metaById.get(c.id) ?? { bpm: 0, artist: '' };
      return {
        id: c.id,
        title: c.title,
        artist: meta.artist,
        bpm: meta.bpm,
        durationSec: c.durationSec,
        hasVocals: /vocal|vox|sung|lyric/i.test(`${c.title} ${c.tags.join(' ')}`),
        previewUrl: c.previewUrl,
        rank: i + 1,
      };
    }) as MusicCandidate[];

    for (const c of cands) {
      const b = computeMscore(c, {
        useGridFit: options.useGridFit,
        gridHits: options.gridHits,
        dropSec: options.dropSec,
        targetDurationSec: options.targetDurationSec,
        enableContinuity: Boolean(options.prevTrack),
        continuityFactors: options.prevTrack
          ? {
              prevBpm: options.prevTrack.bpm,
              prevKey: options.prevTrack.key,
              prevArtist: options.prevTrack.artist,
            }
          : undefined,
      });
      c.mscore = b.mscore;
      c.parts = b as unknown as Record<string, number>;
    }

    return cands.sort((a, b) => (b.mscore ?? 0) - (a.mscore ?? 0));
  }

  /**
   * Adapt 改编闭环。
   * 每一轮：发请求 → 轮询 → 下载 → 在真实音频上实测 drop 落点 → 按误差修正偏移。
   */
  adapt(req: AdaptRequest, filmId: string, cueId: string, outSuffix = ''): AdaptResult {
    if (!this.available()) {
      return { ok: false, error: '没有 EPIDEMIC_SOUND_API_KEY，无法调用 Adapt' };
    }
    if (req.targetDurationSec > MAX_CUE_SEC) {
      return { ok: false, error: `段长 ${req.targetDurationSec}s 超过接口上限 ${MAX_CUE_SEC}s` };
    }

    const workDir = path.join(process.cwd(), 'out', 'music', `${req.trackId.slice(0, 8)}-${filmId}-${cueId}`);
    fs.mkdirSync(path.join(workDir, 'edits'), { recursive: true });

    const recipe = req.recipe ?? 'r8';
    let offsetSec = req.dropAtSec ?? 0;
    let last: AdaptResult = { ok: false, error: '未进入闭环' };
    /**
     * 各轮里最好的那一版（drop 误差最小）。
     * 闭环是「发请求 → 实测 → 修正偏移 → 再发」，后面的轮次完全可能比前面更差，
     * 甚至直接软失败（COMPLETED 但 edit = null）。
     * 只保留最后一轮的话，一次成功的改编会被后面一次失败抹掉 —— 实测踩到过。
     */
    let best: AdaptResult | null = null;

    for (let round = 1; round <= 3; round++) {
      const edit = this.requestEdit({ ...req, recipe }, offsetSec);
      if (!edit.ok || !edit.editId) {
        last = { ok: false, error: edit.error ?? 'Adapt 返回空 edit（约束不可行的软失败）', rounds: round };
        break;
      }

      const wavRel = `music/${req.trackId.slice(0, 8)}-${filmId}-${cueId}-adapt${outSuffix}.wav`;
      const wavAbs = path.join(process.cwd(), 'public', wavRel);
      const cacheAbs = path.join(workDir, 'edits', `${edit.editId.slice(0, 8)}.wav`);

      if (!fs.existsSync(cacheAbs)) {
        // editId 完成后还会漂移：停 1.5s 再取一次当前 id
        sleepSync(1500);
        const fresh = this.pollEdit(edit.jobId ?? edit.editId);
        const dlId = fresh.editId ?? edit.editId;
        const url = this.editDownloadUrl(dlId, edit.jobId);
        if (!url || !EpidemicMcpClient.download(url, cacheAbs)) {
          last = { ok: false, error: '改编结果下载失败', rounds: round };
          break;
        }
      }
      fs.mkdirSync(path.dirname(wavAbs), { recursive: true });
      fs.copyFileSync(cacheAbs, wavAbs);

      // 在真实音频上实测 drop
      const grid = analyzeMusicFile(wavRel, {
        nominalBpm: req.nominalBpm ?? 120,
        totalSecHint: req.targetDurationSec,
      });
      const actual = grid.dropSec;
      const target = req.dropAtSec ?? actual;
      const errSec = actual - target;
      const errBeats = grid.beatSec > 0 ? Math.abs(errSec) / grid.beatSec : 99;

      last = {
        ok: true,
        editId: edit.editId,
        file: wavRel,
        durationSec: grid.totalSec,
        actualDropSec: actual,
        errBeats: Math.round(errBeats * 100) / 100,
        rounds: round,
        recipe,
        grid,
      };
      if (!best || (last.errBeats ?? 99) < (best.errBeats ?? 99)) best = last;

      /**
       * 合并写，不能整体覆盖 —— adapt.json 里还存着 prepare 留下的 prepared 记录，
       * 直接覆盖会把预改编缓存的索引抹掉：盘上 WAV 还在，但谁也找不到它了。
       */
      const adaptPath = path.join(workDir, 'adapt.json');
      let prev: Record<string, unknown> = {};
      if (fs.existsSync(adaptPath)) {
        try {
          prev = JSON.parse(fs.readFileSync(adaptPath, 'utf-8'));
        } catch {
          prev = {};
        }
      }
      fs.writeFileSync(
        adaptPath,
        JSON.stringify(
          {
            ...prev,
            ...last,
            grid: { bpm: grid.bpm, barSec: grid.barSec, source: grid.source },
          },
          null,
          2
        ),
        'utf-8'
      );

      // 判停：误差 ≤ 0.6 拍收工；误差超过 4 小节停（护栏）；落位不再动（<30ms）也收工
      if (errBeats <= 0.6) break;
      if (Math.abs(errSec) > grid.barSec * 4) {
        last.error = `drop 误差 ${errSec.toFixed(2)}s 超过 4 小节，停止修正（护栏）`;
        break;
      }
      const nextOffset = offsetSec - 0.6 * errSec;
      if (Math.abs(nextOffset - offsetSec) < 0.03) break;
      offsetSec = nextOffset;
    }

    /**
     * 返回各轮里最好的那一版。
     * 后面的轮次失败（软失败或下载失败）时，前面成功过的那一版仍然可用 ——
     * 只是把失败原因一并带出来，让调用方知道闭环没跑满。
     */
    if (best) {
      return last.ok && last === best
        ? best
        : { ...best, error: last.ok ? undefined : `后续轮次未能改进：${last.error}` };
    }
    return last;
  }

  /**
   * 相似选曲：以某首曲子为种子找同类。
   * 契约与音效那边同形：SearchSimilarToRecording({ id, first })，
   * 返回体是 data.recording.similarRecordings.nodes[] —— 单数外壳再套一层，
   * normalizeHits 已经认这种形状。
   */
  searchSimilar(
    trackId: string,
    options: { targetDurationSec: number; limit?: number } = { targetDurationSec: 30 }
  ): MusicCandidate[] {
    if (!trackId) return [];
    const res = this.client.callTool('SearchSimilarToRecording', {
      id: trackId,
      first: options.limit ?? 20,
    });
    if (!res.ok) {
      console.warn(`[epidemic] 相似选曲失败: ${res.error}`);
      return [];
    }
    // bpm / 艺人不在 normalizeHits 的输出里，按真实路径从原始节点补
    const nodes: any[] = (res.data as any)?.data?.recording?.similarRecordings?.nodes ?? [];
    const metaById = new Map<string, { bpm: number; artist: string }>();
    for (const n of nodes) {
      const e = n?.recording ?? n;
      if (e?.id) metaById.set(String(e.id), recordingMeta(n));
    }
    return normalizeHits(res.data).map((c, i) => {
      const meta = metaById.get(c.id) ?? { bpm: 0, artist: '' };
      return {
        id: c.id,
        title: c.title,
        artist: meta.artist,
        bpm: meta.bpm,
        durationSec: c.durationSec,
        hasVocals: /vocal|vox|sung|lyric/i.test(`${c.title} ${c.tags.join(' ')}`),
        previewUrl: c.previewUrl,
        rank: i + 1,
      } as MusicCandidate;
    });
  }

  /**
   * 原曲预览的本地缓存路径（§13 的 out/epidemic/music/<id8>.mp3）。
   * 比选改编要靠**原曲**的段落分析来翻配方偏好区；
   * 拿已经改编过的成品去分析，偏好区会退化成同一个，
   * r8 / r16 跑出字节相同的结果 —— 实测踩过。
   */
  static previewPath(trackId: string): string {
    return path.join(process.cwd(), 'out', 'epidemic', 'music', `${trackId.slice(0, 8)}.mp3`);
  }

  /** 把候选的预览存进缓存，供之后的比选改编分析原曲用 */
  cachePreview(trackId: string, previewUrl?: string): string | null {
    const abs = EpidemicMusicService.previewPath(trackId);
    if (fs.existsSync(abs) && fs.statSync(abs).size > 0) return abs;
    if (!previewUrl) return null;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    return EpidemicMcpClient.download(previewUrl, abs) ? abs : null;
  }

  /**
   * 确保原曲预览在本地。
   * 接口没有「按 id 取单曲」的工具，所以缓存不在时只能用检索词把它再搜出来，
   * 从命中里取 previewUrl。搜不到就返回 null，由调用方决定降级还是报错。
   */
  ensureSourcePreview(
    trackId: string,
    brief: string,
    targetDurationSec: number
  ): string | null {
    const cached = this.cachePreview(trackId);
    if (cached) return cached;
    if (!brief) return null;

    const hits = this.search(brief, { targetDurationSec, limit: 30 });
    const found = hits.find((h) => h.id === trackId);
    return found?.previewUrl ? this.cachePreview(trackId, found.previewUrl) : null;
  }

  /** 原曲的段落分析；没有缓存预览就返回 null（调用方该降级，而不是拿成品顶替） */
  sourceGrid(trackId: string, nominalBpm?: number): BeatGrid | null {
    const abs = EpidemicMusicService.previewPath(trackId);
    if (!fs.existsSync(abs)) return null;
    const g = analyzeMusicFile(abs, { nominalBpm: nominalBpm ?? 120 });
    return g.source === 'measured' ? g : null;
  }

  /**
   * 落原曲整首（§16.3 的 full）。
   * 走 DownloadRecording，不经过改编 —— 这个接口要的是**原始素材下载权限**，
   * 只能搜索 / 改编的订阅会拿到 FORBIDDEN，这里如实把服务端的话带出来。
   */
  fetchFullTrack(
    trackId: string,
    filmId: string,
    cueId: string
  ): { ok: boolean; file?: string; error?: string } {
    if (!this.available()) return { ok: false, error: '没有 EPIDEMIC_SOUND_API_KEY' };

    const res = this.client.callTool('DownloadRecording', {
      id: trackId,
      // stemType 的合法取值是 FULL / BASS / DRUMS / INSTRUMENTS（实测自 inputSchema），
      // 不是 FULL_MIX —— 写错会被判 GRAPHQL_VALIDATION_FAILED
      options: { fileType: 'WAV', stemType: 'FULL' },
    });
    if (!res.ok) return { ok: false, error: res.error };

    const url = pickUrl(res.data);
    if (!url) return { ok: false, error: '返回体里没有可下载的地址' };

    const rel = `music/${trackId.slice(0, 8)}-${filmId}-${cueId}-full.wav`;
    const abs = path.join(process.cwd(), 'public', rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!EpidemicMcpClient.download(url, abs)) {
      return { ok: false, error: '下载失败' };
    }
    return { ok: true, file: rel };
  }

  /**
   * 比选改编 (对标 §16.3)
   *   同一首曲子跑前 N 个配方，每个配方各自走完整闭环，
   *   再按附录 C 的改编候选分挑一版落到正式路径。
   *   快速改编 pool=1，比选改编 pool=6。
   *
   * 配方不是接口字段 —— 它是一组参数组合（偏好区粒度 / 钉不钉高潮 / 避开哪些段），
   * 所以这里要先分析原曲拿到 sections，才能把配方翻成 preferenceRegions。
   */
  adaptCompare(
    req: AdaptRequest,
    filmId: string,
    cueId: string,
    opts: {
      pool?: number;
      scoreSync?: number;
      fps?: number;
      /** 原曲的分析结果；没传就从 sourceFile 现分析 */
      sourceGrid?: BeatGrid;
      sourceFile?: string;
      custom?: { fromSec: number; toSec: number; preference: 'more' | 'less' }[];
    } = {}
  ): AdaptCompareResult {
    if (!this.available()) {
      return { ok: false, ranked: [], failed: [], error: '没有 EPIDEMIC_SOUND_API_KEY' };
    }

    const pool = opts.pool ?? 6;
    const fps = opts.fps ?? 30;
    const custom = opts.custom ?? req.preferenceRegions;
    const recipes = recipesFor(pool, Boolean(custom?.length));

    /**
     * 配方要按原曲的段落来翻 —— 没有 sections 就只有 custom 配方有意义，
     * 其余配方会退化成「没有偏好区」，N 个配方跑出同一个结果，纯浪费接口调用。
     */
    const sourceGrid =
      opts.sourceGrid ??
      (opts.sourceFile
        ? analyzeMusicFile(opts.sourceFile, { nominalBpm: req.nominalBpm ?? 120 })
        : undefined);
    if (!sourceGrid && !custom?.length) {
      return {
        ok: false,
        ranked: [],
        failed: [],
        error: '比选改编需要原曲的段落分析（传 sourceFile 或 sourceGrid），否则各配方会跑出同一个结果',
      };
    }

    const candidates = [];
    const failed: { recipe: string; error: string }[] = [];

    for (const name of recipes) {
      const spec = parseRecipe(name as RecipeName);
      const prefs = sourceGrid ? recipePreferences(spec, sourceGrid, custom) : (custom ?? []);
      console.log(`  配方 ${name}: ${prefs.length} 个偏好区${spec.pinDrop ? '，钉高潮' : ''}`);

      /**
       * 钉高潮的配方：要保住的区间从 drop 段起算，长度按配方的小节数。
       * 不钉的配方不发 requiredRegions —— 否则 N 个配方只差一个偏好区，
       * 接口很可能给出完全相同的剪法（实测字节级相同）。
       */
      const dropRegion =
        spec.pinDrop && sourceGrid
          ? {
              startSec: sourceGrid.dropSec,
              endSec: Math.min(
                sourceGrid.totalSec,
                sourceGrid.dropSec + requiredRegionSec(spec, sourceGrid.barSec)
              ),
            }
          : req.dropRegion;

      const r = this.adapt(
        {
          ...req,
          recipe: name,
          preferenceRegions: prefs,
          dropRegion,
          dropAtSec: spec.pinDrop ? req.dropAtSec : null,
        },
        filmId,
        cueId,
        `-${name}`
      );

      if (!r.ok || !r.grid || !r.file || !r.editId) {
        failed.push({ recipe: name, error: r.error ?? '未知失败' });
        continue;
      }
      candidates.push({
        recipe: name,
        editId: r.editId,
        file: r.file,
        grid: r.grid,
        actualDropSec: r.actualDropSec ?? null,
        actualDrop2Sec: pickSecondClimax(r.grid, req.drop2AtSec ?? null),
      });
    }

    if (candidates.length === 0) {
      return { ok: false, ranked: [], failed, error: '所有配方都没跑通' };
    }

    const ranked = rankCandidates(candidates, {
      dropAtSec: req.dropAtSec,
      drop2AtSec: req.drop2AtSec ?? null,
      scoreSync: opts.scoreSync ?? 0,
      fps,
      nominalBpm: req.nominalBpm,
    });

    // 胜出的那版复制到正式路径（其余留在各自的 -<配方>.wav，方便人工比对）
    const winner = ranked[0];
    const finalRel = `music/${req.trackId.slice(0, 8)}-${filmId}-${cueId}-adapt.wav`;
    fs.copyFileSync(
      path.join(process.cwd(), 'public', winner.file),
      path.join(process.cwd(), 'public', finalRel)
    );

    const workDir = path.join(
      process.cwd(),
      'out',
      'music',
      `${req.trackId.slice(0, 8)}-${filmId}-${cueId}`
    );
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'compare.json'),
      JSON.stringify(
        {
          pool,
          recipes,
          winner: winner.recipe,
          file: finalRel,
          ranked: ranked.map((c) => ({
            recipe: c.recipe,
            score: c.score,
            parts: c.parts,
            dropErrFrames: c.dropErrFrames,
            drop2ErrFrames: c.drop2ErrFrames,
            file: c.file,
            bpm: c.grid.bpm,
            totalSec: c.grid.totalSec,
          })),
          failed,
        },
        null,
        2
      ),
      'utf-8'
    );

    return { ok: true, winner, ranked, failed, file: finalRel };
  }

  private requestEdit(
    req: AdaptRequest,
    offsetSec: number
  ): { ok: boolean; editId?: string; jobId?: string; error?: string } {
    /**
     * 真实契约（实测自 inputSchema）：
     *   EditRecording({ id, input: { targetDurationMs, forceDuration, skipStems, maxResults,
     *                               downloadAudioFormat: 'MP3'|'WAV',
     *                               requiredRegionsAtOffsets: [{startMs, endMs, offsetMsInEdit}],
     *                               preferenceRegions: [{startMs, endMs, preferenceType: 'PREFER'|'AVOID'}] } })
     * 注意 requiredRegionsAtOffsets 要的是**区间**，不是单个偏移 ——
     * 只填 offsetMsInEdit 会被服务端判成校验失败。
     */
    const input: Record<string, unknown> = {
      targetDurationMs: Math.round(req.targetDurationSec * 1000),
      forceDuration: true,
      skipStems: true,
      maxResults: 1,
      downloadAudioFormat: 'WAV',
    };
    if (req.dropAtSec !== null && req.dropRegion) {
      /**
       * 硬约束（实测）：区间长度必须能整个装进成品 ——
       *   offsetMsInEdit + (endMs − startMs) ≤ targetDurationMs
       * 否则任务直接 FAILED（不是报错，是跑完才告诉你失败）。
       * 所以这里把区间按剩余空间夹紧，并保证至少留一小节的量。
       */
      const offsetMs = Math.max(0, Math.round((offsetSec - PREVIEW_LAG_SEC) * 1000));
      const targetMs = Math.round(req.targetDurationSec * 1000);
      const room = Math.max(0, targetMs - offsetMs);
      const wanted = Math.round((req.dropRegion.endSec - req.dropRegion.startSec) * 1000);
      const regionMs = Math.min(wanted, room);

      if (regionMs < 500) {
        // 连半秒都塞不下，钉点本身就不合理 —— 与其发一个必然失败的请求，不如明说
        return {
          ok: false,
          error:
            `钉点 ${offsetSec.toFixed(2)}s 距段尾只剩 ${(room / 1000).toFixed(2)}s，` +
            `装不下要保住的区间（接口要求 offset + 区间长 ≤ 段长）`,
        };
      }
      if (regionMs < wanted) {
        console.log(
          `  (要保住的区间按剩余空间夹到 ${(regionMs / 1000).toFixed(2)}s —— 原本 ${(wanted / 1000).toFixed(2)}s 装不下)`
        );
      }

      const startMs = Math.max(0, Math.round(req.dropRegion.startSec * 1000));
      input.requiredRegionsAtOffsets = [
        { startMs, endMs: startMs + regionMs, offsetMsInEdit: offsetMs },
      ];
    }
    if (req.preferenceRegions?.length) {
      input.preferenceRegions = req.preferenceRegions.map((r) => ({
        startMs: Math.round(r.fromSec * 1000),
        endMs: Math.round(r.toSec * 1000),
        preferenceType: r.preference === 'more' ? 'PREFER' : 'AVOID',
      }));
    }

    const res = this.client.callTool('EditRecording', { id: req.trackId, input });
    if (!res.ok) return { ok: false, error: res.error };

    // 真实响应路径：data.recordingEdit.{id, status}
    const jobId = (res.data as any)?.data?.recordingEdit?.id;
    const polled = this.pollEdit(jobId);
    return polled.editId
      ? { ok: true, editId: polled.editId, jobId }
      : { ok: false, error: polled.error ?? '状态 COMPLETED 但 edit = null（约束不可行）' };
  }

  /**
   * 轮询改编任务。
   * 真实响应路径是 data.recordingEditJob.{status, edit}，参数名是 id（不是 jobId）。
   * 状态 COMPLETED 但 edit = null 是「约束不可行」的软失败，不是接口错误 —— 这条照原版的实测边界。
   */
  private pollEdit(jobId: string | undefined): { editId?: string; error?: string } {
    if (!jobId) return { error: 'EditRecording 没有返回 job id' };
    for (let i = 0; i < 40; i++) {
      const res = this.client.callTool('PollEditRecordingJob', { id: jobId });
      if (!res.ok) return { error: res.error };
      const job = (res.data as any)?.data?.recordingEditJob ?? {};
      const status = String(job.status ?? '').toUpperCase();
      const editId = job.edit?.id ?? job.editId;
      if (status === 'COMPLETED') {
        return editId ? { editId } : { error: 'COMPLETED 但 edit = null（约束不可行的软失败）' };
      }
      if (status === 'FAILED') return { error: '改编任务失败（FAILED）' };
      sleepSync(1500);
    }
    return { error: '改编轮询超时' };
  }

  /** 真实契约：DownloadRecordingEdit({ input: { jobId, editId } }) */
  private editDownloadUrl(editId: string, jobId?: string): string | null {
    const res = this.client.callTool('DownloadRecordingEdit', {
      input: { jobId: jobId ?? editId, editId },
    });
    return res.ok ? pickUrl(res.data) : null;
  }

  /** 落原曲整首（full：不改编、清掉对拍） */
  downloadFull(trackId: string, destRel: string): boolean {
    // 真实契约：options { fileType: MP3|WAV, stemType: FULL|BASS|DRUMS|INSTRUMENTS }
    const res = this.client.callTool('DownloadRecording', {
      id: trackId,
      options: { fileType: 'WAV', stemType: 'FULL' },
    });
    const url = res.ok ? pickUrl(res.data) : null;
    if (!url) return false;
    return EpidemicMcpClient.download(url, path.join(process.cwd(), 'public', destRel));
  }
}

/** 把一段真实音频的分析结果缓存到 out/music/<键>/analysis.json */
export function analyzeAndCache(filmId: string, cueId: string, fileRel: string, nominalBpm: number, hintSec: number): BeatGrid {
  const grid = analyzeMusicFile(fileRel, { nominalBpm, totalSecHint: hintSec });
  const dir = path.join(process.cwd(), 'out', filmId, 'music', cueId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'analysis.json'), JSON.stringify(grid, null, 2), 'utf-8');
  return grid;
}

function sleepSync(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* 串行脚本，忙等可接受 */
  }
}
