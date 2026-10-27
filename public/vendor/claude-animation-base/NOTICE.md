# ClaudeAnimationBase（收录）

- 来源：<https://github.com/JohnHeibel/ClaudeAnimationBase>，commit `0ac8bf2`（2026-09-24），作者 John Heibel。
- 授权：MIT，见同目录 `LICENSE`。
- 依赖：`lib/p5.min.js` 来自 npm `p5@2.3.3`（LGPL-2.1，见 `lib/p5.LICENSE.txt`），`lib/p5.brush.js` 来自 npm `p5.brush@2.2.3`（MIT，见 `lib/p5.brush.LICENSE.txt`）。两者在 package.json 里锁了精确版本，这里的副本必须与 node_modules 逐字节一致（`src/shared/paint-vendor.test.ts` 守着；升级依赖后重新拷贝）。
- 手写字体：`public/fonts/paint/PermanentMarker-Regular.woff2`（Google Fonts，Apache 2.0）。上游从网络加载，这里改为本地。
- 收录日期：2026-10-26。

## 收了什么
- `src/core.js` `src/clawd.js` `src/timeline.js` `src/sheets.js`：引擎、角色、镜头表、设定图，**原样**。
- `src/scenes/demo.js`：上游示例（「掉下来的星星」），原样，只给探针 `BrushProbe-demo` 用。
- 制作指南 `ANIMATION_GUIDE.md` 原样收在 `docs/method/animation-guide.md`，设定图在 `docs/method/animation-guide/`。

## 没收什么
- `studio.html`、`render.mjs`、`gpu_probe.mjs`：上游自己的预览页和无头渲染器。本工程的对应：`src/components/paint/`（在 Remotion 里按上游页面的顺序注入这些脚本、每帧调用引擎）、`vw still --strip / --crop`（上游 `--strip` `--crop` 的自查方式）。

## 为什么放在 public/ 而不是 src/vendor/
上游是 classic script：文件之间靠全局词法作用域共享 `const`（W、PAL、BEAT…），p5.brush 的 UMD 包也只在页面已有全局 p5 时才注册插件。打包成 ES 模块会把这些切断，所以由 `src/components/paint/load.ts` 在渲染页按顺序注入 `<script>`，和上游页面一模一样。

## 规矩
- 这里的文件保持原样，方便和上游对照、同步。要改行为，改 `src/components/paint/`，或在片子的绘制函数里自己画。
