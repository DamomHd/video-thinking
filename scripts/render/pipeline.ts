import { execSync, execFileSync } from 'node:child_process';
import { hwProfile } from '../hw/profile.js';

/** 成片响度起伏上限（LU），参考片实测 5–7 */
export const MAX_LRA = 8;
import fs from 'node:fs';
import path from 'node:path';
import { measureLoudness, measureAvSync, grabFrames } from './verify.js';
import { scanFlicker, scoreToFilmFor } from '../guard/scan-flicker.js';
import { checkMotion, formatMotionSummary } from '../guard/motion-guard.js';
import { getFilm } from '../../src/films.js';

export interface RenderOptions {
  filmId: string;
  mode: 'master' | 'final';
  concurrency?: number;
  crf?: number;
  /**
   * 母片按乐谱时间渲（对标附录 B 的 REMOTION_NO_WARP）。
   * 工作台播放时自己按 toScore 驱动画面、用 playbackRate 模拟变速，
   * 这样改对拍参数不用重渲母片。只对 master 模式有意义。
   */
  noWarp?: boolean;
  /**
   * 衍生片（预告片 / 短片）。给了就渲 <片>-<variant> 系列合成，
   * 并按 §9.6 在封装时加 alimiter 兜住峰值 —— 衍生片的混音写死在代码里，
   * 没有工作台的 mix 总线管音量，所以靠限幅收尾。
   */
  variant?: 'trailer' | 'short';
  /** 成片之外再出一份 20Mbps 的播放副本（§9.7 的 --play） */
  play?: boolean;
}

/** §9.6：衍生片的限幅参数（level=false 不抬电平，latency=true 补偿前瞻延迟） */
const VARIANT_LIMIT: Record<string, number> = { trailer: 0.87, short: 0.82 };

/**
 * LoomCare 三段式出片流水线
 * 1. 静音 4K 超采样画面渲染（CPU 栅格化 Chrome + flags=area 面积滤波缩回 1080p）
 * 2. 独立纯音频合成渲染（不碰 WebGL，几十秒出 WAV）
 * 3. FFmpeg 封装（零时差、AAC 256k、faststart）+ 自动化验收
 */
