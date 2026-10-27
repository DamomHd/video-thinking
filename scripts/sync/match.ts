/**
 * 配乐全链匹配 (music match)
 * 对标 architecture.html §16 的三层让步：
 *   ① 音乐让：Adapt 把原曲 drop 钉到画面主高潮（没有凭据时退回本地 ABC 作曲引擎）
 *   ② 画面让：弹性区按比例分摊，刚性区一帧不动（solve + ElasticSolver）
 *   ③ 容差内残差：超了就放弃锚点，并在报告里写明原因
 * 这里产出的 sync.json 全部来自真实分析与真实求解 —— 不再写死 errMs / scoreSync。
 */

import fs from 'node:fs';
import { DEFAULT_MUSIC_VOLUME } from '../../src/shared/audio-math.js';
import path from 'node:path';
import { getFilm } from '../../src/films.js';
import { TruthManager } from '../spot/truth.js';
import { analyzeCue, BeatGrid } from './analyze.js';
import { solveCues } from './solve.js';
import { scanBpmGrid } from './bpmfit.js';
import { EpidemicMusicService } from '../epidemic/music.js';
import { generateFilmScoreWav } from '../composer/engine.js';
import type { Orchestra } from '../composer/sampled.js';
import { estimateKeyOfFile } from './key.js';
import { runSurgery } from './surgery.js';
import { MusicCue, SyncAnchor } from '../../src/shared/types.js';

export interface MatchMusicResult {
  cueId: string;
  trackId: string;
  bpm: number;
  gridCostFrames: number;
  source: 'epidemic-adapt' | 'freesound' | 'local-compose' | 'existing';
  adapted: boolean;
  actualDropSec?: number;
  errBeats?: number;
}

