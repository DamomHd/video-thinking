/**
 * 公式（KaTeX）—— 支持按符号逐个出现
 *
 *   <MathTex tex="E = mc^2" fontSize={72} progress={draw(t, 1, 1.2)} reveal="focus" />
 *
 * reveal：
 *   'none'   直接整式显示（progress 只做整体淡入）
 *   'fade'   符号按阅读顺序逐个淡入
 *   'focus'  符号逐个从模糊聚焦出来（和 FocusText 同一种拉焦手法）
 * 等 KaTeX 字体就位才出帧（delayRender）。逐符号的样式在 layout effect 里按进度写到 DOM 上 ——
 * 公式的 HTML 是静态的，每帧只改样式，所以结果确定。
 */

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { continueRender, delayRender } from 'remotion';
import 'katex/dist/katex.min.css';
import { katexFontsReady, mathTokens, renderTex } from './katexKit';
import { blurFilter, charFocus } from '../../shared/lens';

export interface MathTexProps {
  tex: string;
  display?: boolean;
  fontSize?: number;
  color?: string;
  progress?: number;
  reveal?: 'none' | 'fade' | 'focus';
  style?: React.CSSProperties;
}

export const MathTex: React.FC<MathTexProps> = ({ tex, display = true, fontSize = 48, color = '#1A1A1A', progress = 1, reveal = 'none', style }) => {
  const html = useMemo(() => renderTex(tex, display), [tex, display]);
  const ref = useRef<HTMLDivElement>(null);
  const [handle] = useState(() => delayRender(`KaTeX 字体 ${tex.slice(0, 20)}`));
  const [ready, setReady] = useState(false);

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

  useLayoutEffect(() => {
    if (!ready) return;
    continueRender(handle);
  }, [ready, handle]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || reveal === 'none') return;
    const tokens = mathTokens(root);
    const n = tokens.length;
    // 进度 0→1 映射到「最后一个符号到位」：charFocus 的 from/span 用秒，这里把进度当秒用
    tokens.forEach(({ el }, i) => {
      if (reveal === 'fade') {
        const start = n > 1 ? (i / (n - 1)) * 0.7 : 0;
        const q = Math.max(0, Math.min(1, (progress - start) / 0.3));
        el.style.opacity = String(q);
      } else {
        const f = charFocus(i, n, progress, 0, { spanSec: 0.7, durSec: 0.3 });
        el.style.opacity = String(f.opacity);
        el.style.filter = blurFilter(f.blurPx * 0.6);
        el.style.transform = f.dy ? `translateY(${(f.dy * 0.4).toFixed(2)}px)` : '';
      }
    });
  }, [progress, reveal, html, ready]);

  return (
    <div
      ref={ref}
      style={{ fontSize, color, opacity: reveal === 'none' ? Math.max(0, Math.min(1, progress)) : 1, ...style }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