export async function runRenderPipeline(options: RenderOptions): Promise<string> {
  // 并发和超采样的缺省值按硬件档位取（scripts/hw/profile.ts）；显式参数 / 环境变量优先
  const hw = hwProfile();
  const { filmId, mode, concurrency = hw.render.concurrency, crf = 16 } = options;
  console.log(`[vw render] 硬件档位 ${hw.info.tier}：并发 ${concurrency}，成片超采样缺省 ${hw.render.ssaa}×（vw hw 查看）`);
  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, 'out', filmId);
  fs.mkdirSync(outDir, { recursive: true });

  const { variant } = options;
  const base = variant ? `${filmId}-${variant}` : filmId;
  const tag = variant ? `${variant}-` : '';

  const isFinal = mode === 'final';
  const compositionId = isFinal ? `${base}-60` : base;
  const audioCompId = `${base}-Audio`;

  const videoOut = path.join(outDir, isFinal ? `${tag}video-60-muted.mp4` : `${tag}master-mute.mp4`);
  const audioOut = path.join(outDir, `${tag}audio.wav`);
  const finalOut = path.join(outDir, isFinal ? `${tag}final-60.mp4` : `${tag}preview.mp4`);

  // CPU 栅格化的 Chrome 包装脚本（§9.5）。scripts/loomcare/ 下那份是历史副本，内容相同。
  const chromeWrapper = path.join(projectRoot, 'scripts/render/chrome-cpu-raster.sh');

  console.log(`\n========================================`);
  console.log(
    `[vw render] 启动出片流水线: 影片=${filmId}${variant ? ` · ${variant}` : ''}, 模式=${mode}`
  );
  console.log(`========================================\n`);

  // --- 第 1 段：静音画面渲染 ---
  console.log(`[第 1 段/共 3 段] 渲染画面 (合成: ${compositionId}) -> ${videoOut}`);

  // §9.4 三个开关必须由同一个倍数驱动，否则会出现「按 1080p 截帧又被钩子缩一半」这种错配：
  //   ① VW_SSAA  → remotion.config.ts 的 overrideFfmpegCommand（编码前按面积滤波缩回去）
  //   ② --scale=K → Remotion 按 K 倍截帧
  //   ③ --props '{"ssaa":K}' → 组件把画布也按 K 倍处理
  const ssaa = isFinal ? Math.max(1, Number(process.env.VW_SSAA_SCALE ?? hw.render.ssaa)) : 1;
  const videoEnv = {
    ...process.env,
    // 只有真的按 K 倍截帧时才让钩子去缩；否则必须明确关掉
    VW_SSAA: ssaa > 1 ? String(ssaa) : '1',
    LOOMCARE_SSAA: ssaa > 1 ? String(ssaa) : '1',
  };


  const videoArgs = [
    'remotion', 'render',
    'src/Root.tsx',
    compositionId,
    videoOut,
    '--muted',
    '--gl=angle',
    `--concurrency=${concurrency}`,
    `--crf=${crf}`,
  ];

  const renderProps: Record<string, unknown> = {};
  if (ssaa > 1) renderProps.ssaa = ssaa;
  if (!isFinal && options.noWarp) {
    renderProps.noWarp = true;
    console.log(`  (母片按乐谱时间渲：不做时间映射，工作台播放时再模拟变速)`);
  }

  if (Object.keys(renderProps).length > 0) {
    const propsFile = path.join(outDir, `${tag}render-props.json`);
    fs.writeFileSync(propsFile, JSON.stringify(renderProps), 'utf-8');
    videoArgs.push(`--props=${propsFile}`);
    if (ssaa > 1) {
      videoArgs.push(`--scale=${ssaa}`);
      console.log(`  (超采样 ${ssaa}×：--scale=${ssaa} + props ssaa=${ssaa} + 编码前 scale=iw/${ssaa}:ih/${ssaa}:flags=area)`);
    }
  }
  if (ssaa <= 1) {
    console.log(`  (未启用超采样；VW_SSAA_SCALE=2 可开 4K 超采样)`);
  }

  // §9.5 CPU 栅格化的 Chrome：只有「透视 3D 层里有 SVG 描边」的片才需要
  // （GPU 栅格化下那些描边会隔几帧被画成一半宽，而且只在渲整幕时出现）。
  // 代价很大（页面元素全走 Skia 软件栅格化），所以按需开启而不是默认开启。
  const wantCpuRaster = process.env.VW_CPU_RASTER === '1';
  if (isFinal && wantCpuRaster) {
    if (fs.existsSync(chromeWrapper)) {
      videoArgs.push(`--browser-executable=${chromeWrapper}`);
      console.log(`  (已启用 CPU 栅格化的 Chrome：${path.basename(chromeWrapper)})`);
    } else {
      console.warn(`  ⚠ VW_CPU_RASTER=1 但找不到包装脚本 ${chromeWrapper}，本次走 GPU 栅格化`);
    }
  }

  execSync(`npx ${videoArgs.join(' ')}`, { stdio: 'inherit', env: videoEnv });

  // 母片模式到此结束：顺手导出工作台投影（§9.1「母片渲完自动 export」）
  if (!isFinal) {
    console.log(`\n[vw render] 母片渲染完成: ${videoOut}`);
    // 衍生片（预告片 / 短片）不接平台，没有真值也没有工作台，不导出
    if (!variant) {
      const { exportFilmState } = await import('../../tools/studio/state.js');
      const state = await exportFilmState(filmId);
      console.log(`[vw render] 工作台投影已更新: out/${filmId}/state.json（母片 ${state.videoUrl || '未识别'}）`);
    }
    return videoOut;
  }

  // --- 第 2 段：无 WebGL 独立音轨渲染 ---
  console.log(`\n[第 2 段/共 3 段] 独立音轨渲染 (合成: ${audioCompId}) -> ${audioOut}`);
  const audioArgs = [
    'remotion', 'render',
    'src/Root.tsx',
    audioCompId,
    audioOut,
    '--codec=wav',
    '--public-dir=public',
  ];
  execSync(`npx ${audioArgs.join(' ')}`, { stdio: 'inherit' });

  // --- 第 3 段：FFmpeg 封装与消除 AAC 42.7ms 偏移 ---
  console.log(`\n[第 3 段/共 3 段] FFmpeg 零偏移封装 -> ${finalOut}`);
  const limit = variant ? VARIANT_LIMIT[variant] : undefined;
  if (limit) {
    console.log(`  (衍生片限幅 alimiter limit=${limit}:level=false:latency=true)`);
  }
  // 响度母带（−14 LUFS / −1.2 dBTP，两遍 loudnorm、线性增益）：衍生片有自己的限幅，不走这一步；VW_NO_MASTER=1 关掉
  let muxAudio = audioOut;
  if (!limit && process.env.VW_NO_MASTER !== '1') {
    const { masterLoudness } = await import('./master.js');
    const mastered = audioOut.replace(/\.wav$/, '-master.wav');
    const r = masterLoudness(audioOut, mastered);
    if (r.skipped) console.warn(`  ⚠ ${r.skipped}`);
    else console.log(`  (响度母带 ${r.before.toFixed(1)} → ${r.after?.toFixed(1)} LUFS：增益 ${r.gainDb.toFixed(1)} dB，限幅只削瞬态，真峰 ${r.truePeak?.toFixed(1)} dBFS)`);
    muxAudio = mastered;
  }
  const ffmpegCmd = [
    'ffmpeg', '-y',
    '-i', `"${videoOut}"`,
    '-i', `"${muxAudio}"`,
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'copy',
    ...(limit ? ['-af', `alimiter=limit=${limit}:level=false:latency=true`] : []),
    '-c:a', 'aac',
    '-b:a', '256k',
    '-movflags', '+faststart',
    `"${finalOut}"`,
  ].join(' ');

  execSync(ffmpegCmd, { stdio: 'inherit' });

  // --- 验收：响度 · 同步 · 抽帧 · 闪帧 (§9.2) ---
  console.log(`\n[vw verify] 出片验收`);

  const loud = measureLoudness(finalOut);
  console.log(
    `  · 响度: 整合 ${fmtNum(loud.integratedLufs)} LUFS（目标 −14）` +
      `，真峰 ${fmtNum(loud.truePeakDb)} dBFS，LRA ${fmtNum(loud.lra)} LU`
  );
  // 响度起伏：参考片（loomcare / 迁移汇报）LRA 5–7。超过 8 通常是配乐托底太薄、音效过冲 ——
  // 听感是「音效一下一下很冲，中间发空」。只报不拦：有的片就是要大起伏
  if (typeof loud.lra === 'number' && loud.lra > MAX_LRA) {
    console.warn(
      `  ⚠ LRA ${fmtNum(loud.lra)} LU 超过 ${MAX_LRA}（参考片 5–7）：配乐托底偏薄或音效过冲。` +
        `\n    先看 vw check 的配乐覆盖率，再在工作台把 MUSIC 推子抬起、IMPACT / TEX 压下`
    );
  }

  const sync = measureAvSync(finalOut, muxAudio);
  if (limit) {
    console.log(`  （限幅会压掉峰，互相关相关系数会略低于正片，只要时差仍为 0 就对）`);
  }
  if (sync.offsetMs === null) {
    console.warn(`  · 同步: 跳过（${sync.note}）`);
  } else {
    const ok = Math.abs(sync.offsetMs) <= 1;
    console.log(
      `  ${ok ? '·' : '⚠'} 同步: 成片 AAC 相对混音 WAV ${sync.offsetMs} ms（相关 ${sync.correlation}）` +
        `${ok ? '，零偏移 ✓' : ' —— 期望 0ms，三段式封装可能没生效'}`
    );
  }

  // 频段平衡（低频相对中频，建议约 −3 dB）
  {
    const { measureBands, bandVerdict } = await import('./verify.js');
    const v = bandVerdict(measureBands(finalOut).lowRelDb);
    console.log(`  ${v.ok ? '·' : '⚠'} 频段: ${v.text}`);
  }

  try {
    const adapter = await (await getFilm(filmId)).getAdapter();
    const marks = adapter.hits().map((h) => h.sec).filter((s) => s > 0.2);
    const shots = grabFrames(finalOut, marks.slice(0, 6), path.join(outDir, 'verify-frames'));
    console.log(`  · 抽帧: 关键时刻 ${shots.length} 张 → ${path.join(outDir, 'verify-frames')}`);

    const flicker = scanFlicker(finalOut, adapter.timeline, {
      fps: 30,
      // 成片按放映时间渲，幕边界要经 sync.json 映射
      toFilm: scoreToFilmFor(adapter.filmId),
    });
    if (!flicker.ran) {
      console.warn(`  · 闪帧: 跳过（${flicker.reason}）`);
    } else if (flicker.unexpected.length === 0) {
      console.log(`  · 闪帧: ${flicker.frames} 帧扫描完毕，${flicker.hits.length} 处硬切全部落在幕表转场上 ✓`);
    } else {
      console.warn(`  ⚠ 闪帧: ${flicker.unexpected.length} 处意外硬切:`);
      flicker.unexpected.slice(0, 10).forEach((h) =>
        console.warn(`      ${h.sec}s 差值 ${h.maxDelta}`)
      );
    }

    /**
     * 运动连续性：闪帧只查「坏没坏」，这一道查「顺不顺」。
     * 不通过不阻断出片 —— 片子是能用的，只是动效偏硬，要不要改由人决定。
     */
    const motion = checkMotion(finalOut);
    console.log(`  · 运动: ${formatMotionSummary(motion)}`);
    if (!motion.ok) {
      console.warn(`  ⚠ 运动连续性未达标:`);
      motion.errors.forEach((e) =>
        e.split('\n').forEach((line, i) => console.warn(i === 0 ? `      ${line}` : `      ${line.trim()}`))
      );
    }
  } catch (e: any) {
    console.warn(`  · 抽帧 / 闪帧验收跳过: ${e.message}`);
  }
  // 口播（可选层）：混音之后每句还听得清吗
  if (!variant && fs.existsSync(path.join(process.cwd(), 'src', 'films', filmId, 'audio', 'voice.json'))) {
    try {
      const { voiceFinalCheck } = await import('../py/voice-film.js');
      const r = voiceFinalCheck(filmId, finalOut);
      if (r) console.log(r.ok ? '  · 口播: 成片里每句都听得清（混音后逐句核对）' : `  ⚠ 口播: 混音后这几句读不清：${r.failed.join('、')}`);
    } catch (e: any) {
      console.warn(`  · 口播: 核对没跑成（${e?.message ?? e}）`);
    }
  }

  // 海报图：片尾主高潮（P0 拍点）那一刻的画面；没有 P0 就取片长 60% 处（放映时间）
  if (!variant) {
    try {
      const adapter = await (await getFilm(filmId)).getAdapter();
      const p0 = adapter.hits().find((h) => h.priority === 'P0');
      const toFilm = scoreToFilmFor(adapter.filmId);
      const at = p0 ? toFilm(p0.sec) + 0.3 : toFilm(adapter.timeline.totalSeconds) * 0.6;
      execSync(`ffmpeg -nostdin -v error -y -ss ${at.toFixed(3)} -i "${finalOut}" -frames:v 1 -q:v 2 "${path.join(outDir, 'poster.jpg')}"`);
      console.log(`  · 海报图 → ${path.relative(process.cwd(), path.join(outDir, 'poster.jpg'))}（${at.toFixed(1)}s）`);
    } catch (e: any) {
      console.warn(`  · 海报图没出成（${e?.message ?? e}）`);
    }
  }

  // 交付清单：第三方素材的来源和授权
  if (!variant) {
    const { buildCredits } = await import('./credits.js');
    const c = buildCredits(filmId);
    console.log(`  · CREDITS → ${path.relative(process.cwd(), c.file)}${c.ccby.length ? `（有 ${c.ccby.length} 项 CC BY，交付时必须署名）` : ''}`);
  }


  console.log(`\n========================================`);
  console.log(`[vw render] 成片交付完成: ${finalOut}`);
  console.log(`========================================\n`);

  if (options.play) {
    const r = makePlayCopy(finalOut);
    console.log(
      r.ok
        ? r.skipped
          ? `[vw render] 播放副本: 跳过 —— ${r.reason}`
          : `[vw render] 播放副本: ${r.file}（${r.encoder}，平均 ${r.mbps} / 峰值 ${r.peakMbps} Mbps，原片峰值 ${r.sourcePeakMbps}）`
        : `[vw render] ⚠ 播放副本失败: ${r.reason}`
    );
  }

  return finalOut;
}

