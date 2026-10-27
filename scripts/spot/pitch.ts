import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pitchedRel } from '../../src/shared/pitch.js';

/**
 * 生成变调素材（若不存在或比源文件旧）：asetrate 把采样率按 2^(semis/12) 改写再重采样回原采样率 ——
 * 等价于磁带变速，音高和时长一起变。返回相对 public/ 的路径。
 */
export function ensurePitched(file: string, semis: number, publicDir = path.join(process.cwd(), 'public')): string {
  if (!semis) return file;
  const rel = pitchedRel(file, semis);
  const src = path.join(publicDir, file.replace(/^\/?(public\/)?/, ''));
  const dst = path.join(publicDir, rel);
  if (fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) return rel;
  const sr = Number(
    execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'csv=p=0', src]).toString().trim()
  ) || 48000;
  const r = Math.pow(2, semis / 12);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const tmp = `${dst}.part.wav`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src, '-af', `asetrate=${(sr * r).toFixed(3)},aresample=${sr}`, '-c:a', 'pcm_s16le', tmp]);
  fs.renameSync(tmp, dst);
  return rel;
}
