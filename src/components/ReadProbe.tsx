/**
 * 读字检查的采集端（只在 inputProps.readcheck 为真时由 FilmShell 挂上，出片时不存在）
 *
 * 每一帧画好之后，扫一遍页面上的文字：按「块」归并（逐字动画会把一句话拆成一堆 span，归到最近的块级祖先），
 * 记下块的完整文字、包围盒、是否完整可读（每个字的累计不透明度 ≥ 0.85、没被隐藏、整块在画面内），
 * 用 console.log 交给 Node 端（scripts/guard/readcheck.ts，通过 renderFrames 的 onBrowserLog 收）。
 * 借鉴 lemo-opuscar core/render/readcheck.mjs 的 window.TEXTS(t) 约定；DOM 里的字直接读，画在 Canvas 上的字由画布登记（canvasTexts.ts）。
 */
import { useEffect } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { canvasTexts } from './canvasTexts';

export const READCHECK_TAG = '[readcheck]';

/** 一个文字块：完整文字、包围盒、是否完整可读 */
export interface ReadSample {
  text: string;
  box: [number, number, number, number];
  readable: boolean;
  /** 烧进画面的字幕（Subtitles 组件，data-subtitle） */
  sub?: boolean;
}

function effectiveOpacity(el: Element): number {
  let o = 1;
  for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    o *= Number(cs.opacity);
  }
  return o;
}

/** 横向排列（flex 行）、总字数不超过 60、不铺满画面的容器 */
function isRowContainer(e: Element): boolean {
  const cs = getComputedStyle(e);
  if (!cs.display.endsWith('flex') || cs.flexDirection.startsWith('column')) return false;
  if ((e.textContent ?? '').replace(/\s+/g, '').length > 60) return false;
  // 只并「一行」：铺满画面的容器（舞台、全屏层）不算
  const r = e.getBoundingClientRect();
  return r.width < window.innerWidth * 0.9 && r.height < window.innerHeight * 0.25;
}

/**
 * 文字所在的「块」：最近的非行内祖先。
 * 只有一两个字的块（翻牌板的格、逐格排开的字）单独读没有意义：往上最多 4 层，并到最近的横向一行。
 */
function blockOf(el: Element): Element {
  if (el instanceof SVGElement) return el.closest('text') ?? el;
  let e: Element = el;
  while (e.parentElement && e.parentElement !== document.body && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement;
  if ((e.textContent ?? '').replace(/\s+/g, '').length > 2) return e;
  let cur: Element = e;
  for (let i = 0; i < 4 && cur.parentElement && cur.parentElement !== document.body; i++) {
    cur = cur.parentElement;
    if (isRowContainer(cur)) return cur;
  }
  return e;
}

export function collectTexts(): ReadSample[] {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const blocks = new Map<Element, Element[]>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent || !n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('script, style')) continue;
    const b = blockOf(el);
    const list = blocks.get(b) ?? [];
    list.push(el);
    blocks.set(b, list);
  }
  const out: ReadSample[] = [];
  for (const [b, els] of blocks) {
    const text = (b.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const r = b.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const onScreen = r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1;
    const anyVisible = r.right > 0 && r.bottom > 0 && r.left < W && r.top < H;
    if (!anyVisible) continue;
    const minOpacity = Math.min(...els.map(effectiveOpacity));
    if (minOpacity < 0.05 && effectiveOpacity(b) < 0.05) continue;
    out.push({
      text,
      box: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
      readable: onScreen && minOpacity >= 0.85,
      ...(b.closest('[data-subtitle]') ? { sub: true } : {}),
    });
  }
  return out;
}

export const ReadProbe: React.FC = () => {
  const frame = useCurrentFrame();
  useEffect(() => {
    const handle = delayRender(`读字检查 ${frame}`);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    // 等这一帧的其它 effect（逐字聚焦、投影标注…）都落定再读
    const raf = requestAnimationFrame(() => {
      // DOM 里的字 + 画布登记的字（canvasTexts.ts）
      console.log(READCHECK_TAG + JSON.stringify({ f: frame, t: [...collectTexts(), ...canvasTexts()] }));
      release();
    });
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [frame]);
  return null;
};