/**
 * 播放副本（§9.7 的 --play）。
 *
 * 成片是 crf 质量模式，码率跟着画面复杂度走 —— 粒子、点阵这类段落峰值能冲到近百 Mbps，
 * 普通播放器和投屏会卡。所以另出一份**峰值被压住**的副本专门给人看。
 *
 * 实测踩过的坑：h264_videotoolbox 在 Intel Mac 上不执行 -maxrate，
 * 一个峰值 13 Mbps 的输入出来反而是平均 19、峰值 32 —— 「限峰副本」比原片还胖。
 * 所以这里不信参数，信实测：
 *   · 源片每秒峰值本来就不超过上限 → 不出副本，直接说明
 *   · 先用硬件编码（快），实测峰值超过上限的 1.25 倍 → 退回能严格执行 VBV 的 libx264
 */
export const PLAY_CAP_MBPS = 20;

/** 每秒视频包大小之和的最大值，换算成 Mbps */
export function peakMbps(file: string): { peak: number; avg: number } {
  const lines = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time,size', '-of', 'csv=p=0', file,
  ])
    .toString()
    .trim()
    .split('\n');
  const perSec = new Map<number, number>();
  let total = 0;
  for (const l of lines) {
    const [t, sz] = l.split(',').map(Number);
    if (!Number.isFinite(t) || !Number.isFinite(sz)) continue;
    perSec.set(Math.floor(t), (perSec.get(Math.floor(t)) ?? 0) + sz);
    total += sz;
  }
  const secs = Math.max(1, perSec.size);
  return {
    peak: Math.round(((Math.max(0, ...perSec.values()) * 8) / 1e6) * 10) / 10,
    avg: Math.round(((total * 8) / secs / 1e6) * 10) / 10,
  };
}

