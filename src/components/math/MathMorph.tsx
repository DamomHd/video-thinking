/**
 * 公式变形（推导一步）：式子 A → 式子 B
 *
 *   <MathMorph from="a^2 + b^2" to="c^2 = a^2 + b^2" p={stroke(t, 2, 1.2)} fontSize={64} />
 *
 * 两个式子里「同一个符号」（文字相同、第几次出现相同）从 A 的位置挪到 B 的位置、按高度缩放；
 * 只在 A 里的符号先淡出，只在 B 里的后淡入 —— 和 shared/morph 的「先走、后挪、再进」同一个编排。
 * 配对规则可以用 pairs 覆盖（比如把 A 的第 2 个 x 配给 B 的第 1 个 x）。
 *
 * 测量：两个式子排版完成（KaTeX 字体就位）后各量一次符号的位置，挂 delayRender；
 * 之后每帧只按量好的数值写 transform / opacity，不再量 —— 结果确定。
 * 放在缩放过的容器（Stage 镜头）里也对：量到的屏幕坐标会按容器的实际缩放折回本地坐标。
 */

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import 'katex/dist/katex.min.css';
import { katexFontsReady, mathTokens, renderTex } from './katexKit';
import { clamp01, easeInOutCubic } from '../../shared/anim';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MathMorphProps {
  from: string;
  to: string;
  /** 0 = 式子 A，1 = 式子 B */
  p: number;
  fontSize?: number;
  color?: string;
  /** 手动配对：A 的 key → B 的 key（key 形如 "x#1"：符号 + 第几次出现，从 0 数） */
  pairs?: Record<string, string>;
  style?: React.CSSProperties;
}

export const MathMorph: React.FC<MathMorphProps> = ({ from, to, p, fontSize = 48, color = '#1A1A1A', pairs, style }) => {
  const htmlA = useMemo(() => renderTex(from), [from]);
  const htmlB = useMemo(() => renderTex(to), [to]);
  const box = useRef<HTMLDivElement>(null);
  const refA = useRef<HTMLDivElement>(null);
  const refB = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender(`KaTeX 变形测量 ${from.slice(0, 12)} → ${to.slice(0, 12)}`));
  const [ready, setReady] = useState(false);
  const plan = useRef<{
    a: { el: HTMLElement; key: string; box: Box }[];
    b: { el: HTMLElement; key: string; box: Box }[];
    match: Map<number, number>; // a 下标 → b 下标
  } | null>(null);

  React.useEffect(() => {
    let alive = true;
    katexFontsReady()
      .catch(() => undefined)
      .then(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 量一次（字体就位后）
  useLayoutEffect(() => {
    if (!ready || !box.current || !refA.current || !refB.current) return;
    const root = box.current.getBoundingClientRect();
    const scale = root.width / (box.current.offsetWidth || 1) || 1;
    const measure = (el: HTMLElement): Box => {
      const r = el.getBoundingClientRect();
      return { x: (r.left - root.left) / scale, y: (r.top - root.top) / scale, w: r.width / scale, h: r.height / scale };
    };
    const a = mathTokens(refA.current).map((t) => ({ ...t, box: measure(t.el) }));
    const b = mathTokens(refB.current).map((t) => ({ ...t, box: measure(t.el) }));
    const bIndex = new Map(b.map((t, i) => [t.key, i]));
    const match = new Map<number, number>();
    const usedB = new Set<number>();
    a.forEach((t, i) => {
      const want = pairs?.[t.key] ?? t.key;
      const j = bIndex.get(want);
      if (j !== undefined && !usedB.has(j)) {
        match.set(i, j);
        usedB.add(j);
      }
    });
    plan.current = { a, b, match };
    continueRender(handle);
    // 测量只做一次：式子或配对变了才重来（组件会被重新挂载）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // 每帧：按进度写样式
  useLayoutEffect(() => {
    const pl = plan.current;
    if (!pl) return;
    const q = clamp01(p);
    const out = easeInOutCubic(clamp01(q / 0.35)); // A 独有的先走
    const move = easeInOutCubic(clamp01((q - 0.2) / 0.6)); // 共有的挪
    const inn = easeInOutCubic(clamp01((q - 0.65) / 0.35)); // B 独有的后进
    const matchedB = new Set(pl.match.values());

    pl.a.forEach((t, i) => {
      const j = pl.match.get(i);
      t.el.style.transformOrigin = '0 0';
      if (j === undefined) {
        t.el.style.opacity = String(1 - out);
        t.el.style.transform = '';
        return;
      }
      const B = pl.b[j].box;
      const A = t.box;
      const s = A.h > 0 ? 1 + (B.h / A.h - 1) * move : 1;
      t.el.style.opacity = q >= 1 ? '0' : '1';
      t.el.style.transform = `translate(${((B.x - A.x) * move).toFixed(3)}px, ${((B.y - A.y) * move).toFixed(3)}px) scale(${s.toFixed(4)})`;
    });
    pl.b.forEach((t, j) => {
      if (matchedB.has(j)) t.el.style.opacity = q >= 1 ? '1' : '0';
      else t.el.style.opacity = String(inn);
    });
  }, [p, ready]);

  const layer: React.CSSProperties = { position: 'absolute', left: 0, top: 0, whiteSpace: 'nowrap' };
  return (
    <div ref={box} style={{ position: 'relative', fontSize, color, ...style }}>
      {/* 占位：容器尺寸取两式较宽者，外部排版不跳 */}
      <div style={{ visibility: 'hidden', display: 'grid' }}>
        <div style={{ gridArea: '1 / 1' }} dangerouslySetInnerHTML={{ __html: htmlA }} />
        <div style={{ gridArea: '1 / 1' }} dangerouslySetInnerHTML={{ __html: htmlB }} />
      </div>
      <div ref={refB} style={layer} dangerouslySetInnerHTML={{ __html: htmlB }} />
      <div ref={refA} style={layer} dangerouslySetInnerHTML={{ __html: htmlA }} />
    </div>
  );
};
