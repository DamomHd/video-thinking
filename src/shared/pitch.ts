/**
 * 变调素材的命名约定（渲染端、工作台、脚本三方共用）
 *
 * Remotion 渲染时 <Audio playbackRate> 走 ffmpeg atempo：只改速度、**不改音高**；
 * 工作台的 Web Audio playbackRate 则音高速度一起变 —— 同一个 pitchSemis 两边听到的不一样。
 * 所以变调一律离线做成独立文件（按采样率重采样：音高和时长一起变，与工作台原来的听感一致），
 * 两边都按原速播放这个文件。文件由 scripts/spot/pitch.ts 的 ensurePitched 生成。
 */
export function pitchedRel(file: string, semis: number): string {
  if (!semis) return file;
  const clean = file.replace(/^\/?(public\/)?/, '');
  const base = clean.split('/').pop()!.replace(/\.wav$/i, '');
  const tag = `${semis > 0 ? '+' : ''}${Math.round(semis * 100) / 100}`;
  return `sfx-lib/pitched/${base}.p${tag}.wav`;
}