export function makePlayCopy(
  finalOut: string,
  capMbps = PLAY_CAP_MBPS
): {
  ok: boolean;
  skipped?: boolean;
  file?: string;
  encoder?: string;
  mbps?: number;
  peakMbps?: number;
  sourcePeakMbps?: number;
  reason?: string;
} {
  const src = peakMbps(finalOut);
  if (src.peak <= capMbps) {
    return {
      ok: true,
      skipped: true,
      sourcePeakMbps: src.peak,
      reason: `成片每秒峰值 ${src.peak} Mbps，本来就不超过 ${capMbps}，不需要播放副本`,
    };
  }

  const out = finalOut.replace(/\.mp4$/, '-play.mp4');
  const cap = `${capMbps}M`;
  const attempts: [string, string[]][] = [
    ['h264_videotoolbox', ['-c:v', 'h264_videotoolbox', '-b:v', cap, '-maxrate', cap]],
    // VBV 缓冲取半秒的量：取一秒时关键帧会把单秒峰值顶到上限的 1.25 倍以上（实测 25.1 / 20）
    ['libx264', ['-c:v', 'libx264', '-preset', 'medium', '-b:v', cap, '-maxrate', cap, '-bufsize', `${capMbps / 2}M`]],
  ];

  let last: { encoder: string; peak: number; avg: number } | null = null;
  for (const [encoder, args] of attempts) {
    try {
      execFileSync(
        'ffmpeg',
        ['-y', '-v', 'error', '-i', finalOut, ...args, '-c:a', 'copy', '-movflags', '+faststart', out],
        { stdio: 'pipe' }
      );
    } catch {
      continue;
    }
    const m = peakMbps(out);
    last = { encoder, ...m };
    if (m.peak <= capMbps * 1.25) {
      return { ok: true, file: out, encoder, mbps: m.avg, peakMbps: m.peak, sourcePeakMbps: src.peak };
    }
  }

  return {
    ok: false,
    file: last ? out : undefined,
    encoder: last?.encoder,
    peakMbps: last?.peak,
    sourcePeakMbps: src.peak,
    reason: last
      ? `两种编码器都没把峰值压到 ${capMbps} 附近（最后一次 ${last.encoder} 峰值 ${last.peak} Mbps）`
      : '两种编码器都失败了',
  };
}

/** 验收报告里的数字：一位小数，测不出来时显示「—」 */
function fmtNum(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits);
}
