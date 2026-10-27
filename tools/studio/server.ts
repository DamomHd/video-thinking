/**
 * 工作台服务端 (Studio Server)
 * 对标 architecture.html §18.1 / §18.2：
 *   进程模型：127.0.0.1:5177，浏览器（Web Audio）与仓库真值之间的转发层；
 *   毫秒级①就地写真值（gain / fade / duck / mix / offset / music cfg）
 *   进程内②直接调用（配乐段操作、对拍求解）
 *   媒体走 Range 206，视频可以毫秒级拖动。
 * 真值永远是 src/films/<片>/audio/*.json；out/<片>/state.json 只是投影。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { TruthManager } from '../../scripts/spot/truth.js';
import { InboxService } from '../../scripts/spot/inbox.js';
import { VersionService } from '../../scripts/spot/version.js';
import { listFilms, getFilm } from '../../src/films.js';
import { applyCueOp } from '../../scripts/spot/music-cues-ops.js';
import { startJob, getJob, listJobs, enqueueJob, queueStatus } from './jobs.js';
import { exportFilmState } from './state.js';
import { solveCues, clearSync } from '../../scripts/sync/solve.js';
import { analyzeCue, analyzeMusicFile } from '../../scripts/sync/analyze.js';
import { decodeMono } from '../../scripts/audio/decode.js';
import { MusicFile, SyncFile } from '../../src/shared/types.js';

export interface StudioOptions {
  port?: number;
}

const STUDIO_DIR = path.dirname(new URL(import.meta.url).pathname);

export async function startStudio(defaultFilmId = 'us', options: StudioOptions = {}): Promise<void> {
  const port = options.port || 5177;
  const projectRoot = process.cwd();

  /** 导出当前真值投影到 out/<片>/state.json，并返回给前端（实现见 ./state.ts，命令行共用） */
  const getFilmState = exportFilmState;

  /** 重新对拍：真实分析 + 真实弹性区，写回标准 SyncFile */
  async function resolveSync(id: string): Promise<{ sync: SyncFile; report: any }> {
    const film = getFilm(id);
    const adapter = await film.getAdapter();
    const truthMgr = new TruthManager(id);
    const truth = truthMgr.readAll();
    const hits = adapter.hits();

    const report = solveCues(
      truth.music.cues,
      hits,
      (cue) => analyzeCue(id, cue.id, cue.track?.file, cue.track?.bpm ?? 108, cue.out.sec - cue.in.sec),
      adapter.zones(),
      30
    );

    const sync: SyncFile = {
      knots: report.knots.map((k) => [k.inner, k.outer] as [number, number]),
      anchors: [
        ...report.anchors.map((a) => ({
          hit: a.hitId,
          cueId: 'c1',
          targetSec: a.filmSec,
          musicSec: a.musicSec,
          musicKind: a.matchedKind,
          errMs: Math.round(a.residualSec * 1000),
          priority: a.priority,
          status: (a.downgraded ? 'downgraded' : 'locked') as 'downgraded' | 'locked',
          note: hits.find((h) => h.id === a.hitId)?.note,
        })),
        ...report.droppedHits.map((d) => ({
          hit: d.hitId,
          cueId: 'c1',
          targetSec: hits.find((h) => h.id === d.hitId)?.sec ?? 0,
          musicSec: hits.find((h) => h.id === d.hitId)?.sec ?? 0,
          musicKind: 'beat' as const,
          errMs: 0,
          priority: (d.priority as 'P0' | 'P1' | 'P2') ?? 'P1',
          status: 'dropped' as const,
          note: d.reason,
        })),
      ],
      report: {
        scoreSync: report.scoreSync,
        lockedCount: report.anchors.filter((a) => !a.downgraded).length,
        downgradedCount: report.downgradedCount,
        droppedCount: report.droppedCount,
      },
    };

    truthMgr.write('sync', sync);
    return { sync, report: { ...sync.report, gridSource: report.gridSource, zones: report.zoneReport } };
  }

  function serveFile(filePath: string, req: http.IncomingMessage, res: http.ServerResponse) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found: ' + filePath);
      return;
    }
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime: Record<string, string> = {
      '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
      '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
      '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
    };
    const type = mime[ext] || 'application/octet-stream';
    const range = req.headers.range;

    if (range && (ext === '.mp4' || ext === '.wav' || ext === '.mp3')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': type,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': type, 'Accept-Ranges': 'bytes' });
      fs.createReadStream(filePath).pipe(res);
    }
  }

  const readBody = (req: http.IncomingMessage): Promise<any> =>
    new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on('error', reject);
    });

  const json = (res: http.ServerResponse, code: number, payload: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    const filmId = url.searchParams.get('film') || defaultFilmId;

    try {
      // ── 静态与媒体
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return serveFile(path.join(STUDIO_DIR, 'app.html'), req, res);
      }
      if (['/app.css', '/app.js', '/formulas.js'].includes(url.pathname)) {
        return serveFile(path.join(STUDIO_DIR, url.pathname.slice(1)), req, res);
      }
      if (url.pathname.startsWith('/media/')) {
        return serveFile(path.join(projectRoot, url.pathname.replace('/media/', '')), req, res);
      }
      if (url.pathname.startsWith('/public/')) {
        return serveFile(path.join(projectRoot, url.pathname), req, res);
      }

      // ── 只读
      if (url.pathname === '/api/films') {
        return json(res, 200, listFilms().map((f) => ({ id: f.id, title: f.title, fps: f.fps })));
      }
      if (url.pathname === '/api/state') {
        return json(res, 200, await getFilmState(filmId));
      }
      if (url.pathname === '/api/jobs') {
        return json(res, 200, { jobs: listJobs(), queue: queueStatus() });
      }
      /**
       * 曲库总览：每段绑了什么曲子、有没有预改编缓存、比选过哪些配方。
       * 纯读盘，不碰接口，所以放在只读区。
       */
      if (url.pathname === '/api/versions') {
        const { VersionService } = await import('../../scripts/spot/version.js');
        return json(res, 200, { versions: new VersionService(url.searchParams.get('film') || filmId).list() });
      }
      /**
       * 改编 / 预改编进度：改编命令每一步都把 adapt.json 落盘，这里只读它。
       * 前端 1.5s 拉一次，不占后端。
       */
      if (
        url.pathname === '/api/music/adapt-status' ||
        url.pathname === '/api/music/prepare-status'
      ) {
        const f = url.searchParams.get('film') || filmId;
        const cue = url.searchParams.get('cue') || 'c1';
        const root = path.join(projectRoot, 'out', 'music');
        const dirs = fs.existsSync(root)
          ? fs.readdirSync(root).filter((n) => n.endsWith(`-${f}-${cue}`))
          : [];
        let latest: Record<string, unknown> | null = null;
        let at = '';
        for (const d of dirs) {
          const af = path.join(root, d, 'adapt.json');
          if (!fs.existsSync(af)) continue;
          const st = fs.statSync(af);
          if (st.mtime.toISOString() > at) {
            at = st.mtime.toISOString();
            try {
              latest = JSON.parse(fs.readFileSync(af, 'utf-8'));
            } catch {
              latest = null;
            }
          }
        }
        const wantPrepare = url.pathname.endsWith('prepare-status');
        return json(res, 200, {
          cue,
          at,
          state: wantPrepare ? ((latest?.prepared as unknown) ?? null) : (latest ?? null),
          queue: queueStatus(),
          jobs: listJobs().filter((j) => j.label.includes(`:${f}:${cue}`)),
        });
      }
      /**
       * 原曲的波形 + 小节头 + 段落，给改编页的「段落偏好」拖选用（§18.3）。
       * 原曲是 Epidemic 的预览（out/epidemic/music/<id8>.mp3），搜索时已顺手缓存；
       * 段上绑的是本地曲目时用它自己的文件。结果按「路径 + 修改时间」缓存在进程里。
       */
      if (url.pathname === '/api/music/source') {
        const f = url.searchParams.get('film') || filmId;
        const cueId = url.searchParams.get('cue') || 'c1';
        const trackId = url.searchParams.get('track') || '';
        const { EpidemicMusicService } = await import('../../scripts/epidemic/music.js');
        const truth = new TruthManager(f).readAll();
        const cue = truth.music.cues.find((c) => c.id === cueId);
        const tid = trackId || cue?.track?.id || '';
        let abs = tid ? EpidemicMusicService.previewPath(tid) : '';
        if (!abs || !fs.existsSync(abs)) {
          abs = cue?.track?.file && cue.track.id === tid ? path.join(projectRoot, 'public', cue.track.file) : '';
        }
        if (!abs || !fs.existsSync(abs)) {
          return json(res, 404, { error: `曲目 ${tid.slice(0, 8)} 的原曲不在本地，先在曲库里搜到它（会缓存预览）` });
        }
        return json(res, 200, sourceOverview(abs, cue?.track?.bpm ?? 120));
      }
      if (url.pathname === '/api/music/candidates') {
        const f = path.join(projectRoot, 'out', url.searchParams.get('film') || filmId, 'music-search.json');
        if (!fs.existsSync(f)) return json(res, 200, { candidates: [] });
        return json(res, 200, JSON.parse(fs.readFileSync(f, 'utf-8')));
      }
      if (url.pathname === '/api/sfx/candidates') {
        // 一个槽的候选池（试听用：本地文件优先，其次是来源的在线预览）+ 当前落定的是哪一条
        const slot = url.searchParams.get('slot') || '';
        const cPath = path.join(projectRoot, 'out', filmId, 'candidates.json');
        const mPath = path.join(projectRoot, 'src', 'films', filmId, 'audio', 'manifest.json');
        const pool = fs.existsSync(cPath) ? JSON.parse(fs.readFileSync(cPath, 'utf-8')) : {};
        const manifest = fs.existsSync(mPath) ? JSON.parse(fs.readFileSync(mPath, 'utf-8')) : {};
        const current = manifest[slot]?.[0]?.id ?? null;
        const list = (pool[slot] ?? []).slice(0, 24).map((c: any) => ({
          id: c.id,
          title: c.title,
          source: c.source ?? (String(c.id).startsWith('local:') ? '本地合成' : 'epidemic'),
          durationSec: c.durationSec ?? null,
          score: c.score ?? null,
          license: c.license ?? null,
          author: c.author ?? null,
          preview: c.file && fs.existsSync(path.join(projectRoot, 'public', c.file)) ? '/public/' + c.file : c.previewUrl ?? null,
          current: c.id === current,
        }));
        return json(res, 200, { slot, current, candidates: list });
      }
      if (url.pathname === '/api/music/library') {
        return json(res, 200, musicLibrary(url.searchParams.get('film') || filmId));
      }
      if (url.pathname.startsWith('/api/job/')) {
        const job = getJob(url.pathname.slice('/api/job/'.length));
        return job ? json(res, 200, { job }) : json(res, 404, { error: '没有这个作业' });
      }

      if (req.method !== 'POST') {
        return json(res, 404, { error: 'Not Found' });
      }

      const body = await readBody(req);
      const film: string = body.film || filmId;
      const truthMgr = new TruthManager(film);

      // ── 毫秒级：就地写真值
      if (url.pathname === '/api/offset') {
        const truth = truthMgr.readAll();
        if (!truth.plan.some((p) => p.key === body.key)) {
          return json(res, 400, { error: `计划里没有 key '${body.key}'（拒绝写孤儿调参）` });
        }
        const v = Number(body.offsetSec);
        if (Math.abs(v) < 1e-6) delete truth.offsets[body.key];
        else truth.offsets[body.key] = Math.round(v * 10000) / 10000;
        truthMgr.write('offsets', truth.offsets);
        return json(res, 200, { success: true, offsets: truth.offsets });
      }

      if (url.pathname === '/api/gain') {
        const truth = truthMgr.readAll();
        const db = Number(body.gainDb);
        if (Math.abs(db) < 1e-6) delete truth.gains[body.key];
        else truth.gains[body.key] = db;
        truthMgr.write('gains', truth.gains);
        return json(res, 200, { success: true, gains: truth.gains });
      }

      if (url.pathname === '/api/fade') {
        const truth = truthMgr.readAll();
        const dir = body.direction === 'in' ? 'in' : 'out';
        truth.fades[dir][body.key] = Number(body.fadeSec);
        truthMgr.write('fades', truth.fades);
        return json(res, 200, { success: true, fades: truth.fades });
      }

      if (url.pathname === '/api/duck') {
        const truth = truthMgr.readAll();
        truth.ducks[body.key] = {
          db: Number(body.db),
          preSec: Number(body.preSec),
          holdSec: Number(body.holdSec),
          releaseSec: Number(body.releaseSec),
          layers: body.layers,
        };
        truthMgr.write('ducks', truth.ducks);
        return json(res, 200, { success: true, ducks: truth.ducks });
      }

      if (url.pathname === '/api/mix') {
        const truth = truthMgr.readAll();
        const mix = {
          layers: body.layers ?? truth.mix.layers,
          muted: body.muted ?? truth.mix.muted,
          master: body.master ?? truth.mix.master,
        };
        truthMgr.write('mix', mix);
        return json(res, 200, { success: true, mix });
      }

      // ── 配乐段
      if (url.pathname === '/api/music/cfg') {
        const truth = truthMgr.readAll();
        const patch: Record<string, unknown> = {};
        for (const k of ['volume', 'startFromSec', 'fadeInSec', 'fadeOutSec', 'label', 'brief']) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        const updated = applyCueOp(truth.music, { kind: 'set', cueId: body.cueId, patch } as any);
        truthMgr.write('music', updated);
        return json(res, 200, { success: true, music: updated });
      }

      if (url.pathname === '/api/music/cue') {
        const truth = truthMgr.readAll();
        const op = buildCueOp(body);
        if (!op) return json(res, 400, { error: `不支持的段操作: ${body.op}` });
        const updated = applyCueOp(truth.music, op);
        truthMgr.write('music', updated);
        return json(res, 200, { success: true, music: updated });
      }

      if (url.pathname === '/api/music/restore') {
        truthMgr.write('music', body.music as MusicFile);
        return json(res, 200, { success: true, music: body.music });
      }

      // ── 批注（画面点击打点一律进批注，计划真值仍由适配器派生）
      if (url.pathname === '/api/inbox') {
        const item = new InboxService(film).create({
          targetType: body.targetType ?? 'global',
          filmSec: Number(body.filmSec ?? 0),
          instruction: String(body.instruction ?? ''),
          visual: body.visual,
          audio: body.audio,
        });
        return json(res, 200, { success: true, item });
      }

      // ── 进程内：对拍与编舞同步
      /**
       * 检索 / 相似：走子进程。
       *
       * 文档把它归在「② 进程内」，前提是调用很快。
       * 但 MCP 客户端是同步 curl —— 实测一次检索 14.7s，
       * 期间整个单线程后端全停，连 /api/state 都要等 14.8s 才回。
       * 所以这里按③级办：起子进程，结果写 out/<片>/music-search.json，
       * 前端轮询作业、完成后读 /api/music/candidates。
       */
      if (url.pathname === '/api/music/search' || url.pathname === '/api/music/similar') {
        const cueId = String(body.cue ?? 'c1');
        const args =
          url.pathname === '/api/music/similar'
            ? ['music', 'similar', film, cueId, '--json']
            : ['music', 'search', film, cueId, '--json'];
        if (body.trackId) args.push(`--track=${body.trackId}`);
        if (body.q) args.push(`--q=${body.q}`);
        if (body.gridFit === false) args.push('--no-grid-fit');
        if (body.continuity) args.push('--continuity');
        if (body.limit) args.push(`--limit=${Number(body.limit)}`);
        const label = `${url.pathname === '/api/music/similar' ? 'music-similar' : 'music-search'}:${film}:${cueId}`;
        return json(res, 200, { job: startJob(label, args) });
      }

      /* ── 音效：看候选 / 换成指定的一条 / 重排计划 ── */
      if (url.pathname === '/api/sfx/choose') {
        // 把选中的候选挪到候选池第一位，再落定这个槽（pick 按候选池顺序取）；之后前端再跑一次 sfx plan
        const slot = String(body.slot ?? '');
        const candId = String(body.candId ?? '');
        const cPath = path.join(projectRoot, 'out', film, 'candidates.json');
        const pool = fs.existsSync(cPath) ? JSON.parse(fs.readFileSync(cPath, 'utf-8')) : {};
        const list: { id: string }[] = pool[slot] ?? [];
        const i = list.findIndex((c) => c.id === candId);
        if (i < 0) return json(res, 404, { error: `槽 ${slot} 的候选里没有 ${candId}` });
        list.unshift(...list.splice(i, 1));
        fs.writeFileSync(cPath, JSON.stringify(pool, null, 1), 'utf-8');
        return json(res, 200, { job: startJob(`sfx-pick:${film}:${slot}`, ['sfx', 'pick', film, slot]) });
      }
      if (url.pathname === '/api/sfx/plan') {
        return json(res, 200, { job: startJob(`sfx-plan:${film}`, ['sfx', 'plan', film]) });
      }

      /* ── 音效：换素材 / 相似 / 再搜一批 ── */
      if (url.pathname === '/api/pick') {
        const args = ['sfx', 'pick', film, String(body.slot ?? '')];
        return json(res, 200, { job: startJob(`sfx-pick:${film}:${body.slot}`, args) });
      }
      if (url.pathname === '/api/similar') {
        const { searchSimilarForSlot } = await import('../../scripts/spot/search.js');
        const adapter = await (await getFilm(film)).getAdapter();
        const r = searchSimilarForSlot(adapter, String(body.slot ?? ''), {
          seedId: body.seedId ? String(body.seedId) : undefined,
          first: body.first ? Number(body.first) : 5,
        });
        return json(res, r.ok ? 200 : 400, r);
      }
      if (url.pathname === '/api/more') {
        // 再搜一批：追加语义，已有候选原样在前
        const args = ['sfx', 'search', film, String(body.slot ?? '')];
        if (body.keep) args.push(`--keep=${Number(body.keep)}`);
        return json(res, 200, { job: startJob(`sfx-more:${film}:${body.slot}`, args) });
      }

      /* ── 版本快照 ── */
      if (url.pathname === '/api/version/update' || url.pathname === '/api/version/delete') {
        const { VersionService } = await import('../../scripts/spot/version.js');
        const svc = new VersionService(film);
        const vid = String(body.id ?? '');
        if (url.pathname.endsWith('delete')) {
          return json(res, 200, { ok: svc.delete(vid) });
        }
        const meta = svc.update(vid, {
          tag: body.tag !== undefined ? String(body.tag) : undefined,
          note: body.note !== undefined ? String(body.note) : undefined,
        });
        return json(res, meta ? 200 : 404, { ok: Boolean(meta), meta });
      }

      /* ── 重新导出投影 ── */
      if (url.pathname === '/api/export') {
        return json(res, 200, { state: await exportFilmState(film) });
      }

      /* ── 第 ③ 级：异步子进程（改编 1–3 分钟，不能卡住服务） ── */
      if (url.pathname === '/api/music/adapt') {
        const args = ['music', 'adapt', film, String(body.cue ?? 'c1')];
        if (body.trackId) args.push(`--track=${body.trackId}`);
        if (body.pool) args.push(`--pool=${Number(body.pool)}`);
        // 段落偏好透传给命令行，由命令行做规则校验（drop / 尾奏不许设成少用）
        if (Array.isArray(body.prefs) && body.prefs.length > 0) args.push(`--prefs=${JSON.stringify(body.prefs)}`);
        return json(res, 200, { job: startJob(`music-adapt:${film}:${body.cue}`, args) });
      }
      if (url.pathname === '/api/music/pick') {
        // 落定：优先命中预改编缓存（CLI 的 adapt 走的就是这条，pool=1 时不调接口）
        const args = ['music', 'adapt', film, String(body.cue ?? 'c1'), '--pool=1'];
        if (body.trackId) args.push(`--track=${body.trackId}`);
        return json(res, 200, { job: startJob(`music-pick:${film}:${body.cue}`, args) });
      }
      if (url.pathname === '/api/music/surgery') {
        const args = ['sync', 'surgery', film, String(body.cue ?? 'c1')];
        if (body.at !== undefined) args.push(`--at=${Number(body.at)}`);
        if (body.apply) args.push('--apply');
        return json(res, 200, { job: startJob(`music-surgery:${film}:${body.cue}`, args) });
      }
      if (url.pathname === '/api/music/set') {
        // 段参数就地写真值（毫秒级），不起子进程
        const { applyCueOp } = await import('../../scripts/spot/music-cues-ops.js');
        const truth = truthMgr.readAll();
        const patch: Record<string, unknown> = {};
        for (const k of ['volume', 'label', 'brief'] as const) {
          if (body[k] !== undefined) patch[k] = body[k];
        }
        if (Object.keys(patch).length === 0) {
          return json(res, 400, { error: '没有要改的字段（volume / label / brief）' });
        }
        const updated = applyCueOp(truth.music, {
          kind: 'set',
          cueId: String(body.cue ?? 'c1'),
          patch: patch as never,
        });
        truthMgr.write('music', updated);
        return json(res, 200, { state: await exportFilmState(film) });
      }
      if (url.pathname === '/api/music/choose') {
        const args = ['music', 'choose', film, String(body.cue ?? 'c1'), `--recipe=${body.recipe}`];
        return json(res, 200, { job: startJob(`music-choose:${film}:${body.cue}`, args) });
      }
      if (url.pathname === '/api/music/full') {
        return json(res, 200, {
          job: startJob(`music-full:${film}:${body.cue}`, ['music', 'full', film, String(body.cue ?? 'c1')]),
        });
      }
      if (url.pathname === '/api/music/remove') {
        const { removeCueTrack } = await import('../../scripts/epidemic/library.js');
        const r = removeCueTrack(film, String(body.cue ?? 'c1'));
        return json(res, r.ok ? 200 : 400, r);
      }

      /* ── 第 ④ 级：预改编队列（后台，最多同时 2 个） ── */
      if (url.pathname === '/api/music/prepare') {
        const cues: string[] = Array.isArray(body.cues) ? body.cues : [String(body.cue ?? 'c1')];
        const queued = cues.map((cueId) => {
          const args = ['music', 'prepare', film, cueId];
          if (body.trackId) args.push(`--track=${body.trackId}`);
          if (body.title) args.push(`--title=${body.title}`);
          if (body.artist) args.push(`--artist=${body.artist}`);
          const r = enqueueJob(`music-prepare:${film}:${cueId}`, args);
          return { cue: cueId, queued: r.queued };
        });
        return json(res, 200, { queued, status: queueStatus() });
      }

      if (url.pathname === '/api/sync/solve') {
        const { report } = await resolveSync(film);
        return json(res, 200, { success: true, report });
      }

      // 只分析不求解：看看这首曲子的网格长什么样
      if (url.pathname === '/api/sync/analyze') {
        const truth = truthMgr.readAll();
        const out = truth.music.cues.map((cue) => {
          const g = analyzeCue(
            film,
            cue.id,
            cue.track?.file,
            cue.track?.bpm ?? 108,
            cue.out.sec - cue.in.sec
          );
          return {
            cueId: cue.id,
            source: g.source,
            bpm: g.bpm,
            beatSec: g.beatSec,
            barSec: g.barSec,
            dropSec: g.dropSec,
            periodR: g.periodR,
            beatOffsetSec: g.beatOffsetSec,
            beats: g.beats,
            downbeats: g.downbeats,
            sections: g.sections,
            jumps: g.jumps,
            endingSec: g.endingSec,
          };
        });
        return json(res, 200, { success: true, analyses: out });
      }

      // 清成恒等映射
      if (url.pathname === '/api/sync/clear') {
        const f = getFilm(film);
        const adapter = await f.getAdapter();
        clearSync(film, adapter.timeline.totalSeconds);
        return json(res, 200, { success: true });
      }

      // §18.1 第 ③ 级：几十秒到几分钟的操作丢给子进程，请求立刻返回作业 id。
      // 在请求里 await 它会让整个服务停止响应（连 <video> 的 Range 请求都拿不到）。
      if (url.pathname === '/api/sync-choreo') {
        const job = startJob(`sync-choreo:${film}`, ['spot', 'sync-choreo', film]);
        return json(res, 202, { success: true, job });
      }

      // ── 版本快照
      if (url.pathname === '/api/version/save') {
        const meta = new VersionService(film).save(body.tag || 'studio', body.note || '');
        return json(res, 200, { success: true, meta });
      }
      if (url.pathname === '/api/version/load') {
        const ok = new VersionService(film).restore(body.id);
        return json(res, ok ? 200 : 400, { success: ok });
      }

      return json(res, 404, { error: 'Not Found: ' + url.pathname });
    } catch (e: any) {
      return json(res, 400, { error: e?.message || String(e) });
    }
  });

  // 关服务时收掉还在跑的子进程
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      void import('./jobs.js').then((m) => m.killAllJobs());
      server.close(() => process.exit(0));
    });
  }

  server.listen(port, '127.0.0.1', () => {
    console.log(`\n========================================`);
    console.log(`[vw studio] 工作台已启动: http://127.0.0.1:${port}/?film=${defaultFilmId}`);
    console.log(`  - Web Audio 实时 7 泳道监听（与渲染端同一套音量 / 淡化 / 让位 / 时间映射公式）`);
    console.log(`  - BS.1770-4 离线响度测量 + 真实波形 + 画面点击批注`);
    console.log(`  - 真值就地写回 src/films/${defaultFilmId}/audio/*.json；Range 206 毫秒级拖动`);
    console.log(`========================================\n`);
  });
}

