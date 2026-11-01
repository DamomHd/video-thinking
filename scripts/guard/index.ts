import { execSync } from 'node:child_process';
import { getFilm } from '../../src/films.js';
import { checkDeterminism, Violation } from './deterministic.js';
import { checkBeatCoverage, BeatCoverageReport } from './beat-coverage.js';
import { checkTimeline, TimelineReport } from './timeline-guard.js';
import { checkMusicCoverage } from './music-coverage.js';
import { checkStyle } from './style-guard.js';
import { checkZonesAndWarp, ZoneGuardReport } from './zone-guard.js';
import { runQaFrames, QaFramesReport } from './qa-frames.js';
import { TruthManager } from '../spot/truth.js';

export interface GuardResult {
  passed: boolean;
  typecheckOk: boolean;
  deterministicViolations: Violation[];
  beatReport: BeatCoverageReport;
  timelineReport: TimelineReport;
  zoneReport: ZoneGuardReport;
  qaFrames?: QaFramesReport;
}

/**
 * 六道质检守门（对标 architecture.html §10 + §19）
 * 1. tsc --noEmit
 * 2. 确定性静态扫描（CSS 动画 / 非种子随机 / delayRender 配对）
 * 3. 拍点覆盖与孤儿调参键
 * 4. 幕表连续性与配乐段边界
 * 5. 弹性区连续性 + 时间映射单调性与位移上限
 * 6. 抽帧视觉 QA（--qa-frames 开启，真的渲图查黑帧）
 */
