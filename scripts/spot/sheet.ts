/**
 * spot 清单与采购单的文本输出 (对标 architecture.html §20 第 2 步)
 *   npm run spot:<片> → 生成 spot-sheet.txt 和 spot-palette.txt，然后守门
 *
 * 为什么要出成文本：这两张表是给**人**看的 ——
 *   · spot-sheet：按时间排的「这一刻要什么声音」，用来通读一遍看有没有漏、有没有堆
 *   · spot-palette：按槽汇总的检索要求，直接贴给采购的人或喂给检索命令
 * JSON 真值是给机器读的，这两张是给眼睛读的，所以排版按时间轴和层对齐。
 */

import fs from 'node:fs';
import path from 'node:path';
import { FilmAdapter, SpotAnnotation, AudioLayer } from '../../src/shared/types.js';
import { buildSfxPlan } from './plan.js';

const LAYER_ORDER: AudioLayer[] = ['MUSIC', 'VO', 'BG', 'TEX', 'RISER', 'WHOOSH', 'IMPACT', 'UI'];

export interface SheetResult {
  sheetPath: string;
  palettePath: string;
  spotCount: number;
  slotCount: number;
}

/** mm:ss.cc */
function tc(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

const pad = (s: string, n: number) => {
  // 中文按两格宽算，否则列对不齐
  const w = [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, n - w));
};

export function writeSpotSheet(adapter: FilmAdapter): SheetResult {
  const outDir = path.join(process.cwd(), 'out', adapter.filmId);
  fs.mkdirSync(outDir, { recursive: true });

  const spots = [...adapter.spots()].sort((a, b) => a.fromSec - b.fromSec);
  const scenes = adapter.timeline.scenes;
  const hits = adapter.hits();
  const typings = adapter.typings();
  const { plan, skippedCovered, skippedUnpurchased } = buildSfxPlan(adapter);
  const planned = new Set(plan.map((p) => p.slot + '·' + p.what));

  /* ── spot-sheet.txt ── */
  const sheet: string[] = [];
  sheet.push(`spot 清单 · ${adapter.title}（${adapter.filmId}）`);
  sheet.push(`全片 ${adapter.timeline.totalSeconds.toFixed(2)}s · ${scenes.length} 幕 · ` +
    `${spots.length} 条标注 · 计划 ${plan.length} 条`);
  sheet.push('='.repeat(96));
  sheet.push('');

  // 按幕分组，幕内按时间；拍点和打字段穿插进去
  for (const scene of scenes) {
    sheet.push(`── ${tc(scene.start)} ─ ${tc(scene.end)}  幕 [${scene.id}] ${scene.label}` +
      (scene.overlap > 0 ? `  (交叠 ${scene.overlap}s, ${scene.enter})` : ''));

    const inScene = <T extends { sec?: number; fromSec?: number }>(x: T) => {
      const t = x.sec ?? x.fromSec ?? -1;
      return t >= scene.start && t < scene.end;
    };

    const rows: { t: number; line: string }[] = [];

    for (const h of hits.filter(inScene)) {
      rows.push({
        t: h.sec,
        line: `   ${tc(h.sec)}  ${pad(`[${h.priority} ${h.want}]`, 16)} 拍点 ${h.id}` +
          (h.note ? `  —— ${h.note}` : ''),
      });
    }
    for (const s of spots.filter(inScene)) {
      const key = s.slot + '·' + s.what;
      const mark = planned.has(key) ? '✓' : skippedCovered.includes(s) ? '覆' : '缺';
      rows.push({
        t: s.fromSec,
        line: `   ${tc(s.fromSec)}  ${pad(`[${s.layer}]`, 16)} ${pad(s.slot, 18)} ${mark} ${s.what}` +
          (s.take ? `  take[${s.take[0]}–${s.take[1]}]` : '') +
          (s.force ? '  force' : ''),
      });
    }
    for (const ty of typings.filter(inScene)) {
      rows.push({
        t: ty.fromSec,
        line: `   ${tc(ty.fromSec)}  ${pad('[UI 打字]', 16)} ${pad('typing', 18)} ✓ ${ty.label} (${ty.durSec}s)`,
      });
    }

    rows.sort((a, b) => a.t - b.t);
    if (rows.length === 0) sheet.push('      （这一幕没有标注）');
    else rows.forEach((r) => sheet.push(r.line));
    sheet.push('');
  }

  sheet.push('='.repeat(96));
  sheet.push(`图例：✓ 已进计划   覆 被同层 ±0.4s 内的声音覆盖而跳过   缺 素材还没采购`);
  if (skippedUnpurchased.length > 0) {
    sheet.push('');
    sheet.push(`未采购的槽（${skippedUnpurchased.length} 条标注）:`);
    const slots = [...new Set(skippedUnpurchased.map((s) => s.slot))];
    slots.forEach((s) => sheet.push(`  - ${s}`));
    sheet.push(`  跑 vw sfx search ${adapter.filmId} ${slots.join(' ')} 补上`);
  }

  const sheetPath = path.join(outDir, 'spot-sheet.txt');
  fs.writeFileSync(sheetPath, sheet.join('\n') + '\n', 'utf-8');

  /* ── spot-palette.txt ── */
  const pal: string[] = [];
  pal.push(`采购单 · ${adapter.title}（${adapter.filmId}）`);
  pal.push(`${Object.keys(adapter.palette).length} 个槽`);
  pal.push('='.repeat(96));
  pal.push('');

  const bySlotLayer = new Map<AudioLayer, string[]>();
  for (const [slot, spec] of Object.entries(adapter.palette)) {
    const list = bySlotLayer.get(spec.layer) ?? [];
    list.push(slot);
    bySlotLayer.set(spec.layer, list);
  }

  for (const layer of LAYER_ORDER) {
    const slots = bySlotLayer.get(layer as AudioLayer);
    if (!slots || slots.length === 0) continue;
    pal.push(`── ${layer} ──`);
    for (const slot of slots.sort()) {
      const spec = adapter.palette[slot];
      const uses = spots.filter((s) => s.slot === slot).length;
      pal.push(`  ${slot}`);
      pal.push(`    检索  ${spec.tags}${spec.alt ? `  |  备选: ${spec.alt}` : ''}`);
      pal.push(
        `    要求  时长 ${spec.dur[0]}–${spec.dur[1]}s · 变体 ${spec.variants} · 对齐 ${spec.align} · 增益 ×${spec.gain}` +
          (spec.mood ? ` · 情绪 ${spec.mood}` : '') +
          (spec.ucs ? ` · UCS ${spec.ucs.join('/')}` : '')
      );
      pal.push(`    用量  ${uses} 处`);
      pal.push('');
    }
  }

  const palettePath = path.join(outDir, 'spot-palette.txt');
  fs.writeFileSync(palettePath, pal.join('\n') + '\n', 'utf-8');

  return {
    sheetPath,
    palettePath,
    spotCount: spots.length,
    slotCount: Object.keys(adapter.palette).length,
  };
}
