/**
 * CC0 配乐：从 Freesound 按需取一首配乐，交给现有的配乐链路（剪辑钉高潮 → 分析 → 对拍求解）
 *
 * 实测（2026-10-26）决定的做法：
 *   · Freesound 的检索词是「全部都要匹配」，多词 brief 常常一首都搜不到 → 拆成几个词分别搜，再合并去重
 *   · 搜到的不全是音乐（大量环境声、拟音）→ 按标签过滤：要有音乐类标签，不能有现场录音类标签
 *   · 接口不返回速度 / 调性分析 → 下载 HQ 预览，用本仓库的分析器（scripts/sync/analyze）自己测
 *   · 原曲要比片长长：剪辑模块只能删 / 插整小节，铺不满片长就会在片尾留出静音
 * 候选打分：贴合描述、速度贴合拍点网格、节拍清晰度、有没有高潮段、原曲高潮离目标多近、下载量与评分（口碑当质量先验）。
 * 剪辑改动太大（删 / 插超过 MAX_CUT_BARS 小节）的不要：小节头对齐了，听感也可能断裂。
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FreesoundProvider, CC0_URL, freesoundKey } from './cc0.js';
import { Candidate } from './scoring.js';
import { analyzeMusicFile, BeatGrid } from '../sync/analyze.js';
import { cutMusic, CutResult } from '../music/cut.js';

/** 有这些标签之一才算音乐 */
const MUSIC_TAGS = ['music', 'song', 'loop', 'melody', 'soundtrack', 'background-music', 'instrumental', 'piano', 'guitar', 'beat', 'orchestral', 'cinematic', 'synth', 'electronic', 'corporate', 'chill', 'ambient-music', 'score', 'theme', 'bgm'];
/** 有这些标签就不是配乐（现场录音、拟音、人声） */
const NOISE_TAGS = ['field-recording', 'fieldrecording', 'birds', 'bird', 'wind', 'rain', 'traffic', 'speech', 'voice', 'talking', 'footsteps', 'foley', 'crowd', 'street', 'nature'];

/** 剪辑最多动多少小节 */
export const MAX_CUT_BARS = 16;
/** 剪辑改动的时长最多占段长的比例：短片插 13 小节等于整段都是复制出来的循环，能量曲线是平的 */
export const MAX_CUT_SHARE = 0.35;

/** 剪辑改动是否过大（纯函数）：小节数超上限，或改动时长超过段长的 MAX_CUT_SHARE */
export function cutTooBig(bars: number, bpm: number, cueSec: number): boolean {
  const barSec = bpm > 0 ? (4 * 60) / bpm : 2;
  return bars > MAX_CUT_BARS || bars * barSec > cueSec * MAX_CUT_SHARE;
}

export interface MusicCandidate extends Candidate {
  downloads: number;
  rating: number;
  grid?: Pick<BeatGrid, 'bpm' | 'periodR' | 'dropSec' | 'totalSec' | 'sections'>;
  musicScore?: number;
  notes?: string[];
}

/** brief → 检索词：整句一条，再按逗号 / 空格拆成单词各一条（去重、去停用词） */
export function musicQueries(brief: string): string[] {
  const stop = new Set(['and', 'the', 'with', 'for', 'a', 'of', 'music', 'track']);
  const words = brief
    .toLowerCase()
    .split(/[,，、/\s]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !stop.has(w));
  return [...new Set([brief.trim().toLowerCase(), ...words])].filter(Boolean);
}

/** 标签像不像一首配乐 */
export function looksLikeMusic(tags: string[]): boolean {
  const t = tags.map((x) => x.toLowerCase());
  if (t.some((x) => NOISE_TAGS.includes(x))) return false;
  return t.some((x) => MUSIC_TAGS.includes(x) || /music|song|bpm|loop/.test(x));
}

/** 速度贴合：bpm、半速、倍速里离目标窗口最近的那个，窗口内 1 分，偏出 10% 降到 0 */
export function bpmFit(bpm: number, window: [number, number]): number {
  if (!bpm) return 0;
  const mid = (window[0] + window[1]) / 2;
  const best = [bpm, bpm * 2, bpm / 2].reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  if (best >= window[0] && best <= window[1]) return 1;
  const off = Math.min(Math.abs(best - window[0]), Math.abs(best - window[1])) / mid;
  return Math.max(0, 1 - off / 0.1);
}

