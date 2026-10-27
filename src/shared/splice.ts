/**
 * 代码动画 × AI 视频的拼接过渡（纯函数）
 *
 * 分工：文字、数据、UI、排版、卡点交给代码；穿门、人物动作、画风裂变这类连续复杂动作交给视频模型（可灵 / Runway / Seedance …）。
 * 两边在接缝处交接：代码动画导出交接帧当视频模型的首帧，生成的片段再用遮罩接回来。
 *
 * 这里只算「这一刻片段该露出多少、怎么露」，输出 CSS（opacity / mask-image），不碰 DOM、确定性。
 * 遮罩都带软边：硬边遮罩在两种画风之间会露出一条刀口。
 */

import { clamp01, easeInOutCubic } from './anim';

export type SpliceTransition =
  | { kind: 'cut' }
  | { kind: 'fade'; durSec: number }
  /** 圆形从 (cx, cy) 张开（画面归一化坐标），软边 feather 占对角线比例 */
  | { kind: 'iris'; durSec: number; cx?: number; cy?: number; feather?: number }
  /** 从一侧扫过来，angleDeg：0 = 从左往右，90 = 从上往下 */
  | { kind: 'wipe'; durSec: number; angleDeg?: number; feather?: number };

export interface SpliceStyle {
  visible: boolean;
  opacity: number;
  /** CSS mask-image；undefined = 不遮罩 */
  maskImage?: string;
}

/** 遮罩进度 p（0 = 全遮住，1 = 全露出）→ CSS */
export function spliceMask(tr: SpliceTransition, p: number): SpliceStyle {
  const q = easeInOutCubic(clamp01(p));
  if (tr.kind === 'cut') return { visible: q > 0 || p >= 0, opacity: 1 };
  if (tr.kind === 'fade') return { visible: q > 0, opacity: q };
  if (q >= 1) return { visible: true, opacity: 1 };
  if (q <= 0) return { visible: false, opacity: 0 };
  const feather = Math.max(0.005, tr.feather ?? 0.06);
  if (tr.kind === 'iris') {
    const cx = (tr.cx ?? 0.5) * 100;
    const cy = (tr.cy ?? 0.5) * 100;
    // farthest-corner 半径按 0→(1+feather) 走，结束时软边也完全出画
    const r = q * (100 + feather * 100);
    const inner = Math.max(0, r - feather * 100);
    return {
      visible: true,
      opacity: 1,
      maskImage: `radial-gradient(circle farthest-corner at ${cx.toFixed(2)}% ${cy.toFixed(2)}%, #000 ${inner.toFixed(2)}%, transparent ${r.toFixed(2)}%)`,
    };
  }
  const angle = (tr.angleDeg ?? 0) + 90; // CSS 的 0deg 是从下往上
  const edge = q * (100 + feather * 100);
  const inner = Math.max(0, edge - feather * 100);
  return {
    visible: true,
    opacity: 1,
    maskImage: `linear-gradient(${angle}deg, #000 ${inner.toFixed(2)}%, transparent ${edge.toFixed(2)}%)`,
  };
}

/**
 * 片段在本地时间 u（秒，0 = 片段第一帧）的整体样式：入场过渡、出场过渡（出场是入场的反向）。
 * 片段之外（u < 0 或 u ≥ dur）不可见。
 */
export function spliceStyleAt(
  u: number,
  durSec: number,
  tin: SpliceTransition = { kind: 'cut' },
  tout: SpliceTransition = { kind: 'cut' }
): SpliceStyle {
  if (u < 0 || u >= durSec) return { visible: false, opacity: 0 };
  const inDur = tin.kind === 'cut' ? 0 : tin.durSec;
  const outDur = tout.kind === 'cut' ? 0 : tout.durSec;
  if (inDur > 0 && u < inDur) return spliceMask(tin, u / inDur);
  if (outDur > 0 && u > durSec - outDur) return spliceMask(tout, (durSec - u) / outDur);
  return { visible: true, opacity: 1 };
}

/**
 * 接缝判定：两帧的 SSIM（0..1）+ 平均亮度差（0..255）→ 结论。
 * 阈值是经验值：≥0.9 硬切看不出；0.75–0.9 用软遮罩或淡化能盖住；更低说明首帧根本没对上（构图或画风都变了）。
 */
export function seamVerdict(ssim: number, lumaDelta: number): { level: 'ok' | 'mask' | 'mismatch'; note: string } {
  const color = Math.abs(lumaDelta) > 12 ? `；亮度差 ${lumaDelta.toFixed(0)}，生成片段调色要往原画面靠` : '';
  if (ssim >= 0.9) return { level: 'ok', note: `SSIM ${ssim.toFixed(3)}，硬切即可${color}` };
  if (ssim >= 0.75) return { level: 'mask', note: `SSIM ${ssim.toFixed(3)}，建议 iris / wipe 软遮罩或 ≥0.4s 淡化${color}` };
  return { level: 'mismatch', note: `SSIM ${ssim.toFixed(3)}，首尾帧没对上 —— 用 vw handoff 导出的交接帧重新生成${color}` };
}
