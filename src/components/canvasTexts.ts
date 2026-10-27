/**
 * 画布上的字登记给读字检查（vw readcheck）。
 *
 * 读字检查默认读 DOM 里的字；画在 Canvas 上的字（dataviz、笔刷、画法片段…）DOM 里没有，查不到。
 * 画布每帧开始时 beginCanvasTexts() 清空，画字的地方顺手 registerCanvasText(g, 字, x, y, …) 登记一下：
 * 按画布当前的变换（相机）算出屏幕上的包围盒，ReadProbe 把它和 DOM 里的字合在一起报告。
 * 只在页面内存里记，不影响画面；不开读字检查时也照样能调（没有任何开销以外的副作用）。
 * 借鉴 lemo-opuscar 的 window.TEXTS(t) 约定。
 */
import type { ReadSample } from './ReadProbe';

const KEY = '__vwCanvasTexts';

type Registry = { [KEY]?: ReadSample[] };

export function beginCanvasTexts(): void {
  if (typeof window !== 'undefined') (window as unknown as Registry)[KEY] = [];
}

export function canvasTexts(): ReadSample[] {
  return (typeof window !== 'undefined' && (window as unknown as Registry)[KEY]) || [];
}

/**
 * 登记一段画在画布上的字。x、y 是画字时用的坐标（基线），在画布当前的变换下解释。
 * alpha < 0.85、或字还在写 / 排出来（complete = false）时算「看得见但读不完整」。
 */
export function registerCanvasText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  o: { size: number; font: string; weight?: number | string; align?: 'left' | 'center' | 'right'; alpha?: number; complete?: boolean; sub?: boolean }
): void {
  if (typeof window === 'undefined' || !text.trim()) return;
  const alpha = o.alpha ?? 1;
  if (alpha < 0.05) return;
  g.save();
  g.font = `${o.weight ?? 400} ${o.size}px ${o.font}`;
  const w = g.measureText(text).width;
  g.restore();
  const left = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
  const m = g.getTransform();
  const pts = [
    [left, y - o.size * 0.9],
    [left + w, y - o.size * 0.9],
    [left, y + o.size * 0.25],
    [left + w, y + o.size * 0.25],
  ].map(([px, py]) => m.transformPoint(new DOMPoint(px, py)));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const box: [number, number, number, number] = [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
  const W = g.canvas.width;
  const H = g.canvas.height;
  if (box[2] <= 0 || box[3] <= 0 || box[0] >= W || box[1] >= H) return;
  const onScreen = box[0] >= -1 && box[1] >= -1 && box[2] <= W + 1 && box[3] <= H + 1;
  const list = canvasTexts();
  list.push({ text: text.replace(/\s+/g, ' ').trim(), box, readable: onScreen && alpha >= 0.85 && o.complete !== false, ...(o.sub ? { sub: true } : {}) });
  (window as unknown as Registry)[KEY] = list;
}