/** 把前端的扁平段操作参数翻成 CueOp */
function buildCueOp(body: any) {
  switch (body.op) {
    case 'split':
      return { kind: 'split' as const, cueId: body.cueId, atSec: Number(body.atSec) };
    case 'merge':
      return { kind: 'merge' as const, cueIdA: body.cueIdA, cueIdB: body.cueIdB };
    case 'join':
      return {
        kind: 'join' as const,
        cueId: body.cueId,
        joinSpec: { kind: body.joinKind, gapSec: body.gapSec, overlapSec: body.overlapSec },
      };
    case 'remove':
      return { kind: 'remove' as const, cueId: body.cueId };
    default:
      return null;
  }
}

/**
 * 曲库总览（工作台的「曲库」页）。
 * 对每一段报：绑的曲目、有没有预改编缓存、比选留下了哪些配方产物。
 * 全部读盘，不调接口 —— 打开页面不该花钱也不该等网络。
 */
function musicLibrary(filmId: string): {
  cues: {
    id: string;
    label: string;
    inSec: number;
    outSec: number;
    track: Record<string, unknown> | null;
    prepared: Record<string, unknown> | null;
    recipes: { recipe: string; file: string; score?: number }[];
  }[];
} {
  const truth = new TruthManager(filmId).readAll();
  const outRoot = path.join(process.cwd(), 'out', 'music');

  const cues = truth.music.cues.map((cue) => {
    const trackId = cue.track?.id ?? '';
    const key = trackId ? `${trackId.slice(0, 8)}-${filmId}-${cue.id}` : '';
    let prepared: Record<string, unknown> | null = null;
    let recipes: { recipe: string; file: string; score?: number }[] = [];

    /**
     * 预改编缓存要扫这一段**所有**曲目的目录，不能只看当前绑定。
     * 命令行的 findPrepared 就是这么找的 —— 只看当前绑定的话，
     * 「预改编了 B 曲、段上还绑着 A 曲」时面板会说没有，
     * 但 vw music adapt 却会命中 B 的缓存，两边对不上。
     * 当前绑定的那一份排在最后处理，让它覆盖掉其它份。
     */
    const all = fs.existsSync(outRoot)
      ? fs.readdirSync(outRoot).filter((n) => n.endsWith(`-${filmId}-${cue.id}`))
      : [];
    const dirs = key && all.includes(key) ? [...all.filter((n) => n !== key), key] : all;
    for (const d of dirs) {
      const af = path.join(outRoot, d, 'adapt.json');
      if (fs.existsSync(af)) {
        try {
          prepared = (JSON.parse(fs.readFileSync(af, 'utf-8')).prepared as Record<string, unknown>) ?? null;
        } catch {
          /* 坏文件当没有 */
        }
      }
      const cf = path.join(outRoot, d, 'compare.json');
      if (fs.existsSync(cf)) {
        try {
          const cmp = JSON.parse(fs.readFileSync(cf, 'utf-8'));
          recipes = (cmp.ranked ?? []).map((r: Record<string, unknown>) => ({
            recipe: String(r.recipe),
            file: String(r.file),
            score: typeof r.score === 'number' ? r.score : undefined,
          }));
        } catch {
          /* 同上 */
        }
      }
    }

    return {
      id: cue.id,
      label: cue.label ?? cue.id,
      inSec: cue.in.sec,
      outSec: cue.out.sec,
      track: (cue.track as unknown as Record<string, unknown>) ?? null,
      prepared,
      recipes,
    };
  });

  return { cues };
}

