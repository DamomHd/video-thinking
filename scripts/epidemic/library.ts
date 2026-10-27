/**
 * 配乐曲库与改编落定 (对标 architecture.html §16.3)
 *
 *   prepare  预改编：r8 闭环 → 下载 WAV → 分析 → 干跑一次求解，结果写进 adapt.json 的 prepared
 *   pick     命中已预改编、缓存齐全、且 dropAt 一致时，**直接本地落定，不调接口**
 *   choose   换成另一版（比选产物里的某个配方）
 *   full     落原曲整首，并清掉这一段的对拍
 *   remove   解绑这一段的曲目
 *   gc       删掉没有任何段引用的音频
 *
 * 落定 applyEdit 是五步：
 *   ① 拷 WAV 到 public/music
 *   ② 写 music.json 里这一段的 track（顺手本地估调性，写进 track.key）
 *   ③ 分析
 *   ④ 跑 solveCues，其它段的分析当常量
 *   ⑤ 写 sync.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { TruthManager } from '../spot/truth.js';
import { analyzeMusicFile, analyzeCue, BeatGrid } from '../sync/analyze.js';
import { estimateKeyOfFile } from '../sync/key.js';
import { solveCues, toSyncFile } from '../sync/solve.js';
import { EpidemicMusicService, AdaptRequest } from './music.js';
import { FilmAdapter, MusicFile, VisualHit } from '../../src/shared/types.js';

/** 缓存键：有段时是 <id8>-<片>-<段> */
export function musicKey(trackId: string, filmId: string, cueId?: string): string {
  const id8 = trackId.slice(0, 8);
  return cueId ? `${id8}-${filmId}-${cueId}` : `${id8}-${filmId}`;
}

export function workDirOf(key: string): string {
  return path.join(process.cwd(), 'out', 'music', key);
}

function readAdaptJson(key: string): Record<string, unknown> | null {
  const f = path.join(workDirOf(key), 'adapt.json');
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return null;
  }
}

function writeAdaptJson(key: string, data: Record<string, unknown>): void {
  const dir = workDirOf(key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'adapt.json'), JSON.stringify(data, null, 2), 'utf-8');
}

export interface ApplyResult {
  ok: boolean;
  file?: string;
  key?: string;
  scoreSync?: number;
  error?: string;
}

/**
 * 落定一版音频到某个配乐段。
 * 不碰接口 —— 输入必须是已经在本地的 WAV。
 */
