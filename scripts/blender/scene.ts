import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findBlender } from './assets.js';
import { hwProfile } from '../hw/profile.js';

/**
 * 场景 JSON → .blend（+ 可选预览帧）：vw blender scene --spec=<json> [--still=<秒>] [--samples=] [--res=960x540]
 *
 * 场景格式见 blender/scene/build_scene.py 头注；示例 blender/scene/examples/。
 * 预览帧的采样数缺省按硬件档位（vw hw）：Intel 上低采样 + 降噪，只为看构图和材质方向。
 */
export function buildScene(options: { spec: string; out?: string; still?: number; samples?: number; res?: [number, number] }) {
  const root = process.cwd();
  const blender = findBlender();
  if (!blender) throw new Error('[vw blender scene] 未检测到 Blender');
  let spec = path.resolve(root, options.spec);
  if (!fs.existsSync(spec)) throw new Error(`[vw blender scene] 找不到 ${options.spec}`);
  const name = path.basename(spec).replace(/\.json$/, '');
  const out = path.resolve(root, options.out ?? path.join('out', 'scenes', `${name}.blend`));
  // 预览分辨率覆盖：写一份临时 spec，不动原文件
  if (options.res) {
    const j = JSON.parse(fs.readFileSync(spec, 'utf-8'));
    j.render = { ...(j.render ?? {}), resolution: options.res };
    const tmp = path.join(path.dirname(out), `${name}.preview.json`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(j));
    spec = tmp;
  }
  const samples = options.samples ?? hwProfile().blender.samples;
  const py = path.join(root, 'blender', 'scene', 'build_scene.py');
  const still = options.still !== undefined ? ` --still=${options.still} --samples=${samples}` : '';
  execSync(`"${blender}" -b -Y --factory-startup -P "${py}" -- --spec="${spec}" --out="${out}"${still}`, { stdio: 'inherit' });
  return { blend: out, png: options.still !== undefined ? out.replace(/\.blend$/, '.png') : null };
}
