# 画面组件：引擎 和 参考实现

共用层分两种，定位不同（2026-10-27 和用户定：共用的是底层能力，不能把画面框住）。

## 引擎（直接用）
只提供能力、不带画风。片子放心引用。

| 组件 | 做什么 |
|---|---|
| `FilmShell` `Stage` `FilmAudio` `CueAudio` `WarpProvider` `EnterWrapper` `Reframe` | 幕表 → 时间、声音、对拍映射、世界层 |
| `three/FilmCanvas` `three/FilmPost` `three/PoseCamera` `three/FlightCamera` `three/Bridge`（`BridgeStage` / `ProjectedHtml`） | 3D 画布、后期链（景深 / 辉光 / 颗粒）、相机、2D↔3D 镜头桥 |
| `dataviz/DataCanvas` `paint/PaintCanvas` `clip/ClipCanvas` `SketchCanvas` | 每帧给一张画布自由画（各自配收录的画法引擎） |
| `fonts`（`useLocalFonts`） `math/MathTex` | 本地字体、公式排版 |
| `VideoInsert` `ArchiveView` `ReadProbe` `Subtitles` | 外部视频片段、封存对比、读字检查、口播字幕 |
| `canvasTexts`（`registerCanvasText`） | 画在 Canvas 上的字登记给读字检查（DataCanvas 每帧自动清空；画字时顺手登记） |

## 参考实现（读懂、复制进片子再改）
带着某种画风或版式的默认值。**不要直接拼**：用了就是同一种手感，几部片会长成一个样子（anlan-film v2：阴影卡片 + 光扫 + 落定发光 → 演示文稿感）。
要用其中的做法时：读源码学原理 → 复制到 `src/films/<片>/` → 按这部片的内容改到看不出原样。

| 组件 | 里面的做法 |
|---|---|
| `ui/*`（`AppShell` `ChatStream` `GlassCard` `ChapterTag` `Editorial` `Cursor` `SnipImage` `ButtonPortal`）、`PhoneShot` `three/Phone3D` | 产品界面、对话流、卡片、章节编号、标题版式、设备 |
| `shot/Light`（`LightSweep` `PaperLight` `GlowText`） | 光扫、纸面光、落定发光 |
| `shot/Focus`（`FocusText` `FocusSwap`）、`shot/MorphLayer`、`shot/PathPulses` | 逐字聚焦、换字、形变挪位、沿路径的光点 |
| `sketch/*` `geo/*` | 手绘线、水彩水墨、几何板书 |
| `clip/` 的 7 个画法 | 公式讲解、发布会卡片、金融图表、科普插画、拼贴论证、白板推演、动态文字（整段的画法，最像模板） |

已有片子里对参考实现的引用不动；新片默认自己画。`vw review` 会把成片和最近几部片并排（`out/<片>/vs-past.png`），提醒别又长成同一个样子。
