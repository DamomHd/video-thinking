/**
 * 交付用的 CREDITS（借鉴 lemo-opuscar DIRECTOR.md §11：成片里每一样第三方素材的来源和授权）
 *
 *   vw credits <片> → out/<片>/CREDITS.md（出片时自动生成）
 *
 * 读真值：音效采购单 manifest.json（外部素材的 source / license / url / author）、配乐 music.json（曲目来源与授权，
 * 采样配乐带采样库署名行）、口播 voice.json（配音引擎）、片子用到的收录引擎（画法片段、笔刷手绘）。
 * 本地合成的东西不列。CC BY 的素材（采样钢琴、鼓组、收录风格的参考帧不进片）交付时必须署名。
 */
import fs from 'node:fs';
import path from 'node:path';

interface ManifestEntry { title?: string; source?: string; license?: string; url?: string; author?: string; file?: string }

const LICENSE_NAME = (u?: string) =>
  !u ? '' : /publicdomain\/zero/.test(u) ? 'CC0 1.0' : /by\/4\.0/.test(u) ? 'CC BY 4.0' : /by\/3\.0/.test(u) ? 'CC BY 3.0' : u;

export function buildCredits(filmId: string, root = process.cwd()): { file: string; lines: string[]; ccby: string[] } {
  const audio = path.join(root, 'src/films', filmId, 'audio');
  const read = <T>(f: string): T | null => (fs.existsSync(path.join(audio, f)) ? (JSON.parse(fs.readFileSync(path.join(audio, f), 'utf-8')) as T) : null);
  const lines: string[] = [];
  const ccby: string[] = [];

  const manifest = read<Record<string, ManifestEntry | ManifestEntry[]>>('manifest.json') ?? {};
  const sfx = Object.values(manifest).flat().filter((e) => e && e.source);
  if (sfx.length) {
    lines.push('## 音效', '');
    for (const e of sfx) {
      const lic = LICENSE_NAME(e.license);
      lines.push(`- ${e.title ?? e.file}${e.author && !(e.title ?? '').includes(e.author) ? ` — ${e.author}` : ''}（${e.source}，${lic}）${e.url ? ` ${e.url}` : ''}`);
      if (/BY/.test(lic)) ccby.push(`${e.title}${e.author && !(e.title ?? '').includes(e.author) ? ` — ${e.author}` : ''}（${lic}）`);
    }
    lines.push('');
  }

  const music = read<{ cues: { label: string; track?: { title: string; artist?: string; source?: string; license?: string; url?: string } }[] }>('music.json');
  const tracks = (music?.cues ?? []).filter((c) => c.track);
  if (tracks.length) {
    lines.push('## 配乐', '');
    for (const c of tracks) {
      const t = c.track!;
      if (t.source === 'local-sampled' || t.source === 'score') {
        lines.push(`- ${c.label}：${t.title}。${t.license ?? ''}`);
        if (/CC BY/i.test(t.license ?? '')) ccby.push(t.license!);
      } else if (t.source === 'freesound') {
        lines.push(`- ${c.label}：${t.title}${t.artist ? ` — ${t.artist}` : ''}（Freesound，${LICENSE_NAME(t.license)}）${t.url ?? ''}`);
      } else {
        lines.push(`- ${c.label}：${t.title}${t.artist ? ` — ${t.artist}` : ''}`);
      }
    }
    lines.push('');
  }

  const voice = read<{ engine: string; voice?: string }>('voice.json');
  if (voice) {
    lines.push('## 口播', '');
    lines.push(voice.engine === 'edge'
      ? `- 合成配音：Microsoft Edge 在线语音（edge-tts${voice.voice ? `，${voice.voice}` : ''}）。商用前自行确认微软的服务条款`
      : `- 合成配音：Kokoro-82M（Apache 2.0）${voice.voice ? `，${voice.voice}` : ''}`);
    lines.push('');
  }

  // 片子用到的收录引擎（代码授权，不是片内素材，但交付源码时要带上）
  const src = fs.readdirSync(path.join(root, 'src/films', filmId), { recursive: true }).filter((f) => /\.(tsx?|json)$/.test(String(f))).map((f) => fs.readFileSync(path.join(root, 'src/films', filmId, String(f)), 'utf-8')).join('\n');
  const engines: string[] = [];
  if (/components\/clip/.test(src)) engines.push('- 画法片段：huashu-clip（huashu-motion，MIT）；字体见 public/fonts/clip/（SIL OFL 1.1）');
  if (/components\/paint/.test(src)) engines.push('- 笔刷手绘：ClaudeAnimationBase（John Heibel，MIT）+ p5.js（LGPL-2.1）+ p5.brush（MIT）；手写字体 Permanent Marker（Apache 2.0）');
  if (engines.length) lines.push('## 代码与字体', '', ...engines, '');

  const out = [`# CREDITS · ${filmId}`, '', '成片里用到的第三方素材和授权（本地合成的音效、配乐不列）。素材的使用由使用者负责。', '', ...lines];
  if (ccby.length) out.push('## 必须署名（CC BY）', '', ...[...new Set(ccby)].map((l) => `- ${l}`), '');
  const file = path.join(root, 'out', filmId, 'CREDITS.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out.join('\n'));
  return { file, lines, ccby };
}
