import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 封存版本（architecture.html §4「备份（只读对比）」）
 *
 * 改版前把当前成片封存一份：拷进 public/archive/<片>/<标签>.mp4 并设为只读，登记到 src/archive/index.json。
 * Root 按登记表给每份封存注册两个合成：
 *   <片>-Archive-<标签>   原样播放封存件（OffthreadVideo），用来回看旧版
 *   <片>-Compare-<标签>   左旧右新并排（或擦除对比），旧版是封存的 mp4，新版是当前代码现渲
 *
 * 封存件是只读的、标签不能复用：旧版一旦被覆盖，「改版前后对比」就失去了参照。
 */

export interface ArchiveEntry {
  film: string;
  label: string;
  /** 相对 public/ */
  file: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  sha1: string;
  savedAt: string;
}

export interface ArchiveIndex {
  entries: ArchiveEntry[];
}

const INDEX = path.join('src', 'archive', 'index.json');

export function readArchiveIndex(root = process.cwd()): ArchiveIndex {
  const p = path.join(root, INDEX);
  if (!fs.existsSync(p)) return { entries: [] };
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function writeArchiveIndex(idx: ArchiveIndex, root = process.cwd()): void {
  const p = path.join(root, INDEX);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.part`;
  fs.writeFileSync(tmp, JSON.stringify(idx, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

/** 合成 id 只允许字母数字和连字符 */
export function sanitizeLabel(label: string): string {
  return label.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function probe(file: string): { durationSec: number; fps: number; width: number; height: number } {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
    '-of', 'json', file,
  ]).toString();
  const j = JSON.parse(out);
  const s = j.streams?.[0] ?? {};
  const [n, d] = String(s.r_frame_rate ?? '30/1').split('/').map(Number);
  return {
    durationSec: Math.round(Number(j.format?.duration ?? 0) * 1000) / 1000,
    fps: Math.round((n / (d || 1)) * 1000) / 1000,
    width: Number(s.width),
    height: Number(s.height),
  };
}

export function archiveSave(options: { film: string; label?: string; src?: string }): ArchiveEntry {
  const root = process.cwd();
  const src = path.resolve(root, options.src ?? path.join('out', options.film, 'final-60.mp4'));
  if (!fs.existsSync(src)) throw new Error(`[vw archive] 找不到要封存的成片: ${path.relative(root, src)}（先出片，或用 --src= 指定）`);
  const label = sanitizeLabel(options.label ?? new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  if (!label) throw new Error('[vw archive] 标签为空（只能用字母、数字、连字符）');

  const idx = readArchiveIndex(root);
  if (idx.entries.some((e) => e.film === options.film && e.label === label)) {
    throw new Error(`[vw archive] ${options.film} 已有封存「${label}」—— 封存件不覆盖，换一个 --label`);
  }

  const rel = path.join('archive', options.film, `${label}.mp4`);
  const dst = path.join(root, 'public', rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o444);

  const entry: ArchiveEntry = {
    film: options.film,
    label,
    file: rel,
    ...probe(dst),
    sha1: crypto.createHash('sha1').update(fs.readFileSync(dst)).digest('hex').slice(0, 12),
    savedAt: new Date().toISOString(),
  };
  idx.entries.push(entry);
  writeArchiveIndex(idx, root);
  return entry;
}

/** 解除封存：删登记和文件。只在误封存时用，所以要显式给出片和标签 */
export function archiveRemove(film: string, label: string): boolean {
  const root = process.cwd();
  const idx = readArchiveIndex(root);
  const e = idx.entries.find((x) => x.film === film && x.label === label);
  if (!e) return false;
  const f = path.join(root, 'public', e.file);
  if (fs.existsSync(f)) {
    fs.chmodSync(f, 0o644);
    fs.unlinkSync(f);
  }
  idx.entries = idx.entries.filter((x) => x !== e);
  writeArchiveIndex(idx, root);
  return true;
}
