/**
 * 笔刷手绘（ClaudeAnimationBase）收录的守门：
 *   · public/vendor 里的 p5 / p5.brush 副本必须和 package.json 锁定的 npm 版本逐字节一致（升级依赖后要重新拷）
 *   · 引擎桥（load.ts 的 BRIDGE）引用的全局名在上游脚本里都真实存在（上游改名时这里先报错，而不是渲染时才 ReferenceError）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const V = path.join(ROOT, 'public/vendor/claude-animation-base');

test('p5 / p5.brush 副本与锁定版本一致', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
  assert.equal(pkg.dependencies['p5'], '2.3.3');
  assert.equal(pkg.dependencies['p5.brush'], '2.2.3');
  const same = (a: string, b: string) => assert.ok(fs.readFileSync(a).equals(fs.readFileSync(b)), `${path.relative(ROOT, a)} 与 ${path.relative(ROOT, b)} 不一致：重新拷贝`);
  same(path.join(V, 'lib/p5.min.js'), path.join(ROOT, 'node_modules/p5/lib/p5.min.js'));
  same(path.join(V, 'lib/p5.brush.js'), path.join(ROOT, 'node_modules/p5.brush/dist/p5.brush.js'));
});

test('引擎桥引用的全局名都在上游脚本里', () => {
  const src = ['core.js', 'clawd.js', 'timeline.js'].map((f) => fs.readFileSync(path.join(V, 'src', f), 'utf-8')).join('\n');
  const declared = new Set<string>();
  for (const m of src.matchAll(/^(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) declared.add(m[1]);
  for (const m of src.matchAll(/^(?:const|let)\s+[A-Za-z_$][\w$]*\s*=[^;\n]*?,\s*([A-Za-z_$][\w$]*)\s*=/gm)) declared.add(m[1]);
  // core.js 第 3、4 行一行声明了多个常量
  for (const m of src.matchAll(/^const ([^;]+);/gm)) for (const part of m[1].split(',')) {
    const name = part.trim().match(/^([A-Za-z_$][\w$]*)\s*=/);
    if (name) declared.add(name[1]);
  }
  const load = fs.readFileSync(path.join(ROOT, 'src/components/paint/load.ts'), 'utf-8');
  const bridge = load.slice(load.indexOf('window.__cab = {'), load.indexOf('async render'));
  const names = bridge
    .replace('window.__cab = {', '')
    .replace(/get T\(\) \{ return T; \},/, '')
    .split(/[,\s]+/)
    .filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  assert.ok(names.length > 40, `桥里的名字太少（${names.length}），解析坏了`);
  const missing = names.filter((n) => !declared.has(n));
  assert.deepEqual(missing, [], `上游没有这些全局：${missing.join(', ')}`);
});
