# 引擎对照表：huashu-motion → 本工程

语言库、手法表、导演方法的原文写给 huashu-motion（单个 HTML + GSAP，在 Chrome 里逐帧渲染）。本工程是 Remotion（React 逐帧）+ three.js + Blender + 自建配音平台。读原文时按下表换算。

## 原语与命令

| 原文 | 本工程 | 说明 |
|---|---|---|
| `OM.spring(k)` / `OM.springValue` | `shared/anim.spring`、`shared/motion.settle` / `drawLanding` | 闭式、纯时间函数 |
| `OM.camera('#world')` + `cam.to({ fit })` | 镜头清单 `shared/grammar.compileShots(Shot[])` + `shared/shot.frameRect` | 「一个世界、一台相机」；`hold` 停留（静止 / 缓推 / 慢漂），`out` 过渡（直推 / 弧线 / 甩镜 / 硬切） |
| 3D 透视 / 升降环绕 | `shared/bridge` + `three/BridgeStage`（2D ↔ 3D 无缝交接）、`three/FilmCanvas`、`FlightCamera`、Blender | 见 `docs/capabilities.md §5` |
| `OM.random(seed)` | `shared/anim.createRng(seed)` | 禁用 `Math.random` |
| `OM.clock(tl, draw)` | 帧号 → 秒 → 组件 prop `t`（`FilmShell` / `shot.worldSec`） | 一切都是时间的纯函数 |
| `OM.sfx(name, at)` | 动作事件表 `shared/events`：`MotionEvent` + 适配器 `autoSpots` | 声音按事件自动生成；留白写 `silent` 理由 |
| `OM.music({ bpm })` / `OM.beat(n)` / om-score（ABC） | 两条路：**画面先行** `vw music match <片> --local`（本地结构化作曲 / 曲库，弹性对拍拉伸画面）；**网格先行** `audio/score.ts`（`shared/score` 的 `defineScore`，模型逐音符写谱）+ `vw music score <片>`（采样 / 拨弦 / 内置合成渲染，画面锁在网格上）；两条都用 `shared/beats` 踩拍 | 决策单「节奏 · 配乐路线」写走哪条；网格先行时 `vw check` 查拍点落在网格上（1 帧） |
| `OM.cue('word')` / `om voice` | 可选 VO 层：`audio/voice.json` + `vw voice film <片>`（配音 → 核对 → 字幕），`FilmAudio` 播放、配乐让位；逐词时间戳在 `out/<片>/voice/words.json` | 口播不是默认，要不要先问用户 |
| `OM.vars` / `data-om-id` / `OM.region` | `vw studio`（工作台批注）| 本工程的「指着改」在工作台里 |
| `om new` / `om templates` | 画法片段：`components/clip/ClipCanvas` + `shared/clip`（7 个 grammar 收录自 huashu-motion，见 `clip.md`）；整片骨架参照已有片子 | 画法是积木，不是整片模板 |
| `om still <dir> --at …` | `vw still <片> --at 1.2,3.4` | 关键帧、海报帧；`--strip=a:b` 连拍（每一帧）、`--crop=x,y,w,h` 局部放大 |
| `om check` | `vw check <片>` | 守门（会拦） |
| `om qa` | `vw motion`、`vw qa flicker / odd`，出片验收自动跑 | 单帧闪、孤帧、运动曲线 |
| `om sound` | `vw sfx search / pick / plan` + `vw music match` | 音效来源：分层合成 / Kenney / Freesound / Epidemic；配乐来源：本地作曲 / Freesound（`--source=freesound --brief=…`）/ Epidemic |
| `om render` | `vw render <片> --mode=final` | 三段式出片 + 验收 |
| `om swatch` | `vw style sheet <id>` | 色板样张 |
| `om fonts` | 风格的 `fonts`（系统字体） | 没有字体打包 |
| `om learn` / `om learn harvest` | `vw learn` / `vw learn add` | 经验：`docs/experience.md` |
| 独立审片者 | **TODO**（冷审片，暂未做）；现在由模型按 `docs/method/taste.md` 的评审表自评 | |

## 手法 → 原理与做法（techniques.md 各节）

**默认按这部片的内容自己画**：下表告诉你每类手法在本工程里怎么实现、有什么现成的引擎和参考实现可以读；不是「挑一个组件拼上去」。
引擎（时间、画布、3D、镜头桥、字体）放心直接用；带画风的组件是**参考实现**：读懂原理，复制进片子按内容改（分类见 `src/components/README.md`）。
几部片都用同一个参考实现，就会长成同一个样子——`vw review` 的 `vs-past.png` 会把这部片和最近几部片并排给你看。

| 原文一节 | 本工程可用 |
|---|---|
| Timing and easing | `anim`（`easeOutExpo` / `camInOut` / `spring`）、`motion.landOn`（让落点踩在拍上） |
| Entrances and exits | `motion.draw` / `drawLanding` / `stagger`、`lens.focusIn / focusOut` |
| Continuity devices | `shot/MorphLayer`（形变挪位 FLIP）、`shot/FocusText` `FocusSwap`（拉焦换字）、镜头清单的连续镜头、`VideoInsert` + `vw seam`（软遮罩接缝） |
| Camera | `grammar.compileShots`、`bridge`（2D ↔ 3D）、`FlightCamera`（3D 漫游） |
| Typography in motion | `shot/FocusText`（逐字聚焦）、`lens.charFocus`、`math/MathTex` `MathMorph` |
| Shape and material | `sketch/Rough`（手绘线）、`sketch/Watercolor`（水彩 / 水墨）、`paint/PaintCanvas`（p5.brush 笔刷：平涂、水彩、排线、墨线 + boil，ClaudeAnimationBase）、`geo/*`（几何板书）、`shared/stepped`（定格）、three / Blender |
| Character acting | `paint/PaintCanvas` + `cab()`：`clawd` 角色骨架、`emotions`（带预备和反应的表情切换）、`turn` / `spinView`（手绘转身）、`jump` / `take` / `stroll` / `spring` / `arcPt`（见 `docs/method/animation-guide.md`） |
| Data | `flow.tide` / `tideCount`、`anim.countUp`、`shot/GlowText` |
| Product UI | `ui/AppShell` `Cursor` `ChatStream` `ButtonPortal` `SnipImage`、`PhoneShot` / `three/Phone3D` |
| Finishing | `shot/PaperLight`（纸面光照 + 颗粒）、`three/FilmPost`（后期链）、`shot/LightSweep` |

**注意**：`lens.lift`（浮起阴影）、`LightSweep`（光扫）、`GlowText`（落定发光）都是正当手法；要避开的是无目的地给每个元素都叠上（anlan-film v2）。反过来，把光、深度、材质全拿掉会单一、空（anlan-exec v2）。见 `docs/method/taste.md`「冲击力」。
