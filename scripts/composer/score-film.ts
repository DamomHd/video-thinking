/**
 * 按片作曲（vw music score <片>）：读片子的 audio/score.ts → 渲染 → 写回 music.json、把对拍映射清成恒等。
 *
 * 和 vw music match（通用模板 / 曲库改编，弹性对拍拉伸画面）是两条路：这条路的谱是为这部片写的——
 * 网格先行时画面锁在配乐网格上，画面先行（grid.lock: false）时谱贴着画面时刻写，两种都不需要对拍拉伸。渲染走 scripts/py/render_score.py（采样器 / 拨弦物理建模 / 内置合成）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ScoreDef, scoreEvents, ScoreGrid, filmMoments } from '../../src/shared/score.js';
import { MusicFile, SyncFile } from '../../src/shared/types.js';
import { runPy } from '../py/opuscar.js';
import { getFilm } from '../../src/films.js';

/** 读片子的谱：audio/score.ts 里第一个带 grid + notes 的导出 */
export async function loadFilmScore(filmId: string, root = process.cwd()): Promise<ScoreDef | null> {
  const p = path.join(root, 'src', 'films', filmId, 'audio', 'score.ts');
  if (!fs.existsSync(p)) return null;
  const mod = await import(pathToFileURL(p).href);
  const def = Object.values(mod).find((v) => v && typeof v === 'object' && 'grid' in (v as object) && 'notes' in (v as object)) as ScoreDef | undefined;
  if (!def) throw new Error(`${filmId}/audio/score.ts 里没有 defineScore({ grid, notes }) 的导出`);
  return def;
}

export interface ScoreRenderResult {
  file: string;
  durSec: number;
  notes: number;
  instruments: string[];
  credits: string[];
  problems: string[];
  grid: ScoreGrid;
}

export async function renderFilmScore(filmId: string, root = process.cwd()): Promise<ScoreRenderResult> {
  const def = await loadFilmScore(filmId, root);
  if (!def) throw new Error(`片子 ${filmId} 没有 audio/score.ts（按片作曲要先写谱：src/shared/score.ts 的 defineScore）`);
  // 画面上有名字的时刻：画面先行的谱用 g.hit(id) 贴着它们写
  const adapter = await getFilm(filmId).getAdapter();
  const { grid, notes, durSec, problems } = scoreEvents(def, filmMoments(adapter.hits(), adapter.events?.() ?? []));
  if (!notes.length) throw new Error('谱里一个音都没有');

  const rel = `music/${filmId}-score.wav`;
  const out = path.join(root, 'public', rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const res = runPy([path.join(root, 'scripts/py/render_score.py')], {
    input: JSON.stringify({ events: notes, dur: durSec, out: path.resolve(out), room: def.room ?? { size: 0.45, mix: 0.18 } }),
  });
  const parsed = JSON.parse(res.trim().split('\n').pop() ?? '{}') as { credits: string[]; instruments: string[] };

  // 写回 music.json：一段，从片头到片尾；保留已有段的音量 / 淡入淡出 / 高潮引用
  const audioDir = path.join(root, 'src', 'films', filmId, 'audio');
  const mPath = path.join(audioDir, 'music.json');
  const music: MusicFile = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf-8')) : { version: 2, cues: [] };
  const prev = music.cues[0];
  const total = adapter.timeline.totalSeconds;
  const credits = parsed.credits ?? [];
  music.cues = [
    {
      id: prev?.id ?? 'c1',
      label: def.title ?? prev?.label ?? '按片作曲',
      in: { ref: `SC.${adapter.timeline.scenes[0]?.id ?? 'start'}`, sec: 0 },
      out: { ref: 'SC.end', sec: total },
      ...(prev?.climax ? { climax: prev.climax } : {}),
      ...(prev?.climax2 ? { climax2: prev.climax2 } : {}),
      brief: prev?.brief ?? (def.grid.lock === false ? '按片作曲：谱贴着画面写' : '按片作曲：画面锁在配乐网格上'),
      startFromSec: 0,
      volume: prev?.volume ?? 0.8,
      fadeInSec: prev?.fadeInSec ?? 0.3,
      fadeOutSec: prev?.fadeOutSec ?? 2,
      track: {
        id: `${filmId}-score`,
        title: def.title ?? '按片作曲',
        artist: '按片作曲（采样 / 合成）',
        bpm: def.grid.bpm,
        key: def.grid.key,
        file: rel,
        durationSec: durSec,
        adapted: false,
        source: 'score',
        license: credits.length ? credits.join('；') : '本地合成（无第三方素材）',
        url: '',
      },
    },
  ];
  fs.writeFileSync(mPath, JSON.stringify(music, null, 2) + '\n', 'utf-8');

  // 谱和画面已经对齐（画面锁在网格上，或谱贴着画面写）：不需要对拍拉伸，映射清成恒等
  const sync: SyncFile = { knots: [[0, 0]], anchors: [], report: { scoreSync: 0, lockedCount: 0, downgradedCount: 0, droppedCount: 0 } } as unknown as SyncFile;
  fs.writeFileSync(path.join(audioDir, 'sync.json'), JSON.stringify(sync, null, 2) + '\n', 'utf-8');

  return { file: rel, durSec, notes: notes.length, instruments: parsed.instruments ?? [], credits, problems, grid };
}