/** 原曲概览的进程内缓存：键是「路径|修改时间」 */
const sourceCache = new Map<string, unknown>();

function sourceOverview(abs: string, nominalBpm: number): unknown {
  const key = `${abs}|${fs.statSync(abs).mtimeMs}`;
  const hit = sourceCache.get(key);
  if (hit) return hit;

  // 同步解码会占住服务一两秒；只在人点「载入原曲」时发生一次，之后走缓存
  const dec = decodeMono(abs);
  const BUCKETS = 1200;
  const peaks: number[] = [];
  if (dec) {
    const step = Math.max(1, Math.floor(dec.mono.length / BUCKETS));
    for (let b = 0; b < BUCKETS; b++) {
      let m = 0;
      for (let i = b * step; i < Math.min(dec.mono.length, (b + 1) * step); i++) m = Math.max(m, Math.abs(dec.mono[i]));
      peaks.push(Math.round(m * 1000) / 1000);
    }
  }
  const g = analyzeMusicFile(abs, { nominalBpm });
  const out = {
    durationSec: g.totalSec,
    bpm: g.bpm,
    barSec: g.barSec,
    dropSec: g.dropSec,
    downbeats: g.downbeats.map((d) => Math.round(d * 1000) / 1000),
    sections: g.sections ?? [],
    peaks,
  };
  sourceCache.set(key, out);
  return out;
}
