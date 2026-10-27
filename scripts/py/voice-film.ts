/**
 * 一部片的口播：vw voice film <片> [--engine=edge|kokoro]
 *
 * 口播是可选层：只有 src/films/<片>/audio/voice.json 存在的片子才有（要不要口播先问用户）。
 *   1. 逐句配音 → public/voice/<片>/<id>.wav（上游 tts_zh.py / tts.py；edge 有缓存，没改的句子不重新取）
 *   1b. 每句处理：高通 70Hz → 压缩（−24 dB 起、3:1）→ 统一到 −18 dB RMS、峰值不过 −1 dB（TTS 的峰均比很高，不压的话忽大忽小）
 *   2. 写回 voice.json 的 file / durSec
 *   3. Whisper 逐句核对 → checked；逐词时间戳存 out/<片>/voice/words.json
 *   4. 字幕：按对拍映射到放映时间 → out/<片>/subtitles.srt（每条至少 1.8s、不短于念完 + 0.6s）
 * 之后片子的 index.tsx 把 voice.json 放进真值（FilmTruth.voice），FilmAudio 就会播放并让配乐让位。
 */
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { VoiceFile, SyncFile } from '../../src/shared/types';
import { buildTimeWarp, IDENTITY_WARP } from '../../src/shared/timewarp';
import { voiceTtsLines, voiceSubtitles, voiceOverlaps, voiceGainDb, VOICE_RMS_TARGET } from '../../src/shared/voice';
import { voiceTts, voiceCheck, voiceSrt } from './opuscar';

export function voiceFilePath(filmId: string): string {
  return path.join(process.cwd(), 'src/films', filmId, 'audio/voice.json');
}

/** asr_check 的逐句结果：「OK   id | …」「DIFF id | …」 */
export function parseAsrReport(report: string): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const m of report.matchAll(/^(OK|DIFF)\s+(\S+)\s*\|/gm)) out[m[2]] = m[1] === 'OK';
  return out;
}

export async function voiceFilm(filmId: string, options: { engine?: 'edge' | 'kokoro' } = {}): Promise<{ voice: VoiceFile; failed: string[]; overlaps: [string, string][]; srt: string }> {
  const file = voiceFilePath(filmId);
  if (!fs.existsSync(file)) {
    throw new Error(`${filmId} 没有口播表（${path.relative(process.cwd(), file)}）。口播是可选层：先和用户确认要口播，再写这张表（{ engine, voice?, lines: [{ id, text, sec }] }）`);
  }
  const voice = JSON.parse(fs.readFileSync(file, 'utf-8')) as VoiceFile;
  if (options.engine) voice.engine = options.engine;
  const work = path.join(process.cwd(), 'out', filmId, 'voice');
  const pubRel = path.join('voice', filmId);
  const pub = path.join(process.cwd(), 'public', pubRel);
  fs.mkdirSync(work, { recursive: true });
  fs.mkdirSync(pub, { recursive: true });
  const linesJson = path.join(work, 'lines.json');
  fs.writeFileSync(linesJson, JSON.stringify(voiceTtsLines(voice), null, 1));

  voiceTts(linesJson, pub, voice.engine);
  for (const l of voice.lines) {
    const wav = path.join(pub, `${l.id}.wav`);
    if (fs.existsSync(wav)) processVoiceLine(wav);
  }
  const durs = readDurations(path.join(pub, 'dur.json'));
  const check = voiceCheck(linesJson, pub, /[一-鿿]/.test(voice.lines.map((l) => l.text).join('')) ? 'zh' : 'auto');
  const ok = parseAsrReport(check.report);
  // 配音脚本把 dur.json / words.json 写在输出目录：挪到 out/（public/ 会整份打进渲染包）
  for (const f of ['dur.json', 'words.json']) {
    const p = path.join(pub, f);
    if (fs.existsSync(p)) fs.renameSync(p, path.join(work, f));
  }
  fs.rmSync(path.join(pub, '.cache'), { recursive: true, force: true });

  for (const l of voice.lines) {
    if (durs[l.id] === undefined) continue;
    l.file = `${pubRel}/${l.id}.wav`;
    l.durSec = Math.round(durs[l.id] * 1000) / 1000;
    l.checked = ok[l.id] ?? false;
  }
  fs.writeFileSync(file, JSON.stringify(voice, null, 1) + '\n');

  const syncFile = path.join(path.dirname(file), 'sync.json');
  const warp = fs.existsSync(syncFile) ? buildTimeWarp(JSON.parse(fs.readFileSync(syncFile, 'utf-8')) as SyncFile) : IDENTITY_WARP;
  const cues = voiceSubtitles(voice, (s) => (warp.IS_IDENTITY ? s : warp.toFilm(s)));
  const cuesJson = path.join(work, 'subtitles.json');
  fs.writeFileSync(cuesJson, JSON.stringify(cues, null, 1));
  const srt = path.join(process.cwd(), 'out', filmId, 'subtitles.srt');
  voiceSrt(cuesJson, srt);
  return { voice, failed: voice.lines.filter((l) => !l.checked).map((l) => l.id), overlaps: voiceOverlaps(voice.lines), srt };
}

