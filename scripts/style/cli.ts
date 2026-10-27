import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { STYLES, getStyle } from '../../src/styles/index.js';

/** vw style list / sheet：风格库的命令行入口 */
export function listStyles(): string[] {
  // 自有风格（没有「收录自」的）排最前
  const own = (id: string) => !fs.existsSync(path.join(process.cwd(), 'src', 'styles', id, 'DEMO.md'));
  return [...Object.values(STYLES)].sort((a, b) => Number(own(b.id)) - Number(own(a.id)) || a.id.localeCompare(b.id)).map(
    (s) => {
      const refs = path.join(process.cwd(), 'src', 'styles', s.id, 'refs');
      const n = fs.existsSync(refs) ? fs.readdirSync(refs).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).length : 0;
      const prompt = fs.existsSync(path.join(process.cwd(), 'src', 'styles', s.id, 'STYLE.md')) ? ' · 有 STYLE.md' : '';
      return `${s.id.padEnd(20)} ${s.label}  · 色 ${Object.keys(s.colors).length} 个 · ${s.frame ? '有图框' : '无图框'} · 参考帧 ${n} 张${prompt}`;
    }
  );
}

export function renderStyleSheet(id: string): string {
  getStyle(id); // 不存在就抛
  const out = path.join(process.cwd(), 'out', 'styles', `${id}-sheet.png`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execSync(
    `npx remotion still src/probe/index.ts StyleSheet "${out}" --gl=angle --log=error --props='${JSON.stringify({ styleId: id })}'`,
    { stdio: 'inherit' }
  );
  return out;
}
