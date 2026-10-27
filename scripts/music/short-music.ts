/**
 * 衍生片配乐产出 (short-music)
 * 对标 architecture.html §6.5：短片的配乐是**离线**产出的，不走 Remotion 的 startFrom。
 *
 * 顺序很重要：先出配乐 → 实测它的 drop → 画面的小节网格跟着这个实测值排。
 * 反过来（先定一个秒数再逼配乐对上）就是在用假数字对拍。
 * 产出写进 src/films/<片>/short/music.json，画面侧读它。
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateFilmScoreWav } from '../composer/engine.js';
import { analyzeMusicFile } from '../sync/analyze.js';
import { cutMusic } from './cut.js';

export interface ShortMusicSpec {
  /** 相对 public/ */
  file: string;
  bpm: number;
  /** 采用的 drop 落点（秒） */
  dropSec: number;
  /** dropSec 的来源：score = 乐谱里 !hit! 的位置；measured = 能量检测 */
  dropFrom?: 'score' | 'measured';
  /** 自相关估出来的 bpm（对照用；作曲产出以我们定的速度为准） */
  measuredBpm?: number;
  /** 能量检测认为的 drop（对照用） */
  measuredDropSec?: number;
  durSec: number;
  /** 来源：compose = 作曲引擎按结构生成；cut = 从源曲离线剪 */
  source: 'compose' | 'cut';
  /** 剪辑时的接缝信息 */
  seam?: { kind: string; region: [number, number]; cost: number };
  measuredAt: string;
}

export interface BuildShortMusicOptions {
  filmId: string;
  /** 目标长度（秒）—— 由画面要几个小节决定 */
  targetSec: number;
  bpm: number;
  /** 优先尝试从这首源曲剪；剪不出来就用作曲引擎生成 */
  srcRel?: string;
  /** 希望 drop 落在哪一秒（只是期望，实测为准） */
  preferDropSec?: number;
  outRel?: string;
}

export async function buildShortMusic(
  options: BuildShortMusicOptions
): Promise<ShortMusicSpec> {
  const { filmId, targetSec, bpm } = options;
  const outRel = options.outRel ?? `music/${filmId}-short.wav`;
  const specPath = path.join(process.cwd(), 'src', 'films', filmId, 'short', 'music.json');

  let source: ShortMusicSpec['source'] = 'compose';
  let seam: ShortMusicSpec['seam'];

  // ① 先试离线剪：有合适的源曲就不用再作曲
  if (options.srcRel && options.preferDropSec !== undefined) {
    const cut = cutMusic({
      srcRel: options.srcRel,
      outRel,
      targetSec,
      dropAtSec: options.preferDropSec,
      nominalBpm: bpm,
    });
    if (cut.ok && cut.verified) {
      source = 'cut';
      seam = cut.region
        ? { kind: cut.kind ?? 'cut', region: cut.region, cost: cut.seamCost ?? 0 }
        : undefined;
      console.log(
        `[short-music] 离线剪成功：${cut.kind} ${JSON.stringify(cut.region)}，接缝代价 ${cut.seamCost}`
      );
    } else {
      console.log(`[short-music] 离线剪不可用（${cut.reason}）→ 改用作曲引擎按结构生成`);
    }
  }

  // ② 剪不出来就作曲：乐谱自带 4 小节前奏，hit 钉在第 5 小节头
  let authoredDropSec: number | undefined;
  if (source === 'compose') {
    const composed = await generateFilmScoreWav(filmId, {
      scoreId: `${filmId}-short`,
      outputPath: path.join(process.cwd(), 'public', outRel),
      totalSec: targetSec,
      bpm,
      dropSec: options.preferDropSec,
    });
    authoredDropSec = composed.cueSecs.find((c) => c.type === 'hit')?.sec;
  }

  // ③ 实测
  const grid = analyzeMusicFile(outRel, { nominalBpm: bpm });
  if (grid.source !== 'measured') {
    throw new Error(`[short-music] 产物无法真实分析: ${outRel}`);
  }

  /**
   * drop 取哪个值：
   *   · 作曲产出 —— 用乐谱里 !hit! 的位置。这是作者钉下的事实，不是推断；
   *     对自己写的曲子还去"猜"最响的小节，是把已知信息扔掉。
   *   · 离线剪产出 —— 内容不是我们写的，只能靠实测。
   * 两者不一致时如实报出来，方便发现检测器或乐谱哪边有问题。
   */
  const dropSec = authoredDropSec ?? grid.dropSec;
  const disagree =
    authoredDropSec !== undefined && Math.abs(authoredDropSec - grid.dropSec) > grid.barSec;
  if (disagree) {
    console.warn(
      `[short-music] 注意：乐谱标注的 hit 在 ${authoredDropSec}s，但能量检测认为最响的小节在 ` +
        `${grid.dropSec}s（差 ${Math.abs(authoredDropSec! - grid.dropSec).toFixed(2)}s）。` +
        `\n              以乐谱标注为准；差距大通常说明乐谱的高潮写得不够突出。`
    );
  }

  // bpm 同理：作曲产出的速度是我们定的，不该再去估一遍
  const specBpm = source === 'compose' ? bpm : Math.round(grid.bpm * 100) / 100;

  const spec: ShortMusicSpec = {
    file: outRel,
    bpm: specBpm,
    measuredBpm: Math.round(grid.bpm * 100) / 100,
    dropSec,
    dropFrom: authoredDropSec !== undefined ? 'score' : 'measured',
    measuredDropSec: grid.dropSec,
    durSec: grid.totalSec,
    source,
    seam,
    measuredAt: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(specPath), { recursive: true });
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2), 'utf-8');

  console.log(
    `[short-music] ${outRel}  来源=${source}  bpm=${spec.bpm}  drop=${spec.dropSec}s` +
      `（取自${spec.dropFrom === 'score' ? '乐谱标注' : '能量检测'}，检测值 ${spec.measuredDropSec}s）  长=${spec.durSec}s`
  );
  console.log(`[short-music] 已写入 ${path.relative(process.cwd(), specPath)}（画面网格读这个值）`);

  return spec;
}
