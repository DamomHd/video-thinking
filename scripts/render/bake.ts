/**
 * 烘焙纹理 (bake)
 * 对标 architecture.html §10 的 bake-card.mts / bake-phone-screen.mts：
 *   "渲烘焙合成的第 40 帧（2× / 4×）→ public/bake、public/blender/phone，作为 WebGL 纹理"
 *
 * 为什么要烘焙：R3F 世界里要贴一张「界面截图」当纹理时，
 * 直接在三维里重画一遍 DOM 不现实，而实时 html→texture 不确定。
 * 所以把那一幕单独渲成一张高倍率静帧，当静态纹理贴上去 —— 结果是确定的，而且只渲一次。
 *
 * 不变量：
 *   · 产物文件名带内容指纹，避免 Studio 按地址缓存旧图（§7 的坑）
 *   · 指纹变了才重渲；没变直接复用
 */

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface BakeTarget {
  /** 烘焙合成 id */
  compositionId: string;
  /** 取第几帧 */
  frame: number;
  /** 超采样倍率（原版用 2× / 4×） */
  scale: number;
  /** 产物目录，相对 public/ */
  outDirRel: string;
  /** 产物基名（最终文件名是 <基名>-<指纹>.png） */
  baseName: string;
  /** 参与指纹的额外参数（改了它就该重渲） */
  props?: Record<string, unknown>;
}

export interface BakeResult {
  ok: boolean;
  /** 相对 public/ 的产物路径 */
  fileRel?: string;
  fingerprint: string;
  reused: boolean;
  reason?: string;
}

/**
 * 画面源码的内容哈希（src/ 下所有 .ts/.tsx）。
 *
 * 只按「合成 id + 帧号 + 倍率」算指纹的话，改了这一幕的代码，
 * 指纹不变，bake 会直接复用旧纹理 —— 正是 §7「生成资源的文件名带内容指纹」要防的事。
 * 这里粗一点：src/ 任何改动都让所有烘焙失效。宁可多渲一次，也不拿旧图顶包。
 */
export function sourceHash(root = path.join(process.cwd(), 'src')): string {
  const h = crypto.createHash('sha1');
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.(tsx?|json)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
        h.update(path.relative(root, full));
        h.update(fs.readFileSync(full));
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return h.digest('hex').slice(0, 12);
}

/**
 * 内容指纹：合成 id + 帧号 + 倍率 + props + 画面源码哈希。
 * 文件名带上它，所以换了参数或改了代码就是另一个文件，Studio 不会拿旧图顶包。
 */
export function bakeFingerprint(target: BakeTarget, srcHash = sourceHash()): string {
  const payload = JSON.stringify({
    c: target.compositionId,
    f: target.frame,
    s: target.scale,
    p: target.props ?? null,
    src: srcHash,
  });
  return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 10);
}

export function bake(target: BakeTarget, options: { entry?: string; gl?: string } = {}): BakeResult {
  const entry = options.entry ?? 'src/Root.tsx';
  const gl = options.gl ?? 'angle';
  const fingerprint = bakeFingerprint(target);

  const outDirAbs = path.join(process.cwd(), 'public', target.outDirRel);
  const fileRel = path.join(target.outDirRel, `${target.baseName}-${fingerprint}.png`);
  const fileAbs = path.join(process.cwd(), 'public', fileRel);

  if (fs.existsSync(fileAbs) && fs.statSync(fileAbs).size > 0) {
    return { ok: true, fileRel, fingerprint, reused: true };
  }

  fs.mkdirSync(outDirAbs, { recursive: true });

  const args = [
    'remotion', 'still', entry, target.compositionId, fileAbs,
    `--frame=${target.frame}`,
    `--scale=${target.scale}`,
    `--gl=${gl}`,
    '--log=error',
  ];
  if (target.props) {
    const propsFile = path.join(outDirAbs, `.${target.baseName}-props.json`);
    fs.writeFileSync(propsFile, JSON.stringify(target.props), 'utf-8');
    args.push(`--props=${propsFile}`);
  }

  try {
    execFileSync('npx', args, { stdio: 'pipe', timeout: 600000 });
  } catch (e: any) {
    return {
      ok: false,
      fingerprint,
      reused: false,
      reason: `烘焙渲染失败: ${String(e?.stderr ?? e?.message ?? e).slice(0, 240)}`,
    };
  }

  if (!fs.existsSync(fileAbs) || fs.statSync(fileAbs).size === 0) {
    return { ok: false, fingerprint, reused: false, reason: '没有产出图片' };
  }

  // 清掉同基名的旧指纹产物，避免 public/ 无限堆积
  for (const f of fs.readdirSync(outDirAbs)) {
    if (f.startsWith(`${target.baseName}-`) && f.endsWith('.png') && !f.includes(fingerprint)) {
      fs.unlinkSync(path.join(outDirAbs, f));
    }
  }

  return { ok: true, fileRel, fingerprint, reused: false };
}

/** 一次烘焙多张，返回「基名 → 相对路径」，可以直接写进影片的纹理清单 */
export function bakeAll(
  targets: BakeTarget[],
  options: { entry?: string; gl?: string } = {}
): { map: Record<string, string>; results: (BakeResult & { baseName: string })[] } {
  const map: Record<string, string> = {};
  const results: (BakeResult & { baseName: string })[] = [];
  for (const t of targets) {
    const r = bake(t, options);
    results.push({ ...r, baseName: t.baseName });
    if (r.ok && r.fileRel) map[t.baseName] = r.fileRel;
    console.log(
      `[bake] ${t.baseName.padEnd(18)} ${r.ok ? (r.reused ? '复用' : '已烘焙') : '失败'}` +
        `  ${r.fileRel ?? ''}${r.reason ? `  ${r.reason}` : ''}`
    );
  }
  return { map, results };
}
