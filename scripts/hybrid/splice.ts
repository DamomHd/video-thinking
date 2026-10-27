import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getFilm } from '../../src/films.js';
import { buildTimeWarp, IDENTITY_WARP } from '../../src/shared/timewarp.js';
import { seamVerdict } from '../../src/shared/splice.js';
import { TruthManager } from '../spot/truth.js';
import { sanitizeLabel } from '../render/archive.js';

/**
 * 代码动画 × AI 视频的接缝工具（vw handoff / vw insert / vw seam）
 *
 *   1. vw handoff <片> --at=<放映秒>         导出那一帧 PNG → 喂给视频模型当首帧（图生视频）
 *   2. （在可灵 / Runway / Seedance 里生成片段）
 *   3. vw insert add <片> --clip=<mp4>       规整成 h264 / yuv420p / 1920×1080 / 去音轨 → public/inserts/<片>/<标签>.mp4
 *   4. vw seam <片> --clip=… --at=… [--return=…]   比对接缝：原画面那一帧 vs 片段首帧（和尾帧 vs 回到代码动画那一帧）
 *   5. 在幕里放 <VideoInsert src=… at=… durSec=… />（handoff / insert 会把放映秒换算成「第几幕第几秒」直接给出写法）
 *
 * 命令行里的时间一律是**放映秒**（成片里的秒数，播放器上看到的）；组件里的 at 是幕内乐谱秒，工具负责换算。
 */

const FPS = 30; // 母片合成 <片> 的帧率：交接帧从母片取

/** 放映秒 → 所在幕与幕内乐谱秒 */
export async function locateFilmSec(film: string, filmSec: number): Promise<{ sceneId: string; localScoreSec: number; scoreSec: number }> {
  const adapter = await getFilm(film).getAdapter();
  const sync = new TruthManager(film).readAll().sync;
  const warp = sync ? buildTimeWarp(sync) : IDENTITY_WARP;
  const scoreSec = warp.IS_IDENTITY ? filmSec : warp.toScore(filmSec);
  const scenes = adapter.timeline.scenes;
  const scene = [...scenes].reverse().find((s) => scoreSec >= s.start) ?? scenes[0];
  return { sceneId: scene.id, localScoreSec: Math.round((scoreSec - scene.start) * 1000) / 1000, scoreSec };
}

function stillFromFilm(film: string, filmSec: number, out: string): string {
  const frame = Math.max(0, Math.round(filmSec * FPS));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execSync(`npx remotion still src/Root.tsx ${film} "${out}" --frame=${frame} --gl=angle --log=error`, { stdio: 'inherit' });
  return out;
}

function grabClipFrame(clip: string, which: 'first' | 'last', out: string): string {
  const args = which === 'first' ? ['-i', clip, '-frames:v', '1'] : ['-sseof', '-0.2', '-i', clip, '-update', '1'];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, out]);
  return out;
}

/** 两张图的 SSIM（都缩到 1920×1080 比）与平均亮度差（b − a） */
export function compareFrames(a: string, b: string): { ssim: number; lumaDelta: number } {
  // ssim 结果打在 stderr，用 sh 收
  const text = execSync(
    `ffmpeg -v info -i "${a}" -i "${b}" -lavfi "[0]scale=1920:1080,format=yuv420p[x];[1]scale=1920:1080,format=yuv420p[y];[x][y]ssim" -f null - 2>&1`
  ).toString();
  const ssim = Number(text.match(/All:([\d.]+)/)?.[1] ?? 0);
  const luma = (f: string) => {
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'scale=1:1:flags=area,format=gray', '-f', 'rawvideo', '-']);
    return buf[0];
  };
  return { ssim, lumaDelta: luma(b) - luma(a) };
}

export async function handoff(film: string, filmSec: number, label?: string) {
  const root = process.cwd();
  const name = sanitizeLabel(label ?? `t${filmSec.toFixed(2).replace('.', '_')}`);
  const out = path.join(root, 'out', film, 'handoff', `${name}.png`);
  stillFromFilm(film, filmSec, out);
  const loc = await locateFilmSec(film, filmSec);
  return { out, ...loc };
}

export function insertAdd(film: string, clip: string, label?: string) {
  const root = process.cwd();
  if (!fs.existsSync(clip)) throw new Error(`[vw insert] 找不到片段 ${clip}`);
  const name = sanitizeLabel(label ?? path.basename(clip).replace(/\.[^.]+$/, ''));
  const rel = path.join('inserts', film, `${name}.mp4`);
  const dst = path.join(root, 'public', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  // 规整：铺满 1920×1080（居中裁切）、恒定帧率、h264 + yuv420p、去音轨（声音走平台的 FilmAudio）
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', clip,
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1',
    '-fps_mode', 'cfr', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-an',
    '-movflags', '+faststart', dst,
  ]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]).toString().trim());
  return { src: rel, durSec: Math.round(dur * 1000) / 1000 };
}

export async function seam(film: string, clip: string, atSec: number, returnSec?: number) {
  const root = process.cwd();
  const dir = path.join(root, 'out', film, 'seam');
  fs.mkdirSync(dir, { recursive: true });
  // 进：片段第一帧要接住「片段出现前的最后一帧」
  const before = stillFromFilm(film, Math.max(0, atSec - 1 / FPS), path.join(dir, 'in-film.png'));
  const first = grabClipFrame(clip, 'first', path.join(dir, 'in-clip.png'));
  const inCmp = compareFrames(before, first);
  const result: { in: ReturnType<typeof seamVerdict> & { ssim: number; lumaDelta: number }; out?: ReturnType<typeof seamVerdict> & { ssim: number; lumaDelta: number } } = {
    in: { ...inCmp, ...seamVerdict(inCmp.ssim, inCmp.lumaDelta) },
  };
  if (returnSec !== undefined) {
    const last = grabClipFrame(clip, 'last', path.join(dir, 'out-clip.png'));
    const after = stillFromFilm(film, returnSec, path.join(dir, 'out-film.png'));
    const outCmp = compareFrames(last, after);
    result.out = { ...outCmp, ...seamVerdict(outCmp.ssim, outCmp.lumaDelta) };
  }
  return result;
}