/** 一个音频文件（或其中一段）的平均电平 dBFS（ffmpeg volumedetect，结果在 stderr） */
export function meanVolumeDb(file: string, fromSec?: number, durSec?: number): number {
  const args = ['-nostdin', '-hide_banner'];
  if (fromSec !== undefined) args.push('-ss', String(Math.max(0, fromSec)));
  if (durSec !== undefined) args.push('-t', String(durSec));
  args.push('-i', file, '-af', 'volumedetect', '-f', 'null', '-');
  const r = spawnSync('ffmpeg', args, { encoding: 'utf-8' });
  const m = String(r.stderr ?? '').match(/mean_volume:\s*(-?[\d.]+|-inf) dB/);
  return m && m[1] !== '-inf' ? Number(m[1]) : -Infinity;
}

/** 一句口播：高通 → 压缩 → 统一到 VOICE_RMS_TARGET（原地改写） */
function processVoiceLine(wav: string): void {
  const tmp = wav.replace(/\.wav$/, '.comp.wav');
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', wav, '-af', 'highpass=f=70,acompressor=threshold=0.063:ratio=3:attack=5:release=80:makeup=1', tmp]);
  const gain = voiceGainDb(meanVolumeDb(tmp), VOICE_RMS_TARGET);
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-i', tmp, '-af', `volume=${gain}dB,alimiter=limit=0.89:level=false`, wav]);
  fs.rmSync(tmp, { force: true });
}

/** 上游 dur.json：{id: 秒} 或 [{id, dur}] 两种写法都认 */
function readDurations(file: string): Record<string, number> {
  if (!fs.existsSync(file)) return {};
  const d = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
  if (Array.isArray(d)) return Object.fromEntries(d.map((x: { id: string; dur?: number; durSec?: number }) => [x.id, x.dur ?? x.durSec ?? 0]));
  return d as Record<string, number>;
}

/**
 * 成片里的口播还听得清吗：按每句的放映时间把成片音频切出来（前后各多留一点），再逐句 Whisper 核对。
 * 合成时每句都过了核对，这一步查的是混音之后——配乐、音效会不会把字盖住。
 */
export function voiceFinalCheck(filmId: string, finalFile?: string): { ok: boolean; failed: string[]; report: string } | null {
  const file = voiceFilePath(filmId);
  if (!fs.existsSync(file)) return null;
  const voice = JSON.parse(fs.readFileSync(file, 'utf-8')) as VoiceFile;
  const final = finalFile ?? path.join(process.cwd(), 'out', filmId, 'final-60.mp4');
  if (!fs.existsSync(final)) throw new Error(`没有成片：${final}`);
  const syncFile = path.join(path.dirname(file), 'sync.json');
  const warp = fs.existsSync(syncFile) ? buildTimeWarp(JSON.parse(fs.readFileSync(syncFile, 'utf-8')) as SyncFile) : IDENTITY_WARP;
  const toFilm = (s: number) => (warp.IS_IDENTITY ? s : warp.toFilm(s));
  const dir = path.join(process.cwd(), 'out', filmId, 'voice', 'final');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const l of voice.lines) {
    if (!l.durSec) continue;
    const from = Math.max(0, toFilm(l.sec) - 0.1);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', from.toFixed(3), '-t', (l.durSec + 0.4).toFixed(3), '-i', final, '-vn', '-ac', '1', '-ar', '24000', path.join(dir, `${l.id}.wav`)]);
  }
  const linesJson = path.join(process.cwd(), 'out', filmId, 'voice', 'lines.json');
  fs.writeFileSync(linesJson, JSON.stringify(voiceTtsLines(voice), null, 1));
  const r = voiceCheck(linesJson, dir, /[一-鿿]/.test(voice.lines.map((l) => l.text).join('')) ? 'zh' : 'auto');
  const ok = parseAsrReport(r.report);
  const failed = voice.lines.filter((l) => l.durSec && !ok[l.id]).map((l) => l.id);
  return { ok: failed.length === 0, failed, report: r.report };
}
