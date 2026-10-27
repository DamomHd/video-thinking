/**
 * lemo-opuscar 的 Python 工具链（vendor/lemo-opuscar/，原样收录）在本工程里的入口
 *
 *   vw py setup                         建 .venv（Python 3.11）并按 vendor/lemo-opuscar/requirements.txt 安装
 *   vw py fetch instruments <库|all>    下载采样库（vsco2ce / vcsl / salamander / freepats / karoryfer）
 *   vw py fetch voice                   下载 Kokoro 离线配音模型（约 350 MB）
 *   vw voice tts <lines.json> [--out=目录] [--engine=kokoro|edge]   逐句配音 → <id>.wav + dur.json
 *   vw voice check <lines.json> <目录> [--lang=zh|en|auto]          Whisper 逐句转写核对 + 逐词时间戳 words.json
 *   vw voice srt <cues.json> <out.srt>                               导出字幕
 *
 * 大文件不进源码目录：素材包从上游 release 下到 out/opuscar/（断点续传、校验 sha256、解压），
 * 再从 vendor/lemo-opuscar/core/ 下对应位置软链过去 —— 上游脚本按自己的相对路径找得到，文件实际在 out/ 缓存里。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const VENDOR = path.join(process.cwd(), 'vendor/lemo-opuscar');
export const ASSETS = path.join(process.cwd(), 'out/opuscar');
export const PY = path.join(process.cwd(), '.venv/bin/python');
export const LIBS = ['vsco2ce', 'vcsl', 'salamander', 'freepats', 'karoryfer'] as const;

interface Manifest {
  repo: string;
  tag: string;
  packs: Record<string, { file: string; size: number; sha256: string }>;
}

export function pySetup(python = '/Users/sneaker/.local/bin/python3.11'): void {
  const py = fs.existsSync(python) ? python : 'python3.11';
  if (!fs.existsSync(PY)) execFileSync(py, ['-m', 'venv', '.venv'], { stdio: 'inherit' });
  execFileSync(PY, ['-m', 'pip', 'install', '-q', '-r', path.join(VENDOR, 'requirements.txt')], { stdio: 'inherit' });
}

function sha256(file: string): string {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(1 << 20);
  let n: number;
  while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd);
  return h.digest('hex');
}

/** 把 out/opuscar/core 下解出来的东西软链进 vendor/lemo-opuscar/core（已有的跳过） */
export function linkAssets(): string[] {
  const made: string[] = [];
  const link = (rel: string) => {
    const src = path.join(ASSETS, rel);
    const dst = path.join(VENDOR, rel);
    if (!fs.existsSync(src)) return;
    if (fs.existsSync(dst) || (fs.lstatSync(dst, { throwIfNoEntry: false })?.isSymbolicLink() ?? false)) return;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(dst), src), dst);
    made.push(rel);
  };
  link('core/audio/instruments');
  const tts = path.join(ASSETS, 'core/tts');
  if (fs.existsSync(tts)) for (const f of fs.readdirSync(tts)) link(`core/tts/${f}`);
  const assets = path.join(ASSETS, 'core/assets');
  if (fs.existsSync(assets)) link('core/assets');
  return made;
}

