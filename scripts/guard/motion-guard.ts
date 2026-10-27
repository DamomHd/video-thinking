/**
 * 运动连续性守门 (Motion Guard)
 *
 * 现有的 scan-flicker 只查「硬切」（相邻帧差 > 60），
 * 它能保证片子**没坏**，但保证不了片子**丝滑**。实测暴露出三类它查不出的问题：
 *
 *   1. 动效幅度太小 —— 声明的动画时长明明有 0.6–1.6s，但逐帧变化量峰值只有 0.01–0.17，
 *      低于 0.2 的可辨识下限。原因不是时长，是**变化的面积太小**：
 *      一条 1.4px 的细线渐进画出来，每帧只改动几个像素，测不到，人也几乎看不到。
 *      参考片动的是满幅线条、成百上千的点这类大面积元素，所以稳稳落在 0.2–1 档。
 *   2. 中等幅度跳变 —— 亮暗之间 250ms 的交叉淡化，糊成 15 帧灰浆
 *   3. 全片缺乏细微运动 —— 0.2–1 那一档占比 0%，画面要么冻住要么突变
 *
 * 判据取自一条真实参考片的实测值（185s）：
 *   有动作 73 段 · 段中位时长 0.26s · 细微运动帧 15% · 大幅跳变帧 0%
 *
 * 口径：320×180 灰度，**按固定 30Hz 取样**后相邻取样的平均绝对差（0–255）。
 *
 * 为什么要归一化到 30Hz 而不是直接用相邻帧：
 *   同样的观感运动，60fps 的片子每帧变化量天然只有 30fps 的一半。
 *   直接比逐帧差会把 60fps 的片子系统性判得「更死」，
 *   而这跟它实际看起来动不动没有关系。
 *   取样间隔固定成 1/30 秒之后，不同帧率的片子才可比。
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** 分析分辨率 —— 太小会把细线和小字的运动抹掉（96×54 实测会把 15% 误报成 1%） */
const ANALYZE_W = 320;
const ANALYZE_H = 180;

/** 取样频率：所有片子都归一化到这个频率再比，消掉帧率差异 */
const SAMPLE_HZ = 30;

/** 变化量分档（相邻帧平均绝对差） */
const BAND = {
  /** 低于此值视为完全静止 */
  still: 0.2,
  /** 细微运动上限 —— 这一档是「画面活着」的证据 */
  subtle: 1,
  /** 明显运动上限 */
  visible: 5,
  /**
   * 超过此值才算「糊」。
   * 标定依据：参考片里最大的正常动作峰值是 6（一次大元素位移，持续 407ms，看起来完全正常），
   * 而糊掉的淡化峰值是 16–17。取 8 能干净地把两者分开 ——
   * 一开始取 3 会把正常的大动作也圈进来，参考片直接被判不通过。
   */
  mush: 8,
  /** 超过此值算硬切 */
  cut: 18,
} as const;

export interface MotionThresholds {
  /** 动作段时长中位数不得低于（秒） */
  minMedianActionSec: number;
  /**
   * 单个动作段时长不得低于（帧）。
   * 用帧不用秒：聚段的最小长度就是 2 帧，27fps 下正好 74ms。
   * 按秒设 0.08s 会把所有 2 帧段都报成「过短」—— 那是检测下限，不是缺陷。
   */
  minActionFrames: number;
  /** 细微运动帧占比不得低于 */
  minSubtleRatio: number;
  /** 中等跳变（3–18）的持续时长上限（秒）—— 超过说明是糊的淡化而不是干脆的切 */
  maxMushSec: number;
}

export const DEFAULT_THRESHOLDS: MotionThresholds = {
  minMedianActionSec: 0.15,
  minActionFrames: 3,
  minSubtleRatio: 0.08,
  maxMushSec: 0.12,
};

export interface ActionSegment {
  fromSec: number;
  toSec: number;
  durSec: number;
  peak: number;
}

export interface MotionReport {
  ok: boolean;
  fps: number;
  frames: number;
  durationSec: number;
  /** 各档帧占比 */
  bands: { still: number; subtle: number; visible: number; large: number };
  /** 有动作的段 */
  actions: ActionSegment[];
  medianActionSec: number;
  /** 中等跳变段（糊的转场） */
  mushy: ActionSegment[];
  /** 单帧硬切的时刻 */
  cuts: number[];
  errors: string[];
  warnings: string[];
}

