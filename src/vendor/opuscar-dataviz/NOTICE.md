# opuscar-dataviz（收录）

- 来源：lemo-opuscar（LemoLab）`styles/dataviz/demo/engine.js` 与 `core/lib.js`，commit `413a6bd`。
- 授权：MIT，见同目录 `LICENSE`。
- 收录日期：2026-10-27。

## 收了什么、改了什么
- `engine.js`：数据叙事风格的画法引擎（纸、2D 相机、铅笔描线、手写、数据点、形变、虚线空格、红蓝铅笔、图注），**只改了一处**：`import … from '/core/lib.js'` → `'./lib.js'`。
- `lib.js`：上游的通用小工具（种子随机、插值、缓动），原样。
- 不收上游的 `film.js` / `timeline.js` / `main.js`（样片的故事和时间），也不收字体文件（本工程用 `vw font fetch` 取，中文手写用 Long Cang）。

## 规矩
- 这里的文件保持原样，方便跟上游对照。要改行为，在 `src/components/dataviz/` 或片子里包一层，不改这里。
- 全部是确定性的（种子随机、按传入的 t 画），可以在 Remotion 里逐帧调用。模块级缓存（纸纹、颗粒、文字图块、铅笔画布）在每个渲染标签页里各建一份，结果一致。