export function fetchPack(name: string): void {
  const man = JSON.parse(fs.readFileSync(path.join(VENDOR, 'tools/assets.json'), 'utf-8')) as Manifest;
  const p = man.packs[name];
  if (!p) throw new Error(`没有这个素材包：${name}（有：${Object.keys(man.packs).join(', ')}）`);
  const done = path.join(ASSETS, '.done', name);
  if (fs.existsSync(done)) {
    console.log(`✓ ${name} 已在 out/opuscar/`);
    linkAssets();
    return;
  }
  const stage = path.join(ASSETS, '.release');
  fs.mkdirSync(stage, { recursive: true });
  const tmp = path.join(stage, p.file + '.download');
  const url = `https://github.com/${man.repo}/releases/download/${man.tag}/${p.file}`;
  const have = () => (fs.existsSync(tmp) ? fs.statSync(tmp).size : 0);
  if (have() > p.size) fs.rmSync(tmp);
  if (have() < p.size) {
    console.log(`↓ ${p.file}（${(p.size / 1e6).toFixed(0)} MB）${have() ? `，从 ${(have() / 1e6).toFixed(0)} MB 续传` : ''}`);
    const r = spawnSync('curl', ['-L', '--fail', '--retry', '3', '--retry-delay', '2', '--connect-timeout', '20', '-C', '-', '-sS', '-o', tmp, url], { stdio: 'inherit' });
    if (r.status) throw new Error(`下载失败（curl 退出码 ${r.status}）；再跑一次同样的命令会续传`);
  }
  if (sha256(tmp) !== p.sha256) {
    fs.rmSync(tmp);
    throw new Error(`${p.file} 校验和不对，已删除；上游可能更新了素材包，更新 vendor/lemo-opuscar/tools/assets.json 后重试`);
  }
  // 解包前先查条目：不许绝对路径、不许跳出目录、不许链接
  const list = execFileSync('tar', ['-tvf', tmp], { encoding: 'utf-8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
  const bad = list.find((l) => /^[lh]/.test(l) || / \/|(^|\/)\.\.(\/|$)/.test(l.slice(l.lastIndexOf(' ') + 1)));
  if (bad) throw new Error(`素材包里有不安全的条目，没有解包：${bad}`);
  execFileSync('tar', ['-xf', tmp, '-C', ASSETS], { stdio: 'inherit' });
  fs.rmSync(tmp);
  fs.mkdirSync(path.dirname(done), { recursive: true });
  fs.writeFileSync(done, `${p.sha256}\n`);
  const made = linkAssets();
  console.log(`✓ ${name} → out/opuscar/${made.length ? `（新链接：${made.join(', ')}）` : ''}`);
}

/** 用 .venv 的 Python 在 vendor/lemo-opuscar 下跑脚本（上游脚本按仓库根目录的相对路径工作） */
export function runPy(args: string[], options: { input?: string; quiet?: boolean } = {}): string {
  if (!fs.existsSync(PY)) throw new Error('还没有 Python 环境：先跑 vw py setup');
  // Whisper 等模型的下载缓存也放进 out/（不进用户主目录、不进源码目录）
  const env = { ...process.env, HF_HOME: process.env.HF_HOME ?? path.join(ASSETS, 'hf') };
  return execFileSync(PY, args, { cwd: VENDOR, env, encoding: 'utf-8', input: options.input, stdio: options.quiet ? ['pipe', 'pipe', 'pipe'] : ['pipe', 'pipe', 'inherit'], maxBuffer: 1 << 26 });
}

/** 逐句配音：kokoro（离线；英文好，中文读不准）/ edge（微软神经网络声音，中文好，需联网） */
export function voiceTts(lines: string, outDir: string, engine: 'kokoro' | 'edge' = 'kokoro'): string {
  const script = engine === 'edge' ? 'core/tts/tts_zh.py' : 'core/tts/tts.py';
  return runPy([script, path.resolve(lines), path.resolve(outDir)]);
}

/** Whisper 逐句核对；返回是否全部通过（上游脚本 0 = 通过、1 = 有差异、2 = 跑不了） */
export function voiceCheck(lines: string, dir: string, lang = 'auto'): { ok: boolean; report: string } {
  try {
    const report = runPy(['core/tts/asr_check.py', path.resolve(lines), path.resolve(dir), '--lang', lang]);
    return { ok: !/mismatches: [1-9]/.test(report), report };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { ok: false, report: String(err.stdout ?? '') + (err.status === 2 ? '\n（核对没能运行：模型加载失败？）' : '') };
  }
}

export function voiceSrt(cues: string, out: string): string {
  return runPy(['core/render/srt.py', path.resolve(cues), path.resolve(out)]);
}
