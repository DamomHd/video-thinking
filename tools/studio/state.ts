/**
 * 工作台投影 out/<片>/state.json (对标 architecture.html §13)
 *
 * 真值永远是 src/films/<片>/audio/*.json；这里只是把它们连同适配器的
 * 幕表 / 拍点 / 弹性区摊平成一份方便前端一次读完的快照。
 * 成片不读 state.json。
 *
 * 单独成模块是因为命令行和工作台都要写它：
 * vw music cue 改完段要刷新投影（附录 B 的 CUE_NO_EXPORT 可以关掉），
 * 抄第二份迟早会和服务端分叉。
 */

import fs from 'node:fs';
import path from 'node:path';
import { TruthManager } from '../../scripts/spot/truth.js';
import { InboxService } from '../../scripts/spot/inbox.js';
import { getFilm } from '../../src/films.js';
import { VersionService } from '../../scripts/spot/version.js';

/** 母片优先级：静音母片 > 60fps 静音画面 > 成片 */
const VIDEO_CANDIDATES = ['master-mute.mp4', 'video-60-muted.mp4', 'final-60.mp4', 'final.mp4'];

export async function exportFilmState(id: string): Promise<Record<string, unknown>> {
  const film = getFilm(id);
  const adapter = await film.getAdapter();
  const truthMgr = new TruthManager(id);
  const inboxSvc = new InboxService(id);

  const outDir = path.join(process.cwd(), 'out', id);
  fs.mkdirSync(outDir, { recursive: true });

  let videoUrl = '';
  for (const name of VIDEO_CANDIDATES) {
    if (fs.existsSync(path.join(outDir, name))) {
      videoUrl = `/media/out/${id}/${name}`;
      break;
    }
  }

  // 素材库概况（顶栏）：落定了几个槽、候选池多大、来自哪些来源
  const readJson = (p: string) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : null);
  const manifest = readJson(path.join(process.cwd(), 'src', 'films', id, 'audio', 'manifest.json')) ?? {};
  const cands: Record<string, { source?: string; id?: string }[]> = readJson(path.join(outDir, 'candidates.json')) ?? {};
  const sources: Record<string, number> = {};
  for (const list of Object.values(cands)) for (const c of list ?? []) {
    const src = c.source ?? (String(c.id ?? '').startsWith('local:') ? 'local' : 'epidemic');
    sources[src] = (sources[src] ?? 0) + 1;
  }
  const library = {
    slots: Object.keys(manifest).length,
    candidates: Object.values(cands).reduce((a, l) => a + (l?.length ?? 0), 0),
    sources,
  };

  // 版本（顶栏）：最近一次快照之后真值有没有改过
  const latest = new VersionService(id).list()[0] ?? null;
  const audioDir = path.join(process.cwd(), 'src', 'films', id, 'audio');
  const lastEdit = fs.existsSync(audioDir)
    ? Math.max(0, ...fs.readdirSync(audioDir).filter((f) => f.endsWith('.json')).map((f) => fs.statSync(path.join(audioDir, f)).mtimeMs))
    : 0;
  const versionInfo = {
    latest: latest ? { id: latest.id, tag: latest.tag, createdAt: latest.createdAt } : null,
    dirty: !latest || lastEdit > Date.parse(latest.createdAt) + 1000,
  };

  const state = {
    filmId: id,
    title: adapter.title,
    totalSeconds: adapter.timeline.totalSeconds,
    fps: adapter.fps,
    scenes: adapter.timeline.scenes,
    hits: adapter.hits(),
    zones: adapter.zones(),
    truth: truthMgr.readAll(),
    inbox: inboxSvc.list(),
    videoUrl,
    library,
    versionInfo,
    updatedAt: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

/**
 * 改完真值后刷新投影。
 * CUE_NO_EXPORT=1 时跳过（附录 B）—— 批量改段时不必每改一次都重跑适配器。
 */
export async function refreshStateUnlessSuppressed(id: string): Promise<boolean> {
  if (process.env.CUE_NO_EXPORT === '1' || process.env.CUE_NO_EXPORT === 'true') return false;
  await exportFilmState(id);
  return true;
}
