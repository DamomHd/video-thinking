# 80 年代赛璐璐动画 · 80s Cel Anime

> 收录自 [lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar)（LemoLab，commit `f171360`）· 分类：卡通与动画（Cartoon & Anime）

**一句话**：快递少女骑车穿过雨后霓虹都市，赶在黎明发射前送到一盘磁带。（A courier girl rides through a rain-soaked neon city to deliver a tape before the dawn launch.）

**适合**：Music videos · Game trailers · Nostalgia

## 文件
- [`STYLE.md`](STYLE.md)：风格提示词原文——**选了这个风格就按它做**（本质与边界、材质、配色逻辑、字体与字幕、动效、镜头语法、声音、原生手法、媒介的坑、变化空间）。
- [`DEMO.md`](DEMO.md)：上游样片《City Lights, 1987》（59 s）的说明，只是一个例子，不要照搬它的故事、镜头和时间。
- `style.ts`：参考色板与字体（风格库现有字段）。**色板只是参考**：片子用这个风格时，配色由模型按片子的需要、照 STYLE.md 的配色逻辑自己定。
- `refs/poster.jpg`、`refs/frame.jpg`：样片海报帧和画廊关键帧。
- 样片源码（Canvas / WebGL 页面 + 配乐混音脚本 + 字体）：`vw style demo cel-anime-80s` 取到 `out/styles/cel-anime-80s/demo/`，读来学手法，不在本工程里渲。

## 授权
风格提示词与代码：MIT（LemoLab）。样片海报帧与关键帧：CC BY 4.0，署名 LemoLab，并附 https://github.com/lemomo-ai/lemo-opuscar。样片里的第三方素材见样片源码的 `CREDITS`。