export function applyEdit(
  filmId: string,
  cueId: string,
  srcWavAbs: string,
  meta: {
    trackId: string;
    title: string;
    artist: string;
    bpm: number;
    adapted: boolean;
    editId?: string;
  },
  adapter: FilmAdapter
): ApplyResult {
  if (!fs.existsSync(srcWavAbs)) {
    return { ok: false, error: `源文件不存在: ${srcWavAbs}` };
  }

  const truthMgr = new TruthManager(filmId);
  const truth = truthMgr.readAll();
  const music: MusicFile = truth.music;
  const cue = music.cues.find((c) => c.id === cueId);
  if (!cue) return { ok: false, error: `没有配乐段 '${cueId}'` };

  // ① 拷到 public/music
  const key = musicKey(meta.trackId, filmId, cueId);
  const rel = `music/${key}.wav`;
  const abs = path.join(process.cwd(), 'public', rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (path.resolve(srcWavAbs) !== path.resolve(abs)) fs.copyFileSync(srcWavAbs, abs);

  // ② 写 track（顺手本地估调性）
  const est = estimateKeyOfFile(abs);
  const grid = analyzeMusicFile(rel, { nominalBpm: meta.bpm, totalSecHint: cue.out.sec - cue.in.sec });
  cue.track = {
    id: meta.trackId,
    title: meta.title,
    artist: meta.artist,
    bpm: meta.bpm,
    key: est?.camelot,
    file: rel,
    durationSec: grid.totalSec,
    adapted: meta.adapted,
    editId: meta.editId,
  };
  truthMgr.write('music', music);

  // ③④ 分析 + 求解（其它段的分析当常量，只有本段用新的）
  const hits: VisualHit[] = adapter.hits();
  const report = solveCues(
    music.cues,
    hits,
    (c) =>
      c.id === cueId
        ? grid
        : analyzeCue(filmId, c.id, c.track?.file, c.track?.bpm ?? meta.bpm, c.out.sec - c.in.sec),
    [],
    30
  );

  // ⑤ 写 sync.json（走九张真值的写入口，别自己拼路径）
  truthMgr.write('sync', toSyncFile(report, hits, music.cues));

  return { ok: true, file: rel, key, scoreSync: report.scoreSync };
}

export interface PrepareResult {
  ok: boolean;
  key?: string;
  file?: string;
  dropAtSec?: number | null;
  actualDropSec?: number;
  /** 干跑求解的得分 —— 还没写进 sync.json */
  dryScoreSync?: number;
  error?: string;
}

/**
 * 预改编：r8 闭环 → 下载 → 分析 → **干跑一次求解**（不写 sync.json）。
 * 结果记在 adapt.json 的 prepared 里，之后 pick 命中就不用再调接口。
 */
export function prepare(
  svc: EpidemicMusicService,
  filmId: string,
  cueId: string,
  req: AdaptRequest,
  adapter: FilmAdapter,
  /** 曲目元信息；落定时要写进 music.json，不记下来就只能沿用段上旧曲目的名字 */
  meta?: { title?: string; artist?: string }
): PrepareResult {
  const key = musicKey(req.trackId, filmId, cueId);
  const r = svc.adapt({ ...req, recipe: 'r8' }, filmId, cueId);
  if (!r.ok || !r.file || !r.grid) {
    return { ok: false, key, error: r.error ?? '预改编失败' };
  }

  // 干跑求解：其它段照旧，本段换成刚改编出来的网格；只看分，不落盘
  const truth = new TruthManager(filmId).readAll();
  const report = solveCues(
    truth.music.cues,
    adapter.hits(),
    (c) =>
      c.id === cueId
        ? (r.grid as BeatGrid)
        : analyzeCue(filmId, c.id, c.track?.file, c.track?.bpm ?? 120, c.out.sec - c.in.sec),
    [],
    30
  );

  const prev = readAdaptJson(key) ?? {};
  writeAdaptJson(key, {
    ...prev,
    prepared: {
      at: new Date().toISOString(),
      recipe: 'r8',
      trackId: req.trackId,
      title: meta?.title,
      artist: meta?.artist,
      file: r.file,
      editId: r.editId,
      dropAtSec: req.dropAtSec,
      actualDropSec: r.actualDropSec,
      errBeats: r.errBeats,
      dryScoreSync: report.scoreSync,
      bpm: r.grid.bpm,
      totalSec: r.grid.totalSec,
    },
  });

  return {
    ok: true,
    key,
    file: r.file,
    dropAtSec: req.dropAtSec,
    actualDropSec: r.actualDropSec,
    dryScoreSync: report.scoreSync,
  };
}

/**
 * 找这一段最近一次预改编是哪首曲子。
 *
 * prepare 的结果按 <id8>-<片>-<段> 存，而 adapt 不带 --track 时拿的是段上
 * **当前绑定**的曲目 —— 两者往往不是一首，于是「prepare 完直接 adapt」会落空，
 * 反而去调了接口。这里按目录名倒推，让那条路径真的走得通。
 */
export interface PreparedRef {
  trackId: string;
  at: string;
  title?: string;
  artist?: string;
}

export function findPrepared(filmId: string, cueId: string): PreparedRef | null {
  const root = path.join(process.cwd(), 'out', 'music');
  if (!fs.existsSync(root)) return null;

  const suffix = `-${filmId}-${cueId}`;
  let best: PreparedRef | null = null;
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(suffix)) continue;
    const j = readAdaptJson(name);
    const p = j?.prepared as Record<string, unknown> | undefined;
    if (!p?.trackId) continue;
    const at = String(p.at ?? '');
    if (!best || at > best.at) {
      best = {
        trackId: String(p.trackId),
        at,
        title: p.title ? String(p.title) : undefined,
        artist: p.artist ? String(p.artist) : undefined,
      };
    }
  }
  return best;
}

/**
 * 命中预改编：缓存齐全、且 dropAt 一致时返回那份结果。
 * 任一条件不满足就返回 null —— 调用方该去调接口。
 */
