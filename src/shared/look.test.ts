import { test } from 'node:test';
import assert from 'node:assert/strict';
import { secToFrame, evenTimes } from '../../scripts/look/stills.js';
import { parseExperience, selectEntries, formatEntry } from '../../scripts/look/learn.js';

test('secToFrame：按合成 fps 换算、四舍五入、夹在合成范围内', () => {
  assert.equal(secToFrame(28.2, 30, 1350), 846);
  assert.equal(secToFrame(-1, 30, 1350), 0);
  assert.equal(secToFrame(99, 30, 1350), 1349);
});

test('evenTimes：每格取中点，不取首尾', () => {
  assert.deepEqual(evenTimes(40, 4), [5, 15, 25, 35]);
});

test('经验：解析三种 kind、按主题筛、用户偏好排最前；写入要有内容和证据', () => {
  const md = [
    '# 经验',
    '- [observed] (设计, 组件) 卡片阴影会推成演示文稿 —— 证据：anlan-film（2026-10-26）',
    '- [preference] (设计) 目标是高级感 —— 证据：对话（2026-10-26）',
    '- [verified] (声音) 第一帧不要淡入 —— 证据：两部片（2026-10-26）',
    '随便一行不算',
  ].join('\n');
  const all = parseExperience(md);
  assert.equal(all.length, 3);
  assert.deepEqual(all[0].topics, ['设计', '组件']);
  const d = selectEntries(all, ['设计']);
  assert.deepEqual(d.map((e) => e.kind), ['preference', 'observed']);
  assert.equal(selectEntries(all, []).length, 3);
  assert.match(formatEntry('observed', ['节奏'], '快片要有爆发', 'x 片', '2026-10-27'), /^- \[observed\] \(节奏\) 快片要有爆发 —— 证据：x 片（2026-10-27）$/);
  assert.throws(() => formatEntry('observed', [], '内容', '', '2026-10-27'), /证据/);
});

test('连拍帧号：含两端、夹在合成范围内、反着写也行', async () => {
  const { stripFrames, cropFilter } = await import('../../scripts/look/stills');
  assert.deepEqual(stripFrames(1.0, 1.1, 30, 300), [30, 31, 32, 33]);
  assert.deepEqual(stripFrames(1.1, 1.0, 30, 300), [30, 31, 32, 33]);
  assert.deepEqual(stripFrames(9.9, 20, 30, 300), [297, 298, 299]);
  assert.equal(cropFilter([10.4, 20.6, 300, 1]), 'crop=300:2:10:21');
});