export async function matchMusicForFilm(
  filmId = 'loomcare-demo',
  options: {
    forceLocal?: boolean;
    /** freesound：按 brief 从 Freesound 取一首 CC0 配乐（剪到段长、高潮钉到 P0）；取不到退回本地作曲 */
    source?: 'freesound';
    /** 配乐描述（英文关键词，如 "minimal piano, calm"），写进段的 brief；不给时用段上已有的 brief */
    brief?: string;
    /** 本地作曲用真实乐器采样演奏（配器方案：cinematic / mallets / chamber）；不给就用合成音色 */
    orchestra?: Orchestra;
    /** 速度搜索范围（风格规定了速度时用，如 [100, 112]）；不给就在 60–180 里按画面拍点拟合 */
    bpmRange?: [number, number];
  } = {}
): Promise<MatchMusicResult[]> {
  const film = getFilm(filmId);
  const adapter = await film.getAdapter();
  const truthMgr = new TruthManager(filmId);
  const truth = truthMgr.readAll();
  const music = new EpidemicMusicService();
  const useFreesound = options.source === 'freesound' && !options.forceLocal;
  const useEpidemic = !useFreesound && music.available() && !options.forceLocal;

  console.log(`\n========================================`);
  console.log(`[vw music match] 配乐全链匹配: 影片=${filmId}`);
  console.log(`  - 改编路径: ${useFreesound ? 'Freesound CC0 配乐（按 brief 检索 → 剪辑钉高潮）' : useEpidemic ? 'Epidemic Adapt（真实接口）' : '本地 ABC 作曲引擎（离线自给）'}`);
  console.log(`========================================\n`);

  const hits = adapter.hits();
  const totalSec = adapter.timeline.totalSeconds;

  // 还没配置配乐段时，以全片为一段初始化（主高潮取第一个 P0 drop 拍点）
  if (truth.music.cues.length === 0) {
    const dropHit = hits.find((h) => h.want === 'drop') ?? hits[0];
    const secondHit = hits.find((h) => h !== dropHit && h.priority !== 'P2');
    truth.music.cues.push({
      id: 'c1',
      label: '正片主配乐',
      // 入点引用第一幕的 id（和 music plan 一致；SC.start 在适配器里解析不到）
      in: { ref: `SC.${adapter.timeline.scenes[0]?.id ?? 'start'}`, sec: 0 },
      out: { ref: 'SC.end', sec: totalSec },
      climax: dropHit ? { ref: dropHit.id, sec: dropHit.sec } : undefined,
      climax2: secondHit ? { ref: secondHit.id, sec: secondHit.sec } : undefined,
      brief: '按影片简报检索；主高潮钉在 P0 拍点',
      startFromSec: 0,
      volume: DEFAULT_MUSIC_VOLUME,
      fadeInSec: 1.0,
      fadeOutSec: 2.0,
    });
  }

  const results: MatchMusicResult[] = [];

  for (const cue of truth.music.cues) {
    const cueDur = cue.out.sec - cue.in.sec;
    const dropInCue = cue.climax ? cue.climax.sec - cue.in.sec : cueDur * 0.4;

    console.log(`[配乐段 ${cue.id}] "${cue.label}" (${cue.in.sec}s → ${cue.out.sec}s, ${cueDur.toFixed(2)}s)`);

    // ── Step 1：网格选曲可行性（bpmfit 在 60–180 逐档算代价，前 3 名各扩 ±1.5%）
    const scan = scanBpmGrid(hits, cue.climax?.sec ?? cue.in.sec + dropInCue, options.bpmRange ? { minBpm: options.bpmRange[0], maxBpm: options.bpmRange[1] } : undefined);
    const best = scan.bestCandidates[0];
    console.log(
      `  ✓ Step 1 网格拟合: 最优 BPM ${best.bpm}（代价 ${best.gridCostFrames} 帧，` +
        `推荐窗口 ${best.window[0]}–${best.window[1]}）`
    );

    // ── Step 2：改编或作曲
    let source: MatchMusicResult['source'] = 'existing';
    let fileRel = cue.track?.file;
    let actualDropSec: number | undefined;
    let errBeats: number | undefined;
    let editId: string | undefined;

    if (useEpidemic) {
      const trackId = cue.track?.id;
      if (!trackId) {
        console.warn(`  ! 段 ${cue.id} 还没选曲（music.json 里没有 track.id），跳过改编。`);
        console.warn(`    先用 'vw music search ${filmId} ${cue.id}' 选一首，再跑 match。`);
      } else {
        const res = music.adapt(
          {
            trackId,
            targetDurationSec: cueDur,
            dropAtSec: cue.climax ? dropInCue : null,
          },
          filmId,
          cue.id
        );
        if (res.ok && res.file) {
          source = 'epidemic-adapt';
          fileRel = res.file;
          actualDropSec = res.actualDropSec;
          errBeats = res.errBeats;
          editId = res.editId;
          console.log(
            `  ✓ Step 2 Adapt 闭环: ${res.rounds} 轮收敛，drop 落点 ${res.actualDropSec?.toFixed(3)}s，` +
              `误差 ${res.errBeats} 拍（配方 ${res.recipe}）`
          );
        } else {
          console.warn(`  ✗ Step 2 Adapt 失败: ${res.error}`);
        }
      }
    }

    let trackMeta: { id: string; title: string; artist: string; source?: 'freesound' | 'local-sampled'; license?: string; url?: string } | undefined;
    if (useFreesound) {
      const brief = (options.brief ?? '').trim() || (cue.brief.startsWith('按影片简报') ? '' : cue.brief.trim());
      if (!brief) {
        console.warn(`  ! 段 ${cue.id} 没有配乐描述：加 --brief="minimal piano, calm"（英文关键词，写进段的 brief）。这一段退回本地作曲。`);
      } else {
        cue.brief = brief;
        const { searchFreesoundMusic, pickFreesoundMusic } = await import('../epidemic/cc0-music.js');
        const cands = searchFreesoundMusic(brief, cueDur, best.window, { dropAtSec: dropInCue });
        console.log(`  ✓ Step 2 Freesound 检索「${brief}」: 分析了 ${cands.length} 首（时长 ≥ ${(cueDur + 2).toFixed(0)}s、CC0、像音乐）`);
        cands.slice(0, 5).forEach((c, i) => console.log(`      ${i + 1}. ${c.musicScore?.toFixed(3)}  ${c.title}  ${c.durationSec.toFixed(0)}s  · ${c.notes?.join(' · ')}`));
        const pick = pickFreesoundMusic(cands, filmId, cue.id, cueDur, dropInCue);
        if (pick) {
          source = 'freesound';
          fileRel = pick.fileRel;
          actualDropSec = pick.cut.actualDropSec;
          trackMeta = { id: pick.cand.id, title: pick.cand.title, artist: pick.cand.author ?? '', source: 'freesound', license: pick.cand.license, url: pick.cand.url };
          console.log(
            `  ✓ 选用「${pick.cand.title}」→ ${pick.fileRel}：${pick.cut.kind}${pick.cut.bars ? ` ${pick.cut.bars} 小节` : ''}，` +
              `高潮实测 ${pick.cut.actualDropSec?.toFixed(2)}s（目标 ${dropInCue.toFixed(2)}s${pick.cut.verified ? '，误差在一小节内' : `，${pick.cut.reason}`}）`
          );
          pick.tried.forEach((t) => console.log(`    - 没选：${t}`));
        } else {
          console.warn(`  ✗ Freesound 候选都剪不出合格的配乐，这一段退回本地作曲`);
          fileRel = undefined;
        }
      }
      if (source !== 'freesound') fileRel = undefined;
    }

    // 本地路径：没有凭据或改编失败时，用本仓库的 ABC 作曲引擎按段长与高潮生成
    // 指定了采样配器就重新作曲（段上已有的文件是上一版的，不能沿用）
    const resample = Boolean(options.orchestra) && source !== 'freesound' && source !== 'epidemic-adapt';
    if (resample || !fileRel || !fs.existsSync(path.join(process.cwd(), 'public', fileRel))) {
      const target = `music/${filmId}-${cue.id}.wav`;
      const abs = path.join(process.cwd(), 'public', target);
      console.log(`  → 走本地 ABC 作曲引擎生成 ${target}（bpm ${best.bpm}）`);
      // 段长、速度、高潮都要传进去：不传时引擎退回写死的旧谱（anlan-report 就是这样只响了 23 秒）
      const composed = await generateFilmScoreWav(filmId, {
        outputPath: abs,
        totalSec: cueDur,
        bpm: best.bpm,
        dropSec: cue.climax ? dropInCue : cueDur * 0.7,
        orchestra: options.orchestra,
        // 第二高潮直接写进谱里（之前静默半小节、到它再起），不再靠事后剪接
        climax2Sec: cue.climax2 ? cue.climax2.sec - cue.in.sec : undefined,
      });
      source = 'local-compose';
      if (options.orchestra) {
        // 采样演奏：署名行进 track.license（vw review 的许可证核对读它）
        trackMeta = {
          id: `${filmId}-${cue.id}-${options.orchestra}`,
          title: `本地作曲 · 真实乐器采样（${options.orchestra}）`,
          artist: 'Local Composer + lemo-opuscar sampler',
          source: 'local-sampled',
          license: (composed.credits ?? []).join(' / '),
          url: 'https://github.com/lemomo-ai/lemo-opuscar',
        };
      }
      fileRel = target;
    }

    // ── Step 3：真实分析（落盘 analysis.json）
    const grid: BeatGrid = analyzeCue(filmId, cue.id, fileRel, best.bpm, cueDur);
    console.log(
      `  ✓ Step 3 分析(${grid.source}): bpm ${grid.bpm}` +
        (grid.periodR !== undefined ? `，自相关 r=${grid.periodR}` : '') +
        `，drop ${grid.dropSec}s，小节头 ${grid.downbeats.length} 个` +
        (grid.sections ? `，段落 ${grid.sections.length} 段` : '')
    );
    if (grid.source === 'synthetic') {
      console.warn(`  ⚠ 没有可解码的音频，网格是合成的 —— 报告只能当可行性预估看。`);
    }

    // ── Step 4：第二高潮偏差超过半秒时，做整小节乐句重排
    let surgeryApplied = cue.track?.surgeryApplied ?? false;
    if (cue.climax2 && grid.source === 'measured' && source !== 'local-compose') {
      const target2 = cue.climax2.sec - cue.in.sec;
      const res = runSurgery(fileRel, target2, { nominalBpm: grid.bpm });
      if (res.ok && res.file) {
        fileRel = res.file;
        surgeryApplied = true;
        console.log(
          `  ✓ Step 4 乐句重排: 刀口第 ${res.recipe?.cutBarIndex} 小节 (${res.recipe?.cutSec}s)，` +
            `${res.recipe?.barsDelta} 小节，接缝代价 ${res.recipe?.seamCost}（分位 ${res.seamPercentile}）` +
            `；验证 drop 误差 ${res.dropErrBeats} 拍 / 第二高潮 ${res.secondErrBeats} 拍`
        );
      } else {
        console.log(`  - Step 4 乐句重排: 未应用（${res.reason}）`);
      }
    }

    const keyRes = estimateKeyOfFile(path.join(process.cwd(), 'public', fileRel));

    // 沿用 / Epidemic 改编时保留段上的曲目信息（Epidemic 的 id 是先选好的那首）；换成本地作曲或 Freesound 时不能沿用上一首的 id / 名字 / 许可证
    const prev = source === 'existing' || source === 'epidemic-adapt' ? cue.track : undefined;
    cue.track = {
      id: trackMeta?.id ?? prev?.id ?? `${filmId}-${cue.id}`,
      title: trackMeta?.title ?? prev?.title ?? (source === 'local-compose' ? '本地合成配乐' : cue.label),
      artist: trackMeta?.artist ?? prev?.artist ?? (source === 'local-compose' ? 'Local ABC Composer' : ''),
      ...(trackMeta?.source ? { source: trackMeta.source, license: trackMeta.license, url: trackMeta.url } : prev?.source ? { source: prev.source, license: prev.license, url: prev.url } : {}),
      bpm: grid.bpm,
      key: keyRes?.camelot ?? cue.track?.key,
      file: fileRel,
      durationSec: grid.totalSec,
      adapted: source === 'epidemic-adapt',
      editId,
      surgeryApplied,
    };

    results.push({
      cueId: cue.id,
      trackId: cue.track.id,
      bpm: grid.bpm,
      gridCostFrames: best.gridCostFrames,
      source,
      adapted: source === 'epidemic-adapt',
      actualDropSec,
      errBeats,
    });
  }

  truthMgr.write('music', truth.music);

  // ── 对拍求解：真实网格 + 真实弹性区，报告如实写
  const gridCache = new Map<string, BeatGrid>();
  const getGrid = (cue: MusicCue): BeatGrid => {
    const hit = gridCache.get(cue.id);
    if (hit) return hit;
    const g = analyzeCue(filmId, cue.id, cue.track?.file, cue.track?.bpm ?? 120, cue.out.sec - cue.in.sec);
    gridCache.set(cue.id, g);
    return g;
  };

  const report = solveCues(truth.music.cues, hits, getGrid, adapter.zones(), 30);

  const anchors: SyncAnchor[] = report.anchors.map((a) => ({
    hit: a.hitId,
    cueId: findCueId(truth.music.cues, a.filmSec),
    targetSec: a.filmSec,
    musicSec: a.musicSec,
    musicKind: a.matchedKind,
    errMs: Math.round(a.residualSec * 1000),
    priority: a.priority,
    status: a.downgraded ? 'downgraded' : 'locked',
    note: hits.find((h) => h.id === a.hitId)?.note,
  }));

  for (const d of report.droppedHits) {
    const h = hits.find((x) => x.id === d.hitId);
    anchors.push({
      hit: d.hitId,
      cueId: h ? findCueId(truth.music.cues, h.sec) : 'c1',
      targetSec: h?.sec ?? 0,
      musicSec: h?.sec ?? 0,
      musicKind: 'beat',
      errMs: 0,
      priority: (d.priority as SyncAnchor['priority']) ?? 'P1',
      status: 'dropped',
      note: d.reason,
    });
  }

  truth.sync = {
    knots: report.knots.map((k) => [k.inner, k.outer] as [number, number]),
    anchors,
    report: {
      scoreSync: report.scoreSync,
      lockedCount: report.anchors.filter((a) => !a.downgraded).length,
      downgradedCount: report.downgradedCount,
      droppedCount: report.droppedCount,
    },
  };
  truthMgr.write('sync', truth.sync);

  console.log(`\n[vw music match] 对拍求解完成（网格来源 ${report.gridSource}）`);
  console.log(`  - scoreSync: ${report.scoreSync}`);
  console.log(`  - 锚定 ${report.matchedCount} / 降级 ${report.downgradedCount} / 放弃 ${report.droppedCount}`);
  if (report.zoneReport) {
    console.log(`  - 弹性用量: 最大比率 ${(report.zoneReport.maxRatio * 100).toFixed(2)}%，总位移 ${report.zoneReport.totalDeltaSec}s`);
  }
  for (const d of report.droppedHits) {
    console.log(`  ⚠ 放弃 [${d.priority}] ${d.hitId}: ${d.reason}`);
  }
  console.log(`  ✓ music.json 与 sync.json 已写回真值\n`);

  return results;
}

function findCueId(cues: MusicCue[], sec: number): string {
  for (const c of cues) {
    if (sec >= c.in.sec && sec <= c.out.sec) return c.id;
  }
  return cues[0]?.id ?? 'c1';
}