/** 贴合描述：brief 的单词在标签 + 曲名里命中的比例 */
export function briefFit(brief: string, tags: string[], title: string): number {
  const words = musicQueries(brief).slice(1);
  if (!words.length) return 0;
  const hay = [...tags, title].join(' ').toLowerCase();
  return words.filter((w) => hay.includes(w)).length / words.length;
}

/**
 * 配乐候选打分（纯函数，0..1）：贴合描述 0.25 · 速度贴合 0.2 · 节拍清晰 0.15 · 有高潮 0.1 · 高潮位置 0.1 · 口碑 0.2。
 * 节拍清晰用自相关 periodR（≥ 0.4 记满分）；有 drop 段记满分，只有能量跃升记一半；
 * 高潮位置：原曲 drop 离目标越近，剪辑动得越少（差半个段长记 0）。
 */
export function scoreMusic(
  c: { downloads: number; rating: number; grid?: MusicCandidate['grid']; tags?: string[]; title?: string },
  window: [number, number],
  want: { brief?: string; dropAtSec?: number; cueSec?: number } = {}
): { score: number; notes: string[] } {
  const notes: string[] = [];
  const rel = want.brief ? briefFit(want.brief, c.tags ?? [], c.title ?? '') : 0;
  const dropFit = c.grid && want.dropAtSec !== undefined && want.cueSec ? Math.max(0, 1 - Math.abs(c.grid.dropSec - want.dropAtSec) / (want.cueSec * 0.5)) : 0;
  if (want.brief) notes.push(`贴合描述 ${rel.toFixed(2)}`);
  const fit = c.grid ? bpmFit(c.grid.bpm, window) : 0;
  const clarity = c.grid?.periodR !== undefined ? Math.min(1, c.grid.periodR / 0.4) : 0;
  const hasDrop = c.grid?.sections?.some((s) => s.kind === 'drop') ? 1 : c.grid?.sections?.some((s) => s.kind === 'build') ? 0.5 : 0;
  const prior = 0.6 * Math.min(1, Math.log10(c.downloads + 1) / 4) + 0.4 * (c.rating / 5);
  if (c.grid) notes.push(`bpm ${c.grid.bpm.toFixed(0)}（贴合 ${fit.toFixed(2)}）`, `节拍清晰 ${clarity.toFixed(2)}`, hasDrop ? '有高潮段' : '没有明显高潮', `高潮在 ${c.grid.dropSec.toFixed(0)}s`);
  else notes.push('预览无法分析');
  notes.push(`口碑 ${prior.toFixed(2)}`);
  return { score: Math.round((0.25 * rel + 0.2 * fit + 0.15 * clarity + 0.1 * hasDrop + 0.1 * dropFit + 0.2 * prior) * 1000) / 1000, notes };
}

export function searchFreesoundMusic(brief: string, needSec: number, window: [number, number], options: { analyzeTop?: number; dropAtSec?: number } = {}): MusicCandidate[] {
  const want = { brief, dropAtSec: options.dropAtSec, cueSec: needSec };
  const key = freesoundKey();
  if (!key) throw new Error('没有 FREESOUND_API_KEY（.env），用不了 Freesound 配乐');
  const fs0 = new FreesoundProvider(key);
  const found = new Map<string, MusicCandidate>();
  for (const q of musicQueries(brief)) {
    for (const sort of ['score', 'downloads_desc']) {
      let res: any;
      try {
        const args = ['-sS', '--fail', '--max-time', '60', '-G', '-H', '@-', 'https://freesound.org/apiv2/search/text/'];
        const params: Record<string, string> = {
          query: q,
          filter: `license:"Creative Commons 0" duration:[${Math.ceil(needSec + 2)} TO 600]`,
          sort,
          fields: 'id,name,tags,duration,license,username,url,previews,type,num_downloads,avg_rating',
          page_size: '15',
        };
        for (const [k, v] of Object.entries(params)) args.push('--data-urlencode', `${k}=${v}`);
        res = JSON.parse(execFileSync('curl', args, { input: `Authorization: Token ${key}\n`, encoding: 'utf-8', maxBuffer: 1 << 24 }));
      } catch (e) {
        console.warn(`[freesound 配乐] 检索失败（${q}）: ${(e as Error).message.split('\n')[0]}`);
        continue;
      }
      for (const r of res?.results ?? []) {
        if (!String(r.license).includes('publicdomain/zero') || !looksLikeMusic(r.tags ?? [])) continue;
        const id = `fs:${r.id}`;
        if (found.has(id)) continue;
        found.set(id, {
          id,
          title: `${r.name} — ${r.username}`,
          tags: r.tags ?? [],
          slugs: [],
          durationSec: Number(r.duration) || 0,
          previewUrl: r.previews?.['preview-hq-ogg'] ?? r.previews?.['preview-hq-mp3'],
          rank: { relevance: 999, popularity: 999 },
          source: 'freesound',
          license: CC0_URL,
          url: r.url,
          author: r.username,
          fileType: r.type,
          downloads: Number(r.num_downloads) || 0,
          rating: Number(r.avg_rating) || 0,
        });
      }
    }
  }
  // 先按口碑粗排，只对前几名拉预览做真实分析（省流量）
  const pool = [...found.values()].sort((a, b) => scoreMusic(b, window, want).score - scoreMusic(a, window, want).score).slice(0, options.analyzeTop ?? 8);
  for (const c of pool) {
    const f = fs0.cachePreview(c);
    if (!f) continue;
    const g = analyzeMusicFile(f, { nominalBpm: (window[0] + window[1]) / 2, totalSecHint: c.durationSec });
    if (g.source === 'measured') c.grid = { bpm: g.bpm, periodR: g.periodR, dropSec: g.dropSec, totalSec: g.totalSec, sections: g.sections };
  }
  for (const c of pool) {
    const s = scoreMusic(c, window, want);
    c.musicScore = s.score;
    c.notes = s.notes;
  }
  return pool.sort((a, b) => (b.musicScore ?? 0) - (a.musicScore ?? 0));
}

