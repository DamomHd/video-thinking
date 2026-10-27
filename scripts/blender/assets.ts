import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Blender 的另外两条用法（architecture.html §8 末尾「Dream 时期的 Blender 用法」）：
 *   1. 出资产给 three：.blend → glb + 尺寸单源 JSON
 *   2. Remotion → Blender → Remotion：剪影 PNG 序列 → 合成器体积光 → PNG 序列，回 Remotion 用 screen 叠加
 *
 * 外部 .blend 一律 -b -Y --factory-startup（§8「安全」）。
 */

export function findBlender(): string | null {
  const candidates = [
    process.env.BLENDER_BIN,
    '/Applications/Blender.app/Contents/MacOS/Blender',
    'blender',
  ].filter(Boolean) as string[];
  for (const bin of candidates) {
    try {
      execSync(bin.includes('/') ? `test -x "${bin}"` : `which ${bin}`, { stdio: 'ignore' });
      return bin;
    } catch {
      /* 下一个 */
    }
  }
  return null;
}

function requireBlender(): string {
  const bin = findBlender();
  if (!bin) throw new Error('[vw blender] 未检测到 Blender（brew install --cask blender，或用 BLENDER_BIN 指定）');
  return bin;
}

/* ------------------------------------------------------------------ */
/* 1. glb                                                              */
/* ------------------------------------------------------------------ */

export interface GlbOptions {
  /** 源 .blend（相对仓库根） */
  blend: string;
  /** 输出 glb，默认 public/models/<名>.glb */
  out?: string;
  /** 尺寸单源 JSON，默认 src/assets/models/<名>.json */
  meta?: string;
}

export function exportGlb(options: GlbOptions): { glb: string; meta: string } {
  const root = process.cwd();
  const blend = path.resolve(root, options.blend);
  if (!fs.existsSync(blend)) throw new Error(`[vw blender glb] 找不到 ${options.blend}`);
  const name = path.basename(blend, '.blend');
  const glb = path.resolve(root, options.out ?? `public/models/${name}.glb`);
  const meta = path.resolve(root, options.meta ?? `src/assets/models/${name}.json`);
  const py = path.join(root, 'blender', 'assets', 'export_glb.py');
  execSync(
    `"${requireBlender()}" -b "${blend}" -Y --factory-startup -P "${py}" -- --out="${glb}" --meta="${meta}"`,
    { stdio: 'inherit' }
  );
  if (!fs.existsSync(glb)) throw new Error('[vw blender glb] Blender 没有产出 glb');
  return { glb, meta };
}

/* ------------------------------------------------------------------ */
/* 2. 体积光                                                            */
/* ------------------------------------------------------------------ */

export interface RaysOptions {
  filmId: string;
  /** 渲剪影的 Remotion 合成 id（白 = 透光，黑 = 挡光） */
  comp: string;
  /** 光源位置，画面归一化，左上为 (0,0)（和 CSS 一致；传给 Blender 时翻转 y） */
  source?: [number, number];
  length?: number;
  color?: [number, number, number];
  gain?: number;
  force?: boolean;
}

export interface RaysManifest {
  comp: string;
  complete: boolean;
  /** 剪影序列 + 参数的内容指纹：剪影或参数改了就不再匹配，需要重跑 */
  sig: string;
  /** 帧数与剪影合成逐帧对应：第 i 帧剪影 → NNNN.png，叠加时按同一帧号取 */
  frames: number;
  dir: string;
  updatedAt: string;
}

/** 体积光清单的位置：和机身清单同一个约定，放在片的 three/ 下，组件 import 它 */
export function raysManifestPath(filmId: string, comp: string): string {
  return path.join(process.cwd(), 'src', 'films', filmId, 'three', `rays-${comp}.json`);
}

export async function renderRays(o: RaysOptions): Promise<RaysManifest> {
  const root = process.cwd();
  const blender = requireBlender();
  const maskDir = path.join(root, 'out', o.filmId, 'rays', o.comp, 'mask');
  const relOut = path.join('blender', o.filmId, 'rays', o.comp);
  const outDir = path.join(root, 'public', relOut);
  const source = o.source ?? [0.5, 0.35];
  const length = o.length ?? 0.25;
  const color = o.color ?? [1, 0.85, 0.55];
  const gain = o.gain ?? 1.6;

  // 第 1 步：Remotion 渲剪影序列
  fs.rmSync(maskDir, { recursive: true, force: true });
  fs.mkdirSync(maskDir, { recursive: true });
  console.log(`[vw blender rays] 1/3 渲剪影序列: ${o.comp} → ${path.relative(root, maskDir)}`);
  execSync(
    `npx remotion render src/Root.tsx ${o.comp} "${maskDir}" --sequence --image-format=png --public-dir=public`,
    { stdio: 'inherit' }
  );
  const masks = fs.readdirSync(maskDir).filter((f) => f.endsWith('.png')).sort();
  if (!masks.length) throw new Error('[vw blender rays] 剪影序列是空的');

  // 指纹：剪影内容 + 参数
  const h = crypto.createHash('sha1');
  for (const f of masks) h.update(fs.readFileSync(path.join(maskDir, f)));
  h.update(JSON.stringify({ source, length, color, gain }));
  const sig = h.digest('hex').slice(0, 12);

  const manifestPath = raysManifestPath(o.filmId, o.comp);
  const prev: RaysManifest | null = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) : null;
  if (!o.force && prev?.complete && prev.sig === sig && countPng(outDir) >= masks.length) {
    console.log(`[vw blender rays] 剪影和参数都没变（${sig}），跳过 Blender`);
    return prev;
  }

  // 第 2 步：Blender 合成器出光束
  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`[vw blender rays] 2/3 Blender 合成器体积光 → public/${relOut}`);
  const py = path.join(root, 'blender', 'fx', 'rays.py');
  execSync(
    `"${blender}" -b -Y --factory-startup -P "${py}" -- --in="${maskDir}" --out="${outDir}" ` +
      `--source=${source[0]},${1 - source[1]} --length=${length} --color=${color.join(',')} --gain=${gain}`,
    { stdio: 'inherit' }
  );

  // 第 3 步：清单 —— 帧齐全才算 complete
  const frames = countPng(outDir);
  const manifest: RaysManifest = {
    comp: o.comp,
    complete: frames >= masks.length,
    sig,
    frames,
    dir: relOut,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(
    `[vw blender rays] 3/3 清单 → ${path.relative(root, manifestPath)}  complete=${manifest.complete} (${frames}/${masks.length})`
  );
  return manifest;
}

function countPng(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  while (fs.existsSync(path.join(dir, `${String(n).padStart(4, '0')}.png`))) n++;
  return n;
}