function decodeGrayDiffs(
  file: string,
  limitSec?: number
): { diffs: number[]; fps: number; frames: number; sampleHz: number } {
  const fpsRaw = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate',
    '-of', 'default=nw=1:nk=1',
    file,
  ])
    .toString()
    .trim();
  const [num, den] = fpsRaw.split('/').map(Number);
  const fps = den ? num / den : num;

  /**
   * 流式处理，不把整段原始灰度缓进内存。
   *
   * 一条 287s @60fps 的片子在 320×180 下是约 1GB 原始数据，
   * 一次性 buffer 会让这道守门在出片流程里直接超时（实测 >120s 还没出结果）。
   * 这里逐块累加，内存里只留上一帧。
   */
  const frameBytes = ANALYZE_W * ANALYZE_H;
  const diffs: number[] = [];

  /** 每隔 step 帧取一次样，把不同帧率拉齐到 SAMPLE_HZ */
  const step = Math.max(1, Math.round(fps / SAMPLE_HZ));

  let prev: Uint8Array | null = null;
  let cur: Uint8Array = new Uint8Array(frameBytes);
  let filled = 0;
  let frames = 0;

  const child = spawnSync(
    'ffmpeg',
    [
      '-v', 'error',
      ...(limitSec ? ['-t', String(limitSec)] : []),
      '-i', file,
      '-vf', `scale=${ANALYZE_W}:${ANALYZE_H},format=gray`,
      '-f', 'rawvideo',
      '-',
    ],
    { maxBuffer: 1024 * 1024 * 1024 }
  );
  const raw = child.stdout;
  if (!raw || raw.length === 0) return { diffs: [], fps, frames: 0, sampleHz: fps };

  for (let off = 0; off < raw.length; ) {
    const take = Math.min(frameBytes - filled, raw.length - off);
    cur.set(raw.subarray(off, off + take), filled);
    filled += take;
    off += take;
    if (filled < frameBytes) break;

    frames++;
    if (frames % step === 0) {
      if (prev) {
        let acc = 0;
        for (let k = 0; k < frameBytes; k++) acc += Math.abs(cur[k] - prev[k]);
        diffs.push(acc / frameBytes);
      }
      // 交换缓冲区，内存里始终只有两帧
      const swap: Uint8Array = prev ?? new Uint8Array(frameBytes);
      prev = cur;
      cur = swap;
    }
    filled = 0;
  }

  return { diffs, fps, frames, sampleHz: fps / step };
}

/** 断开不超过这么多个取样的相邻动作段视为同一段 */
const MERGE_GAP = 3;