export function hitPrepared(
  trackId: string,
  filmId: string,
  cueId: string,
  dropAtSec: number | null
): { file: string; editId?: string; bpm: number } | null {
  const key = musicKey(trackId, filmId, cueId);
  const j = readAdaptJson(key);
  const p = j?.prepared as Record<string, unknown> | undefined;
  if (!p?.file) return null;

  const abs = path.join(process.cwd(), 'public', String(p.file));
  if (!fs.existsSync(abs)) return null;

  const prepDrop = p.dropAtSec === null || p.dropAtSec === undefined ? null : Number(p.dropAtSec);
  const same =
    (prepDrop === null && dropAtSec === null) ||
    (prepDrop !== null && dropAtSec !== null && Math.abs(prepDrop - dropAtSec) < 0.01);
  if (!same) return null;

  return { file: String(p.file), editId: p.editId ? String(p.editId) : undefined, bpm: Number(p.bpm ?? 120) };
}

/** 解绑一段的曲目，并清掉它在 sync 里的锚点 */
export function removeCueTrack(filmId: string, cueId: string): { ok: boolean; error?: string } {
  const truthMgr = new TruthManager(filmId);
  const truth = truthMgr.readAll();
  const cue = truth.music.cues.find((c) => c.id === cueId);
  if (!cue) return { ok: false, error: `没有配乐段 '${cueId}'` };
  delete cue.track;
  truthMgr.write('music', truth.music);

  // 这一段的锚点一并清掉
  const sync = truth.sync;
  if (sync) {
    sync.anchors = (sync.anchors ?? []).filter((a) => a.cueId !== cueId);
    truthMgr.write('sync', sync);
  }
  return { ok: true };
}

export interface GcReport {
  kept: string[];
  removed: string[];
  bytesFreed: number;
}

/**
 * 清掉 public/music 下没有任何地方引用的音频。
 *
 * 引用来源有三处，少看一处就会删掉还在用的素材：
 *   ① 正片的 music.json（九张真值之一）
 *   ② 衍生片自己的 music.json（短片的 src/films/<片>/short/music.json）
 *   ③ 源码里写死的常量（预告片的 TRAILER_MUSIC = 'music/xxx.wav'）
 * ②③ 不在真值体系里，所以这里直接对整个 src/ 做文本扫描兜底 ——
 * 宁可多留几个文件，也不能删掉片子要用的。
 */
function collectReferences(filmIds: string[]): Set<string> {
  const referenced = new Set<string>();

  // ① 正片真值
  for (const id of filmIds) {
    try {
      const truth = new TruthManager(id).readAll();
      for (const c of truth.music.cues) {
        if (c.track?.file) referenced.add(path.basename(c.track.file));
      }
    } catch {
      // 这个片没有声音目录就跳过
    }
  }

  // ②③ 扫 src/ 下所有文本里出现的 music/<名字>
  const re = /music\/([A-Za-z0-9._\-]+\.(?:wav|mp3))/g;
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'node_modules') walk(full);
      } else if (/\.(tsx?|jsx?|json)$/.test(e.name)) {
        const text = fs.readFileSync(full, 'utf-8');
        for (const m of text.matchAll(re)) referenced.add(m[1]);
      }
    }
  };
  walk(path.join(process.cwd(), 'src'));

  return referenced;
}

export function gc(filmIds: string[], opts: { dryRun?: boolean } = {}): GcReport {
  const musicDir = path.join(process.cwd(), 'public', 'music');
  if (!fs.existsSync(musicDir)) return { kept: [], removed: [], bytesFreed: 0 };

  const referenced = collectReferences(filmIds);
  const kept: string[] = [];
  const removed: string[] = [];
  let bytesFreed = 0;

  for (const name of fs.readdirSync(musicDir)) {
    if (!/\.(wav|mp3)$/i.test(name)) continue;
    if (referenced.has(name)) {
      kept.push(name);
      continue;
    }
    const abs = path.join(musicDir, name);
    bytesFreed += fs.statSync(abs).size;
    removed.push(name);
    if (!opts.dryRun) fs.rmSync(abs, { force: true });
  }

  return { kept, removed, bytesFreed };
}
