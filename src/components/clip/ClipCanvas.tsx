/**
 * huashu-clip 画法片段的 Remotion 组件：<ClipCanvas spec={…} t={片段内秒} />
 *
 * 对应上游 clip.js 的 mount()，按 Remotion 的方式重写：
 *   · 读 spec → 乘 pace（ClipCues.prepare）→ 排提示点（排序、去掉片长之后的、number 的说明统一）→ 组上下文 ctx
 *   · delayRender 等字体（public/fonts/clip/）和图片加载完，再调画法的 init(ctx)，先画好当前帧才放行
 *   · 之后每一帧在 useLayoutEffect 里调 grammar.draw(画布, t, ctx) —— 画法是时间的纯函数，跳帧、并发渲染都一致
 *
 * 画法把排版存在自己的模块变量里（同一画法只有一份）。同一部片里先后用到同一画法的两个片段时，
 * 绘制前发现「上次是为别的片段初始化的」就重新 init 一次。
 * 图片路径（cue.image / data.image）相对 public/，或写 http(s) / data: 地址。
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { continueRender, delayRender, cancelRender, staticFile } from 'remotion';
import './load';
import type { ClipSpec } from '../../shared/clip';

const G_ = window as unknown as Record<string, any>;

/** 画法里的字体名 → public/fonts/clip/ 下的文件（上游 clip.js 的 FACES；黑体保留上游的 PuHui-* 名字，文件是 Noto Sans SC） */
const FACES: Record<string, [string, FontFaceDescriptors?]> = {
  'PuHui-Medium': ['NotoSansSC-500.woff'],
  'PuHui-Bold': ['NotoSansSC-700.woff'],
  'PuHui-Heavy': ['NotoSansSC-800.woff'],
  'PuHui-Black': ['NotoSansSC-900.woff'],
  'CMU-rm': ['cmunrm.woff'],
  'CMU-it': ['cmunti.woff'],
  'EBGaramond-400i': ['EBGaramond-400i.woff'],
  Inter: ['Inter-var.woff', { weight: '100 900' }],
  RobotoCondensed: ['RobotoCondensed-var.woff', { weight: '100 900' }],
  'LXGWWenKai-500': ['LXGWWenKai-500.woff'],
};

const fontLoads = new Map<string, Promise<void>>();
function loadFace(family: string): Promise<void> {
  const f = FACES[family];
  if (!f) return Promise.resolve();
  let p = fontLoads.get(family);
  if (!p) {
    const face = new FontFace(family, `url(${staticFile(`fonts/clip/${f[0]}`)})`, f[1] ?? {});
    p = face.load().then((ff) => {
      document.fonts.add(ff);
    });
    fontLoads.set(family, p);
  }
  return p;
}

const imgSrc = (u: string) => (/^(https?:|data:|blob:|\/)/.test(u) ? u : staticFile(u));
function loadImage(u: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error(`图片加载失败：${u}`));
    im.src = imgSrc(u);
  });
}

interface ClipRun {
  G: any;
  ctx: any;
  W: number;
  H: number;
}

