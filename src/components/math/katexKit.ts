/**
 * KaTeX 公共部分：渲染、字体就绪、符号（叶子节点）枚举
 *
 * 版本锁 0.19.0（package.json 精确版本）：公式排版随版本会有细微变化，升级要过一遍公式探针。
 */

import katex from 'katex';
// 样式表在 MathTex / MathMorph 里引入：这个模块要能在 Node（测试、脚本）里直接用，Node 不认 .css

export function renderTex(tex: string, display = true): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: 'html',
    strict: 'ignore',
  });
}

const FONTS = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Size1', 'KaTeX_Size2', 'KaTeX_AMS'];
let fontsReady: Promise<void> | null = null;

/** KaTeX 字体全部可用（只加载一次）。排版和测量都要等它：字体没到位时宽度是错的 */
export function katexFontsReady(): Promise<void> {
  if (!fontsReady) {
    fontsReady = Promise.all(
      FONTS.flatMap((f) => [document.fonts.load(`16px ${f}`), document.fonts.load(`italic 16px ${f}`)])
    ).then(() => document.fonts.ready.then(() => undefined));
  }
  return fontsReady;
}

/**
 * 公式里的「符号」：有文字的叶子 span、分数线、根号等 svg。
 * 返回顺序就是阅读顺序（DOM 顺序），key = 文字（或种类）+ 第几次出现 —— 两个式子之间按 key 配对。
 */
export function mathTokens(root: HTMLElement): { el: HTMLElement; key: string }[] {
  const html = root.querySelector('.katex-html');
  if (!html) return [];
  const out: { el: HTMLElement; key: string }[] = [];
  const seen = new Map<string, number>();
  const push = (el: HTMLElement, base: string) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({ el, key: `${base}#${n}` });
  };
  const walk = (el: Element) => {
    if (el instanceof SVGElement) return;
    const htmlEl = el as HTMLElement;
    if (htmlEl.classList.contains('frac-line')) return push(htmlEl, '—frac');
    const svgChild = Array.from(el.children).find((c) => c.tagName.toLowerCase() === 'svg');
    if (svgChild && el.children.length === 1) return push(htmlEl, '—svg');
    if (el.children.length === 0) {
      const text = (el.textContent ?? '').trim();
      if (text) push(htmlEl, text);
      return;
    }
    for (const c of Array.from(el.children)) walk(c);
  };
  walk(html);
  return out;
}
