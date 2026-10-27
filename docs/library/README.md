# 视觉语言库

> 模型设计画面时的菜单，不是约束。借鉴 huashu-motion v0.1.1 的 motion library，按本工程改写。
> 原文在 `languages/*.md`、`techniques.md`、`formats.md`、`product-fit.md`（英文，开头注明了出处）；
> 原文的 `OM.*` / `om` 命令怎么换算成本工程，见 `engine-map.md`；我们改了什么、为什么改，见 `adaptation.md`。

## 四层，按顺序选

| 层 | 问的问题 | 去哪看 |
|---|---|---|
| **片型** | 什么片子？（时长、画幅、结构、怎么结尾） | `formats.md`；本工程的「汇报片」见 `adaptation.md §2` |
| **语言** | 东西怎么动、动起来说的是什么？ | `languages/`，下表 |
| **手法** | 具体用哪些招，每招表达什么 | `techniques.md`；对应组件见 `engine-map.md` |
| **质感与声音** | 色板、字、材质、音乐、落点声 | 默认按内容自定（`docs/method/colour.md` + 各语言文件）；做系列片时沿用风格库里沉淀的风格（`src/styles/<id>/`） |

导演方法（怎么读内容、找讲法、出方向、写处理方案）见 `docs/method/director.md`；高级感的标准和评审表见 `docs/method/taste.md`。

其中 7 种语言有**现成的画法片段**（给数据就能出一段画面）：mechanism → 公式讲解、data-story → 金融图表、flat-world → 科普插画、editorial-collage → 拼贴论证、hand-drawn → 白板推演、kinetic-type → 动态文字、card-montage / modular-grid → 发布会卡片。见 `clip.md`。

## 语言（20 种）

| id | 它在说 | 适合 | 本工程起点 |
|---|---|---|---|
| system-diagram | 部件怎么连、什么在流动 | 架构、链路、流程、平台 | `PathPulses`、SVG 路径、镜头清单；等轴测用 `bridge` / three |
| mechanism | 为什么它能工作 | 算法、原理、机制 | `geo/*`、`math/*`、`MorphLayer` |
| modular-grid | 精确、工程化 | 规格、清单、技术方案 | 网格版式 + `FocusSwap` |
| data-story | 证据在这 | 指标、对比、里程碑 | `flow.tide`、`countUp`、图表自画 |
| kinetic-type | 一个有力的主张 | 标语、结论、开头结尾 | `FocusText`、`charFocus` |
| continuous-morph | 一个精心打造的整体 | 一个对象变成另一个 | `MorphLayer`、连续镜头 |
| card-montage | 一步一步、真实完成 | 产品功能 | 注意别落进「卡片套路」 |
| cursor-demo | 它能用、怎么用 | 软件操作流程 | `ui/AppShell` `Cursor` `ChatStream` |
| editorial-collage | 这是真的，看这一行 | 案例、新闻、评论 | `ui/Editorial` `SnipImage` |
| flat-world | 奇妙、尺度 | 科普、教育 | 自画 SVG 世界 + 镜头清单 |
| hand-drawn | 人在思考 | 教学、友好的品牌 | `sketch/Rough`、`SketchCanvas` |
| character | 情绪、个性 | 故事 | 需要角色素材 |
| 3d-object | 可触摸、高级 | 硬件、实体、空间 | three / Blender / `bridge` |
| generative-field | 智能、氛围 | 模型发布、氛围片 | Canvas / three 着色 |
| liquid-glass | 高级消费品 | iOS 类应用 | `ui/GlassCard` |
| photo-led | 真实世界 | 旅行、食物、广告 | 需要照片素材 |
| showreel | 能力范围 | 作品集 | 多语言串联 |
| retro-digital | 文化、锋芒 | 开发者文化、游戏 | 通常只做调料 |
| art-styles | 文化、惊喜 | 「意外」方向 | `sketch/Watercolor`、`stepped`（定格） |
| talking-head | 背后是真人 | 创始人、讲者 | 需要真人素材（`VideoInsert`） |

## 怎么选：讲法 × 气质

讲法（内容的形状）比题材更决定语言。行是讲法，列是主导气质；每格第一个是「贴合」，后面是「放大 / 意外」的候选。

| | 精确 / 技术 | 冷静 / 高级 | 活泼 / 有能量 | 人文 / 温暖 |
|---|---|---|---|---|
| **主张** | kinetic-type · modular-grid · system-diagram | 3d-object · generative-field · photo-led | kinetic-type · showreel · retro-digital | hand-drawn · kinetic-type · character |
| **流程** | cursor-demo · system-diagram · continuous-morph | cursor-demo · continuous-morph · card-montage | continuous-morph · cursor-demo · card-montage | cursor-demo · talking-head · hand-drawn |
| **机制** | mechanism · system-diagram · modular-grid | mechanism · 3d-object · flat-world | flat-world · character · art-styles | hand-drawn · flat-world · character |
| **证据** | data-story · modular-grid · kinetic-type | data-story · editorial-collage · 3d-object | data-story · kinetic-type | data-story · editorial-collage · talking-head |
| **清单** | modular-grid · kinetic-type · continuous-morph | card-montage · continuous-morph · kinetic-type | continuous-morph · card-montage · 3d-object | card-montage · hand-drawn · character |
| **前后对比** | continuous-morph · data-story | continuous-morph · photo-led | continuous-morph · character | photo-led · hand-drawn |
| **故事** | system-diagram · talking-head · character | photo-led · talking-head · flat-world | character · art-styles · photo-led | talking-head · photo-led · character |
| **展示** | 一件做深的东西（mechanism / 3d-object）· showreel | 一件做深的东西 · 3d-object | showreel · art-styles | art-styles · character |

一部片可以换语言，但换的那一下本身要有意义（比如开场讲问题用 kinetic-type，中段讲机制用 system-diagram，结尾回到 kinetic-type 下结论）。30 秒里最多三种还读得像一部片；换的时候带一根「脊梁」过去（同一条线、同一个颜色、同一个对象）。

一部汇报片的典型组合：每一段按它的讲法单独选——「背景」是主张、「范围」是证据或清单、「方案」是前后对比、「链路」是 system-diagram、「排期」是 data-story——再用一根脊梁（比如一条贯穿全片的线）串起来。

## 房子风格

2026 年很多 AI 做的片子长得一样（huashu-motion 统计）：暖白或近黑的底、一个橙红或青柠强调色、巨大的无衬线字配等宽小字、一秒一个模块、一个点开场。选完语言后，用一句话写清**这部片的样子和这个套路差在哪**，或者说明它确实就该长这样。本工程自己踩过的两个极端也要避开：无目的地给每张卡叠浮起 + 光扫 + 发光 + 色块（演示文稿感），以及把光、深度、材质全拿掉（单一、空）。见 `docs/method/taste.md`。

## 好例子

`exemplars/`：每个样本写清它好在哪、用了哪几条原则。学原则，不复刻画面。