function mergeClose(segs: ActionSegment[], gapSec: number): ActionSegment[] {
  const out: ActionSegment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && s.fromSec - last.toSec <= gapSec + 1e-9) {
      last.toSec = s.toSec;
      last.durSec = last.toSec - last.fromSec;
      last.peak = Math.max(last.peak, s.peak);
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

/** 把连续满足条件的帧聚成段 */
function segments(
  diffs: number[],
  fps: number,
  lo: number,
  hi: number,
  minFrames = 2
): ActionSegment[] {
  const out: ActionSegment[] = [];
  let start = -1;
  let peak = 0;
  for (let i = 0; i < diffs.length; i++) {
    const v = diffs[i];
    if (v >= lo && v < hi) {
      if (start < 0) {
        start = i;
        peak = 0;
      }
      peak = Math.max(peak, v);
    } else if (start >= 0) {
      if (i - start >= minFrames) {
        out.push({
          fromSec: start / fps,
          toSec: i / fps,
          durSec: (i - start) / fps,
          peak: Math.round(peak * 10) / 10,
        });
      }
      start = -1;
    }
  }
  if (start >= 0 && diffs.length - start >= minFrames) {
    out.push({
      fromSec: start / fps,
      toSec: diffs.length / fps,
      durSec: (diffs.length - start) / fps,
      peak: Math.round(peak * 10) / 10,
    });
  }
  return out;
}

export interface CheckOptions extends Partial<MotionThresholds> {
  /**
   * 只分析前 N 秒。
   * 一条 287s@60fps 的片子解完要一分多钟，测试里验标定用不着全片 ——
   * 前 60s 足够覆盖各种节奏，而且能把测试套件从几分钟拉回几秒。
   */
  limitSec?: number;
}

export function checkMotion(file: string, options: CheckOptions = {}): MotionReport {
  const { limitSec, ...thresholds } = options;
  const th = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(file)) {
    return {
      ok: false,
      fps: 0,
      frames: 0,
      durationSec: 0,
      bands: { still: 0, subtle: 0, visible: 0, large: 0 },
      actions: [],
      medianActionSec: 0,
      mushy: [],
      cuts: [],
      errors: [`成片不存在: ${file}`],
      warnings: [],
    };
  }

  const { diffs, fps, frames, sampleHz } = decodeGrayDiffs(file, limitSec);
  if (diffs.length === 0) {
    return {
      ok: false,
      fps,
      frames,
      durationSec: 0,
      bands: { still: 0, subtle: 0, visible: 0, large: 0 },
      actions: [],
      medianActionSec: 0,
      mushy: [],
      cuts: [],
      errors: ['解不出帧'],
      warnings: [],
    };
  }

  const n = diffs.length;
  const ratio = (lo: number, hi: number) =>
    diffs.filter((d) => d >= lo && d < hi).length / n;

  const bands = {
    still: ratio(0, BAND.still),
    subtle: ratio(BAND.still, BAND.subtle),
    visible: ratio(BAND.subtle, BAND.visible),
    large: ratio(BAND.visible, Infinity),
  };

  // 有动作的段（排除硬切本身）
  /**
   * 滞回：断开不超过 MERGE_GAP 个取样（100ms）的相邻段合并成一段。
   *
   * 镜头持续缓慢推近时，逐帧变化量就在 0.2 的阈值上下抖，
   * 不合并会被切成一大堆两三帧的碎段 —— 实测 anlan-report 细微运动占 35%
   * （比两个标杆都高），动作段中位数却只有 0.07s，被误判成「元素是蹦出来的」。
   * 人眼看到的是一段连续的运动，统计口径要跟人眼一致。
   */
  const actions = mergeClose(segments(diffs, sampleHz, BAND.still, BAND.cut, 2), MERGE_GAP / sampleHz);
  const durs = actions.map((a) => a.durSec).sort((a, b) => a - b);
  const medianActionSec = durs.length ? durs[Math.floor(durs.length / 2)] : 0;

  // 单帧硬切
  const cuts: number[] = [];
  diffs.forEach((d, i) => {
    if (d >= BAND.cut) cuts.push(Math.round((i / sampleHz) * 100) / 100);
  });

  /**
   * 糊掉的转场：高幅度持续一段时间，**且不挨着硬切**。
   * 硬切前后一两帧本来就会有剧烈变化（内容整个换掉的肩部），
   * 那是干脆的切的一部分，不是糊 —— 不排除的话参考片的两次亮暗切换会被误报。
   */
  const nearCut = (seg: ActionSegment) =>
    cuts.some((c) => c >= seg.fromSec - 4 / sampleHz && c <= seg.toSec + 4 / sampleHz);
  /**
   * 「糊」这条判据只在**静态风格**的片子上成立。
   *
   * 两个标杆的实测差别极大：
   *   迁移汇报（会动的图纸）静止 82%，全片 3 次硬切
   *   loomcare（真正的影片）静止 38%，112 次硬切，有机位运动和 3D 场景
   *
   * 在静态片里，中高幅度持续两百多毫秒基本只能是「淡化糊了」；
   * 在动态片里，那就是正常的推拉摇移 —— 拿同一把尺子量会把 loomcare 判红。
   * 所以按片子自身的风格决定要不要查这一条，而不是强加一种节奏。
   */
  const staticStyle = bands.still > 0.65;
  const mushy = staticStyle
    ? segments(diffs, sampleHz, BAND.mush, BAND.cut, 2).filter(
        (m) => m.durSec > th.maxMushSec && !nearCut(m)
      )
    : [];

  /* ── 判定 ── */

  if (actions.length === 0) {
    errors.push('全片没有任何可辨识的运动段 —— 这是一组静态图，不是影片');
  } else if (medianActionSec < th.minMedianActionSec) {
    /**
     * 这里要分清两种成因，给错方向的建议比不给还糟：
     *   · 动作少**且**峰值低 → 幅度问题：动的元素面积太小，不是时长不够
     *   · 动作多但每段都短   → 时长问题：动画本身写得太急
     */
    /**
     * 用**中位**峰值而不是最大值：转场那一两段的峰值动辄十几，
     * 取 max 会把它当成「幅度够了」，于是给出错误的时长建议（实测踩过）。
     */
    const peaks = actions.map((a) => a.peak).sort((x, y) => x - y);
    const peakMedian = peaks[Math.floor(peaks.length / 2)];
    const faint = peakMedian < BAND.subtle * 2;
    errors.push(
      faint
        ? `动作段中位 ${medianActionSec.toFixed(3)}s、峰值中位只有 ${peakMedian.toFixed(2)} —— ` +
            `这是**幅度**问题不是时长问题：动的元素面积太小（细线、小字、小圆点），` +
            `渐进变化每帧只改几个像素，低于 ${BAND.still} 的可辨识下限。` +
            `办法是让大面积的东西动起来 —— 用 shared/motion 的 drift() 给底纹/整版加长周期微位移，` +
            `或者把主结构画得更粗、面积更大`
        : `动作段时长中位数 ${medianActionSec.toFixed(3)}s（${(medianActionSec * sampleHz).toFixed(1)} 个取样）` +
            `低于下限 ${th.minMedianActionSec}s —— 元素是「蹦」出来的，不是「长」出来的。` +
            `用 shared/motion 的 draw()，它会强制铺够时长`
    );
  }

  const minActionSec = th.minActionFrames / sampleHz;
  const tooShort = actions.filter((a) => a.durSec < minActionSec - 1e-6);
  if (tooShort.length > 0) {
    warnings.push(
      `${tooShort.length} 个动作段短于 ${th.minActionFrames} 帧（${(minActionSec * 1000).toFixed(0)}ms）: ` +
        tooShort.slice(0, 6).map((a) => `${a.fromSec.toFixed(2)}s(${(a.durSec * 1000).toFixed(0)}ms)`).join(' ')
    );
  }

  if (bands.subtle < th.minSubtleRatio) {
    errors.push(
      `细微运动帧只占 ${(bands.subtle * 100).toFixed(1)}%，低于 ${(th.minSubtleRatio * 100).toFixed(0)}% —— ` +
        `画面要么完全冻住要么突变，中间那条让人觉得「活着」的带子是空的。` +
        `用 shared/motion 的 drift() / breathe() 给底纹或标注加上长周期的缓慢位移`
    );
  }

  if (mushy.length > 0) {
    errors.push(
      `${mushy.length} 处中等幅度跳变持续超过 ${th.maxMushSec}s（静态风格的片子才查这条）—— ` +
        `典型是亮暗之间的短淡化糊成了灰浆。要么改成硬切，要么铺够 0.8s:\n` +
        mushy
          .slice(0, 5)
          .map((m) => `      ${m.fromSec.toFixed(2)}s → ${m.toSec.toFixed(2)}s (${(m.durSec * 1000).toFixed(0)}ms, 峰值 ${m.peak})`)
          .join('\n')
    );
  }

  return {
    ok: errors.length === 0,
    fps,
    frames,
    durationSec: Math.round((frames / fps) * 1000) / 1000,
    bands,
    actions,
    medianActionSec: Math.round(medianActionSec * 1000) / 1000,
    mushy,
    cuts,
    errors,
    warnings,
  };
}

/** 一行摘要，给 CLI 用 */
export function formatMotionSummary(r: MotionReport): string {
  return (
    `动作 ${r.actions.length} 段 · 中位 ${r.medianActionSec.toFixed(2)}s · ` +
    `静止 ${(r.bands.still * 100).toFixed(0)}% / 细微 ${(r.bands.subtle * 100).toFixed(0)}% / ` +
    `明显 ${(r.bands.visible * 100).toFixed(0)}% / 大幅 ${(r.bands.large * 100).toFixed(0)}% · ` +
    `硬切 ${r.cuts.length} 处`
  );
}
