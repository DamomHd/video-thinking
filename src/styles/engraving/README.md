# 铜版画 · Copperplate Engraving

> 收录自 [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（LemoLab，commit `f171360`）· 分类：印刷与版画（Print & Printmaking）

**一句话**：一张博物志图版自己刻出来：雕刀推开铜版，蜜蜂一线线成形，最后手工水彩上色。（A natural-history plate engraves itself: the burin cuts the copper, the bee builds up line by line, and a watercolour wash brings it to life.）

**适合**：Museum labels · Science explainers · Brand heritage

## 文件
- [`STYLE.md`](STYLE.md)：风格提示词原文——**选了这个风格就按它做**（本质与边界、材质、配色逻辑、字体与字幕、动效、镜头语法、声音、原生手法、媒介的坑、变化空间）。
- [`DEMO.md`](DEMO.md)：上游样片《The Honeybee, Plate VII》（40 s）的说明，只是一个例子，不要照搬它的故事、镜头和时间。
- `style.ts`：参考色板与字体（风格库现有字段）。**色板只是参考**：片子用这个风格时，配色由模型按片子的需要、照 STYLE.md 的配色逻辑自己定。
- `refs/poster.jpg`、`refs/frame.jpg`：样片海报帧和画廊关键帧。
- 样片源码（Canvas / WebGL 页面 + 配乐混音脚本 + 字体）：`vw style demo engraving` 取到 `out/styles/engraving/demo/`，读来学手法，不在本工程里渲。

## 授权
风格提示词与代码：MIT（LemoLab）。样片海报帧与关键帧：CC BY 4.0，署名 LemoLab，并附 https://github.com/lemomo-ai/lemo-opuscar。样片里的第三方素材见样片源码的 `CREDITS`。