export interface FreesoundMusicPick {
  cand: MusicCandidate;
  fileRel: string;
  cut: CutResult;
  tried: string[];
}

/**
 * 按名次逐个试：取原文件（授权过取无损原文件，否则 HQ 预览）→ 转 wav → 剪到段长并把高潮钉到 dropAtSec。
 * 剪辑验证通过（高潮落点误差在一小节内）就用；都没通过时用第一首剪得出来的，并说明；一首都剪不出来返回 null。
 */
export function pickFreesoundMusic(cands: MusicCandidate[], filmId: string, cueId: string, cueSec: number, dropAtSec: number, maxTry = 3): FreesoundMusicPick | null {
  const fs0 = new FreesoundProvider();
  const tried: string[] = [];
  const pub = (rel: string) => path.join(process.cwd(), 'public', rel);
  const outRel = `music/${filmId}-${cueId}.wav`;
  // 没通过验证的那首先另存一份：后面的候选会覆盖 outRel，回退时要还原它
  let fallback: (FreesoundMusicPick & { stash: string }) | null = null;
  for (const [i, cand] of cands.slice(0, maxTry).entries()) {
    const src = fs0.cacheOriginal(cand) ?? fs0.cachePreview(cand);
    if (!src) {
      tried.push(`${cand.title}：下载失败`);
      continue;
    }
    const srcRel = `music/${filmId}-${cueId}-src.wav`;
    try {
      execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', src, '-ar', '48000', '-ac', '2', path.join(process.cwd(), 'public', srcRel)]);
    } catch {
      tried.push(`${cand.title}：转码失败`);
      continue;
    }
    const cut = cutMusic({ srcRel, outRel, targetSec: cueSec, dropAtSec, nominalBpm: cand.grid?.bpm });
    fs.rmSync(path.join(process.cwd(), 'public', srcRel), { force: true });
    if (!cut.ok) {
      tried.push(`${cand.title}：${cut.reason}`);
      continue;
    }
    if (cutTooBig(cut.bars ?? 0, cand.grid?.bpm ?? 0, cueSec)) {
      tried.push(`${cand.title}：要${cut.kind === 'insert' ? '插' : '删'} ${cut.bars} 小节才能把高潮挪到位，改动太大（超过 ${MAX_CUT_BARS} 小节或段长的 ${MAX_CUT_SHARE * 100}%）`);
      continue;
    }
    if (cut.verified) {
      if (fallback) fs.rmSync(pub(fallback.stash), { force: true });
      return { cand, fileRel: outRel, cut, tried };
    }
    tried.push(`${cand.title}：${cut.reason}`);
    if (!fallback) {
      const stash = `music/${filmId}-${cueId}-cand${i}.wav`;
      fs.copyFileSync(pub(outRel), pub(stash));
      fallback = { cand, fileRel: outRel, cut, tried: [], stash };
    }
  }
  if (!fallback) return null;
  fs.renameSync(pub(fallback.stash), pub(outRel));
  return { cand: fallback.cand, fileRel: outRel, cut: fallback.cut, tried };
}