export async function runGuardChecks(
  filmId: string,
  options: { qaFrames?: boolean } = {}
): Promise<GuardResult> {
  console.log(`\n========================================`);
  console.log(`[vw check] 正在对影片 '${filmId}' 执行自动化质检守门`);
  console.log(`========================================\n`);

  const film = getFilm(filmId);
  const adapter = await film.getAdapter();
  const truth = new TruthManager(filmId).readAll();

  // 1
  console.log(`[1/6] 校验全局 TypeScript 静态类型 (tsc --noEmit)...`);
  let typecheckOk = false;
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe' });
    console.log(`  ✓ TypeScript 类型校验全部通过。`);
    typecheckOk = true;
  } catch (err: any) {
    console.error(`  ✗ TypeScript 类型检查失败:\n${err.stdout?.toString() || err.message}`);
  }

  // 2
  console.log(`[2/6] 扫描 CSS 动画、非种子随机与确定性约束...`);
  const deterministicViolations = checkDeterminism(filmId);
  if (deterministicViolations.length === 0) {
    console.log(`  ✓ 确定性规则扫描全部通过（零违背）。`);
  } else {
    console.warn(`  ✗ 发现 ${deterministicViolations.length} 处确定性规则违背:`);
    deterministicViolations.forEach((v) =>
      console.warn(`    - [${v.rule}] ${v.file}:${v.line} -> ${v.detail}`)
    );
  }

  // 3
  console.log(`[3/6] 检查拍点的源码引用与调参孤儿键...`);
  const beatReport = await checkBeatCoverage(adapter);
  const beatBad =
    beatReport.unreferencedBeats.length +
    beatReport.danglingRefs.length +
    beatReport.orphanKeys.length +
    beatReport.staleIgnored.length;
  if (beatBad === 0) {
    console.log(
      `  ✓ ${beatReport.totalBeats} 个 K 键全部在适配器源码里被引用` +
        (beatReport.ignoredBeats > 0 ? `（白名单 ${beatReport.ignoredBeats} 个）` : '') +
        `，无悬空引用、无孤儿调参键。`
    );
  } else {
    if (beatReport.unreferencedBeats.length > 0) {
      console.error(
        `    ✗ K 表里有、但适配器源码里压根没引用过 (${beatReport.unreferencedBeats.length} 个): ` +
          `${beatReport.unreferencedBeats.join(', ')}\n` +
          `      要么配声，要么写进注释并说明为什么不配，要么加进 ignoredKeys`
      );
    }
    if (beatReport.danglingRefs.length > 0) {
      console.error(
        `    ✗ 源码引用了、但 K 表里已经没有 (${beatReport.danglingRefs.length} 个): ` +
          `${beatReport.danglingRefs.join(', ')}  —— 删键漏改适配器，运行时才会炸`
      );
    }
    if (beatReport.orphanKeys.length > 0) {
      console.error(
        `    ✗ 孤儿调参键 (${beatReport.orphanKeys.length} 个): ${beatReport.orphanKeys.join(', ')}`
      );
    }
    if (beatReport.staleIgnored.length > 0) {
      console.error(
        `    ✗ ignoredKeys 里列了、但 K 表里已经没有的过期条目 (${beatReport.staleIgnored.length} 个): ` +
          `${beatReport.staleIgnored.join(', ')}\n` +
          `      退役的拍点要从 K 和 ignoredKeys 里一起删干净 —— ` +
          `留在白名单里会让「还在引用退役键」这类问题查不出来`
      );
    }
  }
  // 动作事件覆盖（实现了 events() 的片子）：每个画面动作要么配了声，要么写明留白理由
  let uncovered: { id: string; kind: string }[] = [];
  if (adapter.events) {
    const { uncoveredEvents } = await import('../../src/shared/events.js');
    const evs = adapter.events();
    uncovered = uncoveredEvents(evs, adapter.spots());
    const silent = evs.filter((e) => e.silent).length;
    if (uncovered.length === 0) {
      console.log(`  ✓ 动作事件 ${evs.length} 个全部有声（其中 ${silent} 个写明了留白理由）`);
    } else {
      console.error(`    ✗ 动作事件没配声、也没写留白理由 (${uncovered.length} 个): ${uncovered.map((e) => `${e.id}[${e.kind}]`).join(', ')}`);
    }
  }

  // 只在注释里出现 = 故意不配声，必须写明理由
  for (const c of beatReport.commentOnlyBeats) {
    if (c.reason.includes('没写理由')) {
      console.warn(`    ⚠ K.${c.key} 只在注释里出现，但没说明为什么不配声`);
    } else {
      console.log(`    · K.${c.key} 故意不配声：${c.reason.replace(/^[\s/*]+/, '').slice(0, 60)}`);
    }
  }

  // 4
  console.log(`[4/6] 检查时间轴连续性与配乐段边界...`);
  const timelineReport = checkTimeline(adapter.timeline, truth.music, {
    adapter,
    sync: truth.sync,
  });
  if (timelineReport.valid) {
    console.log(
      `  ✓ 幕表连续单调递增，共 ${adapter.timeline.scenes.length} 幕，总长 ${adapter.timeline.totalSeconds.toFixed(2)}s。`
    );
  } else {
    console.error(`  ✗ 幕表 / 配乐段存在错误:\n${timelineReport.errors.map((e) => `    - ${e}`).join('\n')}`);
  }
  timelineReport.warnings.forEach((w) => console.warn(`    ⚠ ${w}`));

  // 4b. 配乐覆盖率：段里实际有没有声音（文件时长合法不代表有音乐）
  const coverage = checkMusicCoverage(truth.music);
  if (coverage.valid) {
    const st = coverage.cues.filter((c) => c.stats).map((c) => `${c.id} 静音 ${(c.stats!.silentRatio * 100).toFixed(0)}%`);
    console.log(`  ✓ 配乐覆盖率${st.length ? `：${st.join('，')}` : '（没有已选曲的配乐段）'}`);
  } else {
    console.error(`  ✗ 配乐覆盖率不足:\n${coverage.errors.map((e) => `    - ${e}`).join('\n')}`);
  }
  coverage.warnings.forEach((w) => console.warn(`    ⚠ ${w}`));

  // 4c. 风格守门（第一阶段只报警）：代码里写死的颜色是否都在色板里
  const styleReport = await checkStyle(filmId).catch(() => null);
  if (styleReport) {
    const src = styleReport.styleId ? `风格 ${styleReport.styleId} + 片子覆盖` : '片子自己的主题（未从风格派生）';
    if (styleReport.offenders.length === 0) {
      console.log(`  ✓ 色板一致：${styleReport.scannedFiles} 个文件里的颜色都在${src}的 ${styleReport.paletteSize} 色色板里`);
    } else {
      const total = styleReport.offenders.reduce((a, o) => a + o.uses.length, 0);
      console.warn(`    ⚠ 色板外颜色 ${styleReport.offenders.length} 种 / ${total} 处（色板：${src}）——先进主题再用，或确认是有意的：`);
      styleReport.offenders.slice(0, 8).forEach((o) =>
        console.warn(`      ${o.color}  ×${o.uses.length}  ${o.uses.slice(0, 3).map((u) => `${u.file}:${u.line}`).join('  ')}`)
      );
      if (styleReport.offenders.length > 8) console.warn(`      …还有 ${styleReport.offenders.length - 8} 种`);
    }
  }

  // 4d. 按片作曲：画面拍点必须落在配乐网格上（容差 1 帧），对拍映射必须是恒等
  let gridValid = true;
  if (truth.music.cues[0]?.track?.source === 'score') {
    const { loadFilmScore } = await import('../composer/score-film.js');
    const { scoreGrid, offGridHits } = await import('../../src/shared/score.js');
    const def = await loadFilmScore(filmId);
    if (!def) {
      gridValid = false;
      console.error(`  ✗ music.json 写的是按片作曲，但片子没有 audio/score.ts`);
    } else {
      const grid = scoreGrid(def.grid);
      // 画面先行（grid.lock: false）：谱贴着画面写，拍点不必在网格上
      const off = def.grid.lock === false ? [] : offGridHits(adapter.hits(), grid, 30);
      const knots = (truth.sync?.knots ?? []) as unknown[];
      if (off.length) {
        gridValid = false;
        console.error(`  ✗ ${off.length} 个画面拍点没落在配乐网格上（容差 1 帧）：\n${off.map((o) => `    - ${o.id} ${o.sec.toFixed(3)}s → 最近的${o.want === 'beat' ? '拍' : o.want === 'downbeat' || o.want === 'drop' ? '小节头' : '十六分音'} ${o.nearest.toFixed(3)}s（差 ${o.errMs} 毫秒）`).join('\n')}`);
      } else {
        console.log(def.grid.lock === false
          ? `  ✓ 按片作曲（画面先行）：谱贴着画面时刻写，不查网格`
          : `  ✓ 按片作曲：${adapter.hits().length} 个画面拍点全部落在配乐网格上（${def.grid.bpm} BPM，容差 1 帧）`);
      }
      if (knots.length > 1) {
        gridValid = false;
        console.error(`  ✗ 按片作曲的片子不该有对拍拉伸（sync.json 有 ${knots.length} 个节点）——重跑 vw music score 清成恒等`);
      }
    }
  }

  // 5
  console.log(`[5/6] 检查弹性区连续性与时间映射（位移上限 / 刚性区零位移 / 节点单调）...`);
  const zoneReport = checkZonesAndWarp(adapter.zones(), adapter.timeline.totalSeconds, truth.sync);
  if (zoneReport.valid) {
    console.log(
      `  ✓ ${zoneReport.zoneCount} 个弹性区盖满全片；映射${zoneReport.identity ? '为恒等（配乐迁就画面）' : `非恒等，最大形变比率 ${(zoneReport.maxRatio * 100).toFixed(2)}%`}。`
    );
  } else {
    console.error(`  ✗ 弹性区 / 映射存在错误:\n${zoneReport.errors.map((e) => `    - ${e}`).join('\n')}`);
  }
  zoneReport.warnings.forEach((w) => console.warn(`    ⚠ ${w}`));

  // 6
  let qaFrames: QaFramesReport | undefined;
  if (options.qaFrames) {
    console.log(`[6/6] 执行抽帧视觉 QA 守门 (remotion still + 黑帧检测)...`);
    qaFrames = runQaFrames(adapter);
    if (qaFrames.failures.length === 0) {
      console.log(`  ✓ 抽取 ${qaFrames.frames.length} 帧，未发现黑帧或渲染崩溃。`);
    } else {
      console.error(`  ✗ ${qaFrames.failures.length}/${qaFrames.frames.length} 帧异常:`);
      qaFrames.failures.forEach((f) =>
        console.error(`    - ${f.sec.toFixed(2)}s [${f.label}] ${f.reason}`)
      );
    }
  } else {
    console.log(`[6/6] 抽帧视觉 QA 守门（已跳过，加 --qa-frames 开启真实抽帧）`);
  }

  const passed =
    typecheckOk &&
    deterministicViolations.length === 0 &&
    timelineReport.valid &&
    coverage.valid &&
    gridValid &&
    zoneReport.valid &&
    beatReport.unreferencedBeats.length === 0 &&
    beatReport.danglingRefs.length === 0 &&
    beatReport.orphanKeys.length === 0 &&
    uncovered.length === 0 &&
    (!qaFrames || qaFrames.failures.length === 0);

  console.log(`\n----------------------------------------`);
  console.log(
    passed ? `[vw check] 质检全部通过！随时可以启动出片。` : `[vw check] 质检未完全通过，请按上述提示修复。`
  );
  console.log(`----------------------------------------\n`);

  return {
    passed,
    typecheckOk,
    deterministicViolations,
    beatReport,
    timelineReport,
    zoneReport,
    qaFrames,
  };
}