/** spec → 画法 + 上下文（同步；照上游 mount() 的前半段） */
function prepare(input: ClipSpec): ClipRun {
  const spec = JSON.parse(JSON.stringify(input)) as any;
  spec.data = spec.data || {};
  spec.cues = spec.cues || [];
  const W = spec.width || 1920;
  const H = spec.height || 1080;
  spec.width = W;
  spec.height = H;
  const prep = G_.ClipCues.prepare(spec, { pace: spec.pace ?? 1 });
  const s = prep.spec;
  const dur = prep.duration;
  const G = G_.CLIPS[s.grammar];
  if (!G || typeof G.draw !== 'function') throw new Error(`没有画法 ${s.grammar}（已登记：${Object.keys(G_.CLIPS).join(', ')}）`);
  if (!(dur > 0)) throw new Error('spec.duration 必须 > 0');
  const FPS = s.fps || 30;
  const cues = s.cues
    .map((q: any, i: number) => ({ ...q, i, at: +q.at || 0 }))
    .sort((a: any, b: any) => a.at - b.at || a.i - b.i)
    .filter((q: any) => q.at <= dur + 1e-9);
  for (const q of cues)
    if (q.kind === 'number') {
      const cap = q.text ?? q.sub ?? q.data?.text;
      if (cap != null) {
        q.text = cap;
        q.sub = cap;
      }
    }
  const safe = { top: 0, bottom: 0, left: 0, right: 0, ...(s.safe || {}) };
  const lt = (t: number, at: number) => t - at + 1 / FPS;
  const ctx = {
    spec: s, data: s.data, theme: s.theme || {}, cues, W, H, FPS, u: Math.min(W, H) / 1080, portrait: H > W, alpha: !!s.alpha, IMG: {} as Record<string, HTMLImageElement>, dur, safe,
    box: { x: safe.left, y: safe.top, w: W - safe.left - safe.right, h: H - safe.top - safe.bottom },
    of: (...kinds: string[]) => cues.filter((q: any) => kinds.includes(q.kind)),
    lt,
    p: (t: number, at: number, d: number) => Math.max(0, Math.min(1, lt(t, at) / d)),
  };
  return { G, ctx, W, H };
}

/** 每个画法最近一次是为哪个上下文初始化的 */
const initedFor = new Map<any, any>();
function ensureInit(run: ClipRun) {
  if (initedFor.get(run.G) === run.ctx) return;
  G_.U.setStage(run.W, run.H);
  G_.CLIP.ctx = run.ctx;
  if (run.G.init) run.G.init(run.ctx);
  initedFor.set(run.G, run.ctx);
}

function drawFrame(cv: HTMLCanvasElement, run: ClipRun, t: number) {
  ensureInit(run);
  if (G_.STAGE.W !== run.W || G_.STAGE.H !== run.H) G_.U.setStage(run.W, run.H);
  const c = cv.getContext('2d')!;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  c.save();
  run.G.draw(c, t, run.ctx);
  c.restore();
  const s = run.ctx.safe;
  if (s.fill && !run.ctx.alpha) {
    c.fillStyle = s.fill;
    if (s.top) c.fillRect(0, 0, run.W, s.top);
    if (s.bottom) c.fillRect(0, run.H - s.bottom, run.W, s.bottom);
    if (s.left) c.fillRect(0, 0, s.left, run.H);
    if (s.right) c.fillRect(run.W - s.right, 0, s.right, run.H);
  }
}

export const ClipCanvas: React.FC<{ spec: ClipSpec; t: number; style?: React.CSSProperties }> = ({ spec, t, style }) => {
  const run = useMemo(() => prepare(spec), [spec]);
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender(`huashu-clip ${spec.grammar}`));
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    let alive = true;
    (async () => {
      const faces = [...new Set<string>([...(run.G.faces || []), ...(run.G.fonts || [])])];
      await Promise.all(faces.map(loadFace));
      await document.fonts.ready;
      const urls = new Set<string>();
      run.ctx.cues.forEach((q: any) => q.image && urls.add(q.image));
      if (run.ctx.data.image) urls.add(run.ctx.data.image);
      const ims = await Promise.all([...urls].map(async (u) => [u, await loadImage(u)] as const));
      for (const [u, im] of ims) run.ctx.IMG[u] = im;
      if (!alive || !ref.current) return;
      initedFor.delete(run.G);
      drawFrame(ref.current, run, tRef.current);
      setReady(true);
      continueRender(handle);
    })().catch((e) => cancelRender(e));
    return () => {
      alive = false;
    };
  }, [run, handle]);

  useLayoutEffect(() => {
    if (ready && ref.current) drawFrame(ref.current, run, t);
  }, [ready, run, t]);

  return <canvas ref={ref} width={run.W} height={run.H} style={{ width: '100%', height: '100%', display: 'block', ...style }} />;
};
