/**
 * 口播（可选 VO 层）的纯函数：配乐让位、字幕、交给配音脚本的逐句清单
 */
import { DuckSpec, VoiceFile, VoiceLine } from './types';

export const VO_DUCK_DB = -10;
/** 每句口播处理后的目标响度（RMS，dBFS）：先压缩再统一到这个电平，句与句一样响 */
export const VOICE_RMS_TARGET = -18;
/** 口播时人声至少比（让位后的）配乐高这么多 dB（lemo-opuscar TECHNIQUE §4：约 10 dB） */
export const VOICE_OVER_MUSIC_DB = 10;

/** 把一句的平均电平拉到目标要加多少 dB（纯函数；限制在 ±18 dB 内，防止静音句被拉爆） */
export function voiceGainDb(meanDb: number, target = VOICE_RMS_TARGET): number {
  if (!isFinite(meanDb)) return 0;
  return Math.max(-18, Math.min(18, Math.round((target - meanDb) * 10) / 10));
}
/** 口播开口前多早开始压配乐、说完多久回来 */
export const VO_DUCK_PRE = 0.15;
export const VO_DUCK_RELEASE = 0.35;

/** 每句口播一个配乐让位触发（放映秒）：开口前 0.15s 压下去，整句保持，说完 0.35s 回来 */
export function voiceDuckTriggers(voice: VoiceFile | undefined, toFilm: (scoreSec: number) => number): { triggerStartSec: number; spec: DuckSpec }[] {
  if (!voice) return [];
  return voice.lines
    .filter((l) => l.file && l.durSec)
    .map((l) => ({
      triggerStartSec: toFilm(l.sec),
      spec: { db: voice.duckDb ?? VO_DUCK_DB, preSec: VO_DUCK_PRE, holdSec: l.durSec!, releaseSec: VO_DUCK_RELEASE, layers: ['MUSIC'] },
    }));
}

/** 字幕：每句一条（放映秒），至少停 1.8s、不短于念完 + 0.6s，和下一句重叠时截到下一句开头 */
export function voiceSubtitles(voice: VoiceFile, toFilm: (scoreSec: number) => number): { t0: number; t1: number; text: string }[] {
  const cues = voice.lines
    .filter((l) => l.durSec)
    .map((l) => {
      const t0 = toFilm(l.sec);
      return { t0, t1: t0 + Math.max(1.8, l.durSec! + 0.6), text: l.text };
    })
    .sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i < cues.length - 1; i++) cues[i].t1 = Math.min(cues[i].t1, cues[i + 1].t0);
  return cues.map((c) => ({ t0: round(c.t0), t1: round(c.t1), text: c.text }));
}

/** 交给上游配音脚本（tts.py / tts_zh.py）和核对脚本（asr_check.py）的逐句清单 */
export function voiceTtsLines(voice: VoiceFile): Record<string, string>[] {
  return voice.lines.map((l) => {
    const o: Record<string, string> = { id: l.id, text: l.text };
    if (l.say) o.say = l.say;
    if (l.asr) o.asr = l.asr;
    const v = l.voice ?? voice.voice;
    if (v) o.voice = v;
    if (l.rate) o.rate = l.rate;
    if (voice.engine === 'kokoro' && /[一-鿿]/.test(l.text)) o.lang = 'cmn';
    return o;
  });
}

/** 两句口播重叠（前一句没念完后一句就开口）：返回重叠的句对 */
export function voiceOverlaps(lines: VoiceLine[]): [string, string][] {
  const s = lines.filter((l) => l.durSec).sort((a, b) => a.sec - b.sec);
  const out: [string, string][] = [];
  for (let i = 0; i < s.length - 1; i++) if (s[i].sec + s[i].durSec! > s[i + 1].sec + 1e-3) out.push([s[i].id, s[i + 1].id]);
  return out;
}

const round = (v: number) => Math.round(v * 1000) / 1000;
