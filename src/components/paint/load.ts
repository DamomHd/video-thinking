/**
 * 按上游 studio.html 的顺序把 ClaudeAnimationBase 引擎加载进渲染页（public/vendor/claude-animation-base）。
 *
 * 为什么不 import：上游是 classic script —— 文件之间靠全局词法作用域共享 const（W、PAL、BEAT…），
 * p5.brush 的 UMD 包也只在页面上已有全局 p5 时才注册成插件。当 ES 模块打包会把这些全部切断，
 * 所以这里按顺序注入 <script>，和上游页面的加载方式一模一样。
 *
 * 一个渲染页只加载一份引擎（p5 全局模式只有一张画布）：PROJECT（片长 / 速度 / 首拍）以第一次调用为准。
 * 只在 Remotion 渲染端用；Node 端（测试、脚本）不要 import。
 */
import { staticFile } from 'remotion';

export interface PaintProject {
  /** 片长（秒）：上游 DUR，只影响 shots() 最后一镜的长度 */
  duration: number;
  /** 速度：所有 idle、弹跳、舞步、pulse() 锁在这个拍子上；有配乐就填配乐的 BPM */
  bpm: number;
  /** 第一个强拍的时刻（秒） */
  offset?: number;
}

const BASE = 'vendor/claude-animation-base/';
const ENGINE = ['lib/p5.min.js', 'lib/p5.brush.js', '@project', 'src/core.js', 'src/clawd.js', 'src/timeline.js', 'src/sheets.js', '@bridge'];

/**
 * 引擎加载完之后注入的桥（classic script，和引擎同一个全局词法作用域）：
 *   · devUI 改成空函数：上游 setup() 在非 ?render 页面会去找滑杆元素
 *   · window.__cab：把 const / let 声明的全局（PAL、W、ease、jit…）连同函数一起交给模块代码
 *   · __cab.render(t)：照上游 renderAt，但不转 dataURL —— 直接返回合成好的 #out 画布
 */
const BRIDGE = `
window.devUI = function () {};
window.__cab = {
  get T() { return T; },
  W, H, BPM, BEAT, OFF, BOIL, DUR, TAU, PAL, EMO, VIEWS, LOOPS, SHOTS,
  clamp, lerp, ease, easeIn, easeOut, backOut, elasticOut, hash, jit, boilSeed, seg, frac, bpOf, beatN, pulse, pulse2, wob, kf,
  mixCol, shakeXY, spring, ring, onTwos, arcPt, jump, take, stroll,
  camBegin, camEnd, toScreen, flash, glow, iris, irisShape,
  rectPts, ellPts, rrPts, starPts, heartPts, through, ribbon, paint, inkLine, letter, sfx, flushLetters, flushBrush,
  clawd, spinView, turn, feel, emotions, move, dancer, emote, shots, brushWipe,
  async render(t) { T = t; await redraw(); composite(t); return outC; },
};
`;

function inject(src: string | null, code?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.async = false;
    if (code !== undefined) {
      s.textContent = code;
      document.head.appendChild(s);
      resolve();
      return;
    }
    s.src = staticFile(BASE + src);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`ClaudeAnimationBase 脚本加载失败：${src}`));
    document.head.appendChild(s);
  });
}

let engine: Promise<CabWindow['__cab']> | null = null;
let engineProject: PaintProject | null = null;
const loadedScenes = new Map<string, Promise<void>>();

type CabWindow = Window & { __cab: any; p5: any; ready?: boolean };

/** 加载引擎并启动 p5 全局模式，等上游 setup() 把纸纹、颗粒、光晕贴图都建好（window.ready） */
export function loadEngine(project: PaintProject): Promise<CabWindow['__cab']> {
  if (engine) {
    if (engineProject && (engineProject.bpm !== project.bpm || (engineProject.offset ?? 0) !== (project.offset ?? 0)))
      console.warn('[paint] 同一渲染页只能有一份引擎设置，沿用第一次的 PROJECT', engineProject);
    return engine;
  }
  engineProject = project;
  engine = (async () => {
    const w = window as unknown as CabWindow;
    // 上游把 p5 自己的画布藏起来，只看合成后的 #out；两张都不进画面（组件每帧把 #out 拷到自己的画布上）
    const style = document.createElement('style');
    style.textContent = '.p5Canvas, #out { display: none !important; }';
    document.head.appendChild(style);
    const out = document.createElement('canvas');
    out.id = 'out';
    out.width = 1920;
    out.height = 1080;
    document.body.appendChild(out);
    // 上游从 Google Fonts 在线取手写体；这里用本地文件（public/fonts/paint/，Apache 2.0），渲染不依赖网络
    const marker = new FontFace('Permanent Marker', `url(${staticFile('fonts/paint/PermanentMarker-Regular.woff2')})`);
    document.fonts.add(await marker.load());
    for (const f of ENGINE) {
      if (f === '@project') await inject(null, `const PROJECT = ${JSON.stringify({ offset: 0, ...project })};`);
      else if (f === '@bridge') await inject(null, BRIDGE);
      else await inject(f);
    }
    // 页面早已 load 完，p5 不会自己进全局模式：手动起一个（无参数 = 全局模式，调用 window.setup）
    new w.p5();
    await new Promise<void>((resolve) => {
      const wait = () => (w.ready ? resolve() : requestAnimationFrame(wait));
      wait();
    });
    return w.__cab;
  })();
  return engine;
}

/**
 * 加载镜头脚本（上游 src/scenes/*.js 那种：IIFE 里调 shots([...])）。路径相对 public/。
 * 每个脚本整页只执行一次（shots 会累加到全局 SHOTS 里）。
 */
export function loadScene(path: string): Promise<void> {
  let p = loadedScenes.get(path);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.async = false;
      s.src = /^(https?:|\/)/.test(path) ? path : staticFile(path);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`镜头脚本加载失败：${path}`));
      document.head.appendChild(s);
    });
    loadedScenes.set(path, p);
  }
  return p;
}
