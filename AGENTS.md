# AGENTS.md

本仓库（video-workbench）是一个在本机运行的**程序化影片工作室**：React 写画面，Remotion 逐帧渲染；three.js 做实时 3D，Blender 做照片级预渲染；自建的配音平台负责音效、配乐、对拍和混音；最后由 ffmpeg 三段式出片。

- **做片**（导演、编排、混音）的纪律看 `skills/video-workbench/SKILL.md`。
- **改这个仓库**（加能力、修 bug、写工具）看本文件。

用中文交流和写注释。

---

## 1. 先知道的几件事

- **对标基准是 `architecture.html`**（LoomCare/create-video 的架构文档；第三方文档，**只放本机、不进 git**，换机时自己拷），不是参考成片。说"能力对标"时逐章对照它，而且要同时核实两件事：**存在**（文件在）和**可用**（实际渲过、被用过）。
- **片子按目录自动发现**（2026-10-27）：每部片自带 `film.json`（id / 片名 / 帧率 / 宽高）和 `root.tsx`（给 Remotion 的幕表、画面、真值、额外合成），引擎扫描 `src/films/*` 登记，约定见 `shared/film-root.ts`；`vw init` 会自动生成这两个文件。竖屏片在 `film.json` 里写 1080×1920。真实业务数据的片子（`src/films/anlan-*`）在 `.gitignore` 里排除，只留在本机——没有它们其余部分照样编得过，新增这类片子在 `.gitignore` 里加一行。
- **补工程能力时不改已出的片子。**`src/films/` 下的 anlan-report、us、us-paper 是已出的片子。补能力只动通用层：`src/shared`、`src/components`、`src/styles`、`scripts`、`blender`、`tools`。验证用单元测试和**内容中性**的探针（`src/probe/`），不要拿某部片的文案或素材做探针。发现已出片子的问题，报告给用户，由用户决定改不改。
- **内容先于形式**（2026-10-27 用户定：这是视频最基础最核心的能力）：做片先定「这段时长里讲哪些核心信息」——受众要带走的一句话、最多三个支撑点、按时长算的信息容量、删掉了什么和为什么；脚本先能单独讲通，再选风格和画法。风格装不下核心信息时直说，不让形式决定讲什么。
- **设计不设限**：模型足够强，画面怎么设计（语言、构图、动效、光、材质、深度、声音）由模型按内容自由发挥；`docs/method/`、`docs/library/` 是参考不是规则，设计评审是自查不是关卡。**只有片子沿用了风格库里的风格时，才按那个风格约束。**
- **风格库**（`src/styles/<id>/`）有两个来源，片子都是**默认不选**、由模型按内容在自己的 `theme.ts` 里设计主题：
  - **收录的风格**：lemo-opuscar 的 59 个完整风格（2026-10-26 用户决定整份原文进库）。**只有完整的风格才进库**（2026-10-27 用户定）：OPUSCAR 98 的 98 个片段风格只作参考，放在 `docs/library/opuscar98/`，片子不能选它当风格。每个风格目录有 `STYLE.md` 原文（材质、配色逻辑、字体、动效、镜头、声音、原生手法、坑）、`DEMO.md`、`README.md`、`style.ts`（只用现有字段：色板、字体）、`refs/`。**片子选了某个收录风格，就按它的 STYLE.md 全部约束做**（配色守的是原文的配色逻辑，具体色值由模型按片子需要定，`style.ts` 的色板只是参考）；样片源码用 `vw style demo <id>` 取来读。由 `scripts/style/import-opuscar.ts` 生成，不手改（要改就重跑导入）。
  - **自有风格**：两条路。① 用户认可某部片的样子后，`vw style save <片> --id=…` 沉淀，产出和工坊进库的风格同一套结构（style.ts、README、STYLE.md 十一节骨架、CHANGES.md、refs 里的海报 / 样片软链 / 参考帧），STYLE.md 由模型按成片写满、再补 `refs/styleframe.png`。② 用户要把某个风格改成自己的、或从空白做一个：按 `docs/method/style-workshop.md` 一起定方案，`vw style fork` 起草稿（`out/style-drafts/`）→ 风格帧并排对比 → 样片 → 用户点头 `vw style keep` 进库（带完整 STYLE.md 和 CHANGES.md）。
  - **风格库的规范要统一**（2026-10-27 用户定，方便后续维护迭代）：自有风格进库前走完工坊全流程——草稿只在 `out/style-drafts/`；风格帧由样片 `src/films/<id>-test/`（有 `film.json` + `root.tsx`，引擎自动登记）用 `vw still` 渲出，不另注册单帧合成；样片过 `vw check`、出片、`vw review`；`refs/` 只放 `poster.jpg`、`styleframe.png`、参考帧 `ref-<秒>s.jpg` 和样片 `demo.mp4`（大文件软链到原片，不复制），不留重复图；`style.ts` 的键名和 STYLE.md 里写的一致。
  - **质量标准是设计本身（`docs/method/taste.md`），不是像不像某部参考片**；参考片只用来学为什么好（`docs/library/exemplars/`）。
- **不能擅自扩展配置体系。**在已有配置里新增内容时，先对齐复用现有字段。确实需要新字段、新 schema、新的一套配置时，先给用户方案，确认后再做。例子：风格库是先给方案、确认后才建的。
- **新增第三方依赖只用发布满两周的版本，并锁定精确版本**（`package.json` 不写 `^`；Python 依赖同理，锁在 `vendor/lemo-opuscar/requirements.txt`）。
- **Python 环境**：`.venv`（Python 3.11，`vw py setup`）只给 lemo-opuscar 的声音工具用（采样配乐、配音、转写核对）；大文件素材（采样库、Kokoro / Whisper 模型）一律在 `out/opuscar/`，由 `vw py fetch …` 下载校验，不进源码目录。
- **Epidemic 密钥只放在 `.env`**（已 gitignore，权限 600），**绝不打印**到输出或日志里，验证时最多回显前缀和长度。这个 key 能搜索，但没有下载原始素材的权限，音效和配乐目前走本地合成（`--local`）。
- **CC0 音效来源**（`scripts/epidemic/cc0.ts`）：Freesound（`FREESOUND_API_KEY` / `FREESOUND_CLIENT_ID` 同样只放 `.env`，key 经标准输入交给 curl 请求头，不进命令行参数）和 Kenney 音效包（`vw sfx kenney sync`，下到 `out/kenney/`）。只收 CC0：检索过滤之外再核一遍许可证，Kenney 包的 License.txt 不是 CC0 整包不收。Freesound 做过一次 OAuth2 授权（`vw sfx freesound auth`）后取原始文件，令牌存 `.env.freesound-oauth.json`（被 `.env.*` 忽略、权限 600，过期自动续期），没授权退回 HQ 预览。落定时 manifest 记 source / license / url / author，`vw review` 核对。候选池可混多个来源，落定按候选自己的来源取回（`providerForCandidate`）。配乐也能从 Freesound 取（`scripts/epidemic/cc0-music.ts`，`vw music match --source=freesound --brief=…`）：拆词检索、标签过滤、下载预览自己分析打分、取原文件剪到段长并钉高潮；曲目来源和许可证记在 `music.json` 的 `track.source / license / url`，`vw review` 一起核对。
- **版本管理**：git，远程是 GitHub **私有**仓库（2026-10-27 起）。代码、文档、真值 JSON、字体、小素材进 git；大媒体不进（`.gitignore`：生成的配乐和音效 WAV、口播 WAV、`public/archive/` 封存旧版、仓库根目录的参考成片 mp4、`out/`、`.venv/`、`.env*`）——**这些文件删除或覆盖之前仍要先备份**（放到 scratchpad）。提交和推送只在用户要求时做。

## 2. 常用命令

```bash
npm test                 # 全部单元测试（node --test + tsx，src/shared/*.test.ts）
npm run typecheck        # tsc --noEmit（tsconfig 覆盖 src / scripts / bin）
npx tsx bin/vw.ts --help # 统一命令行 vw（别名 om）
```

| 场景 | 命令 |
|---|---|
| 本机硬件档位与缺省参数 | `vw hw` |
| 质检守门 | `vw check <片>` |
| CC0 音效 | `vw sfx kenney sync`；`vw sfx search\|pick <片> [槽] --source=freesound\|kenney` |
| 内容策划（时长 → 信息容量、结论出现时刻、纸面稿） | `vw brief <片>` |
| 导演自检（对照决策单，只提示；含和往期片并排 `vs-past.png`、结构与能量曲线、冷看结果） | `vw review <片>` |
| 冷看（不带上下文的子代理审片） | `vw critic <片> [--frames=…]` → 子代理读 `out/<片>/critic/PROMPT.md`，写 `out/<片>/critic.md` |
| 出片（第 3 段自动做响度母带 −14 LUFS） | `vw render <片> --mode=master\|final [--play]` |
| 读字检查（含字幕压字） | `vw readcheck <片>`（结果给 `vw review`） |
| 字体落地 | `vw font fetch "<字体>" [--weights=] [--film=<片>]`（中日韩字体必须带 --film，只取用到的字）；片子里 `useLocalFonts` |
| 交付清单 | `vw credits <片>`（出片时自动生成 `out/<片>/CREDITS.md`；海报图 `poster.jpg` 也是出片时自动出） |
| 分镜（用户要了才做） | `vw storyboard <片> --shots=<json>` → `out/<片>/storyboard.png` |
| 风格索引 / 总览页（挑风格时给用户） | `vw style index` → `src/styles/README.md`；`vw style gallery --open` → `out/styles/gallery.html`（带海报，点开看说明） |
| 按片作曲（网格先行） | 片子写 `audio/score.ts`（`shared/score` 的 `defineScore`）→ `vw music score <片>`（写回 music.json、对拍清成恒等）→ `vw check` 查拍点在网格上 |
| 采样配乐 / 配音 | `vw music match <片> --local --sampled[=cinematic\|mallets\|chamber] [--bpm=108\|100-112]`（风格规定了速度就用 --bpm 限定范围）；`vw voice tts\|check\|srt …`；环境与素材 `vw py setup`、`vw py fetch instruments <库>\|voice` |
| 运动 / 闪帧分析 | `vw motion <片\|mp4>`、`vw qa flicker <片>` |
| 改版前封存 / 新旧对比 | `vw archive save <片> --label=` → Studio 里看 `<片>-Compare-<标签>` |
| 风格库 | `vw style list`、`vw style sheet <id>`、`vw style demo <id>`（收录风格的样片源码）、`vw style save <片> --id=<风格id>`（用户认可后才跑）；改成自己的风格：`vw style fork` → `vw style vs` → `vw style keep`（流程 `docs/method/style-workshop.md`） |
| 看画面（设计评审用） | `vw still <片> --at=1.2,3.4`、连拍 `--strip=2.0:2.5`、局部放大 `--crop=x,y,w,h`、`vw sheet <片\|mp4>`、`vw ref <视频> --out=<目录>` |
| 经验 | `vw learn [主题]`、`vw learn add "…" --kind= --topics= --evidence=` |
| Blender | `vw blender render\|glb\|rays\|flight\|scene …` |
| 代码动画 × AI 视频拼接 | `vw handoff`、`vw insert add`、`vw seam` |
| 探针静帧 | `npx remotion still src/probe/index.ts <探针> out.png --frame=N --gl=angle` |

用到 3D（three / 后期链）的渲染一律加 `--gl=angle`。同时开多个渲染容易卡死，**一次只跑一个渲染**。macOS 上没有 `timeout` 命令。

## 3. 仓库地图

```
bin/vw.ts                    统一 CLI 入口（交互形式来自 huashu-motion，内容来自 LoomCare）
src/Root.tsx                 合成注册（按目录发现 src/films/*/film.json + root.tsx）：<片> / <片>-60 / <片>-Audio / <片>-S-<幕> / 封存的 -Archive- / -Compare-；合成尺寸用每部片 film.json 的宽高
src/films.ts                 Node 侧的片子登记（同一份目录发现：vw、工作台、测试用）
src/films/<片>/              每部片：film.json、root.tsx、timeline.ts（幕表）、theme.ts、scenes/、audio/（九张 JSON 真值 + adapter.ts）
src/shared/                  纯函数（全部可在 Node 跑、有测试）
  anim / motion / lens / morph / flow / shot / stepped / flight / geo / watercolor / splice …
  timewarp / audio-math / beatgrid / camera / types
src/components/              画面组件
  Stage / FilmShell / PhoneShot / VideoInsert / ArchiveView
  shot/   拉焦、形变、沿路径光点          ui/     AppShell、Cursor、ChatStream …
  sketch/ Canvas 手稿、Rough、水彩水墨    math/   KaTeX 公式、公式变形
  geo/    几何板书                        three/  FilmCanvas、FilmPost、FlightCamera、Phone3D、GlbAsset …
  clip/   画法片段 ClipCanvas（7 个 huashu-clip 画法：公式讲解、发布会卡片、金融图表、科普插画、拼贴论证、白板推演、动态文字）
  fonts/  本地字体 useLocalFonts（vw font fetch 取到 public/fonts/ 的）
  Subtitles.tsx 口播字幕（FilmShell 的 subtitles 打开）
  paint/  笔刷手绘 PaintCanvas + cab()（ClaudeAnimationBase：p5.js + p5.brush 画法、角色骨架与表演函数）
vendor/lemo-opuscar/          收录的 Python 声音工具链（lemo-opuscar，MIT）：采样器、拨弦建模、Kokoro / edge-tts 配音、Whisper 核对、字幕；素材软链到 out/opuscar/，见 NOTICE.md
scripts/py/                  Python 工具链的入口（环境、素材下载、配音命令、采样谱渲染 render_score.py）
public/vendor/claude-animation-base/  收录的笔刷手绘引擎（ClaudeAnimationBase，MIT；p5 / p5.brush 副本须与锁定的 npm 版本一致，见 NOTICE.md）：classic script，由 components/paint/load.ts 按上游顺序注入渲染页；不改这里
src/vendor/opuscar-dataviz/   收录的数据叙事引擎（lemo-opuscar dataviz 样片的 engine.js + core/lib.js，MIT，见 NOTICE.md）：纸、2D 相机、铅笔、手写、数据点、形变；由 components/dataviz/DataCanvas 每帧调用；不改这里
src/vendor/huashu-clip/       收录的画法引擎（huashu-motion，MIT，见 NOTICE.md）：原样的浏览器全局脚本，只由 components/clip/load.ts 在渲染端加载；不改这里，要改行为改 components/clip/
src/styles/<id>/             风格库：自有风格（事后沉淀，只定气质：style.ts + README.md + refs/）+ 收录的 lemo-opuscar 59 个风格（多一份 STYLE.md 原文、DEMO.md；登记在 opuscar.ts，导入脚本生成）。注册在 src/styles/index.ts
src/probe/                   独立 Remotion 入口：内容中性的验收探针 + 风格样张
scripts/                     guard（守门）· render（出片 / 封存）· spot / sync / music / composer / epidemic（声音平台）
                             blender · hybrid（拼接）· hw（硬件档位）· style
blender/                     Blender 侧 Python：机身、glb 导出、体积光、漫游相机、材质与灯光预设、场景搭建器
tools/studio/                工作台（127.0.0.1:5177）
docs/method/                 导演方法：taste.md（高级感标准 + 设计评审表，本工程写的）、director / visual-direction / rhythm / colour / craft（借鉴 huashu-motion 原文）、animation-guide（ClaudeAnimationBase 原文：手绘角色动画、read 计时法）
docs/library/                视觉语言库：README（中文索引 + 选择矩阵）、languages/ techniques / formats（原文）、engine-map（换算到本工程）、adaptation（改写说明，冲突时以它为准）、exemplars/（好例子）
docs/experience.md           经验（vw learn 读写）
docs/templates/              说明模板（导演决策单、3D 场景说明）
public/                      渲染时整份打进 bundle —— 只放真要用的素材，测试素材不要留在这里
out/                         产物与缓存（gitignore）
```

## 4. 硬规则（守门会拦）

**确定性**：并发渲染时每个标签页必须画出同一帧。
- 禁止 CSS `animation` / `transition` / `@keyframes`。
- 禁止 `Math.random()`、`Date.now()`、`performance.now()`，**注释里也别写这几个调用**，守门按文本扫描。随机数用 `anim.ts` 的 `createRng`。
- 禁止 `useFrame`。时间 t 由幕组件按帧号算好、当 prop 传入，相机用 `CameraRig` / `PoseCamera` / `FlightCamera` 在 `useLayoutEffect` 里摆位。
- 资源加载必须挂 `delayRender`，并且和 `continueRender` **在同一文件里调用次数一致**（守门按次数配对）。要放锁的地方不止一处时，收成一个出口。
- 用 `vw check` 跑这些规则；`src/shared/guard-rules.test.ts` 会扫全部影片。

**时间**：
- 一律用秒和幕表（`buildPlan`）。拍点、音效、配乐都以秒存，只在挂载时换算成帧。
- 幕内编舞用**乐谱秒**；外部视频片段按**放映秒**播放，`FilmClockContext` 负责换算。
- 对拍会拉伸画面时间，所以成片时长可能和幕表总长不同。
- **配乐两条路**：画面先行（`vw music match`，配乐去适配、弹性对拍拉伸画面）或网格先行（`audio/score.ts` + `vw music score`，模型为这部片逐音符写谱，画面落点全从网格取，不拉伸）。网格先行的片子 `vw check` 会拦不在网格上的拍点（容差 1 帧）。拨弦物理建模（`pluck:<preset>`）要 numba：Intel Mac 上能装的 numba 要求 numpy < 2.4，和锁的 numpy 2.4.6 冲突，这台机器上用采样乐器或 `synth:pluck` 代替。

**声音**：
- **动作事件表 → 自动配声**：片子把画面动作登记成 `MotionEvent`（`shared/events.ts`），适配器实现 `events()`、用 `autoSpots(events, 声音映射表)` 生成音效；没配声、也没写 `silent` 理由的事件 `vw check` 直接报错。不要再手写一条条音效。
- **质感床**：动作事件只会生成「点」，段落底下的长音色（底色）用 `shared/beds.ts` 的 `sectionBeds` 按段落铺到 TEX 层（音色 `layered, texture-bed, warm|air|low|glass|tension` 或 CC0 drone），每段跟着情绪换；不铺要在决策单里写理由，`vw review` 会提示。
- **分层音色**：采购单 tags 写 `layered` + 角色词（card-land / count-tick / reveal-swell / focus-air / morph-slide / stamp / hero-hit / pre-hit），本地合成出瞬态 + 主体 + 同一混响空间 + 重拍低频的四层音色；铺底用 `texture-bed`（见上一条）。
- 元素按拍入场、逐个配声：`shared/beats.ts`（`beatGrid` / `onBeats` / `snapToBeat` / `sequenceSpots`），音高按配乐调性走；有音高的音色在采购单标签里写 pluck / marimba，本地合成会精确调在 A4。
- 所有 `<Audio>` 都在 `FilmAudio` 里，否则出音轨的 `-Audio` 合成会漏掉。
- **口播处理**：`vw voice film` 配完每句自动压缩并统一到 −18 dB RMS；`vw review` 查人声比配乐高多少（目标约 10 dB）。
- **声音规则**（`vw review` 提示）：至少两处真静默（比平时低 12 dB 以上）、至少两个段落交界由声音带过去、声音设计表里写的层都要真的在混音里。
- **口播（VO 层）是可选的**：只有片子有 `audio/voice.json` 才有，**要不要口播每部片按需先问用户**，不要默认加。音效相关的类型用 `SfxLayer`（不含配乐和口播）；`mix.json` 的 `VO` 增益可以不写（缺省 0）。
- `sfxPlan.json` 只能由脚本生成，不手写。
- 配乐段里静音超过 15%，或段尾空出超过 2 秒，`vw check` 报错（配乐覆盖率守门）。

**风格**：
- 片子默认在 `theme.ts` 里自己写主题（`colors` / `fonts`，需要时加 `frame` 等片子特有的段）；沿用库里的风格时才用 `extendStyle(风格, {只写不同的部分})` 派生。颜色守门读的是片子主题的色板，两种写法都适用。
- 写死在片子代码里、不在色板里的颜色，`vw check` 会报警（第一阶段只报警）。

## 5. 加画面能力的套路

1. **纯函数放 `src/shared/`**，配 `*.test.ts`。测试要守住确定性（同输入同输出、按种子）、端点值，以及"动作不短于 `MIN_ACTION_SEC`"。
2. **共用层只放引擎**（时间、画布、3D、镜头桥、字体、收录的画法引擎）：参数全部外露、**不写死任何画风**，组件自带中性的默认值。带画风或版式的做法是**参考实现**（`src/components/README.md` 分了类）：片子读懂后复制进 `src/films/<片>/` 再改，不直接拼；新片默认按内容自己画（2026-10-27 用户定：共用的是底层能力，不能把画面框住）。从 `index.ts` 导出。新能力同步写进 `docs/capabilities.md` 和 `docs/library/engine-map.md`（手法 → 原理与做法）。
3. **写一个内容中性的探针**（`src/probe/`，在 `src/probe/index.ts` 注册），渲几帧**亲眼看图**，再把同一帧渲两次，比对是否逐字节一致。
4. `npm run typecheck && npm test` 全过，再汇报。汇报时如实区分"测试验证过""探针渲过""在真片里用过"三个层级。

## 6. 改片前先封存

已出的片子要重新出片之前，**先 `vw archive save <片> --label=vN` 封存当前版本**，再改、再渲。成片文件会被新版本直接覆盖，不封存就没法做前后对比。

## 7. 镜头编排：模型写清单，工程衔接

镜头"去哪、停多久、怎么过去"是创作决定，由模型按每部片的内容写成**镜头清单**（`shared/grammar.ts` 的 `Shot[]`），工程只负责衔接：`compileShots` 编译成 CamKey，输出 `moves`（移动区间）和 `cuts`（硬切时刻），`validateShots` 检查清单自洽。**工程里不内置编排规则**，不要把某部片的套路写成通用默认。

- 停留：`still` 静止、`push` 缓推、`drift` 慢漂。
- 过渡：`glide` 直推、`arc` 先拉远再推近、`whip` 甩镜、`cut` 硬切。
- 用什么镜头语言（漫游 / 舞台 / 蒙太奇…）由模型按内容从 `docs/library/` 选，风格里不放镜头偏好。
- `moves` 交给声音适配器划弹性区（移动段 = motion）、配镜头移动音效；`cuts` 交给闪帧扫描当成预期切点。
- 镜头"怎么动"的手感（缓动曲线、弧线两半速度连续）在 `shared/shot.ts` / `grammar.ts` 里固定，这部分是工程。
- **2D ↔ 3D 镜头桥**（`shared/bridge.ts` + `components/three/Bridge.tsx`）：`cameraFromStage` 由 2D 镜头算出等价的 3D 相机（交接帧逐像素一致），之后 3D 相机自由运动；`BridgeStage` 把 DOM 纸面按 3D 相机射影贴合、three 画布叠在上面；`ProjectedHtml` 把 DOM 文字贴到任意 3D 平面（3D 里的中文字）。局限：纸面 DOM 永远在 3D 物体下面，相机不能转到纸背面。
- **光影质感**（`components/shot/Light.tsx`）：`LightSweep` 光扫、`PaperLight` 纸面光照 + 纤维 + 颗粒、`GlowText` 落定发光。`PaperLight` 放在 Stage 外面作为同级，不要放进 foreground。

## 8. 硬件档位

`scripts/hw/profile.ts` 按机器分两档，缺省参数都从这里取。命令行参数和环境变量始终优先；`VW_HW_TIER=apple|intel` 可以强制指定档位。

- **apple（M 系列）**：Cycles 走 Metal GPU，128 采样；成片 2× 超采样；机身用 Blender 帧序列。
- **intel**：Cycles 走 CPU，32 采样 + 降噪；成片不开超采样；机身用 three.js 实时版；预计超过 30 分钟的 Blender 任务要加 `--accept-slow` 才会开渲。

当前这台开发机是 Intel（i7 + Iris 核显），Blender 渲一帧约 11–20 秒，长任务放后台跑。

## 9. 踩过的坑（改相关代码前先看）

| 现象 | 原因与处理 |
|---|---|
| 后期链开着时，饱和色的背光面变成纯黑 | 柔光（SOFT_LIGHT）颗粒在负值上开平方得到 NaN。`FilmPost` 改用 OVERLAY。us 短片自己那份 `Post.tsx` 还是柔光，没改 |
| 同一帧渲两次颗粒不同 | `@remotion/three` 用墙钟推进 R3F 时钟。`FilmPost` 接管 composer.render，把效果时间钉在影片时间上（composer 是异步建的，要用回调 ref 挂接） |
| three 画面是空的或全黑 | ThreeCanvas 是手动单帧：模型或 composer 就位后要再 `advance` 一帧，然后才放渲染锁 |
| 中途切 dpr 后 WebGL 上下文丢失 | dpr 只在挂载时定一次（`FilmCanvas`） |
| 中段要「静 → 爆」却只有一个高潮 | 作曲引擎原来只认主高潮。现在音乐真值的 `cue.climax2` 会写进谱里：前面 `!stop:2!` 静默半小节（渲染端 `applyStops` 落实）、到它 `!mark:hit2!` 镲片 + 重拍；本地作曲时不再走第二高潮的事后剪接 |
| 本地配乐只响了前 23 秒 | 作曲引擎曾忽略段长和高潮。现在由 `structure.ts` 按段长写谱；`match --local` 必须把段长、速度、高潮都传进去 |
| ABC 谱的高潮漂了 0.1 秒 | 解析器曾只读整数速度，已改成支持小数 |
| Blender 机身和屏幕错位 | three 的欧拉 XYZ 换基到 Blender 要用 `'YZX'`（`blender-basis.test.ts` 锁着）。坐标换基是 (x, y, z) → (x, −z, y)，three 的 fov 是竖直视角，Blender 侧用 `sensor_fit = VERTICAL` |
| Node 测试里 import KaTeX 组件报错 | Node 不认 `.css`。样式表只在组件里引入，`katexKit.ts` 保持纯 TS |
| 擦除对比时片子的层盖到了封存画面上 | 两层各自 `isolation: isolate`，并显式写 zIndex |
| Blender 存档多出一个 `.blend1` | 保存前设 `preferences.filepaths.save_version = 0` |
| 图像序列在 Blender 里尺寸为 0 | `images.load` 是懒加载。尺寸直接读 PNG 文件头 |
| SVG 遮罩 id 冲突 | 用 `React.useId()`（去掉冒号），不要用全局计数器 |
| 世界层里的文字一个字一行（竖排） | 绝对定位、不写宽度的文字块，可用宽度 = 容器宽 − left；放在 1920 宽的世界层里、left 超过 1920 就会变负。区域内容包一层足够宽的定位容器 |
| `vw music plan` 写出的入点解析不到 | 曾写死 `SC.start`；现在引用第一幕的 id |
| 每个音效都比画面晚一帧、起音发软 | Remotion 对一整帧用同一个音量；按帧起点算淡入时第 0 帧系数为 0，起音那一帧被静音。渲染端一律用 `audio-math.frameFadeAt`（淡入取帧末、淡出取帧首） |
| `PaperLight` 把整个画面盖成一片白 | 放进了 Stage 的 foreground：前景层带 z-index 是独立层叠上下文，混合模式只和同上下文内容混合。放在 Stage 外面作为同级 |
| 镜头桥进 3D 后整张纸面消失，只剩 overlay | ① `paperTransform` 曾用纸面原点那块 W×H 的四个角反推矩阵，相机离原点很远（长卷世界后段）时原点在相机身后，矩阵是错的 —— 已改为直接由相机矩阵构造（`bridge.test.ts` 锁着）。② 纸面上任何元素伸到相机身后（压低机位后，相机在纸面南侧上方），浏览器会丢掉整层；铺满全场的底纹在 3D 模式下要裁到相机位置以内 |
| p5 / p5.brush 引擎 import 进来就报 ReferenceError，或 brush 未定义 | 上游是 classic script（文件间共享全局 const），p5.brush 的 UMD 只在已有全局 p5 时注册插件；ES 模块打包会切断这些。由 `components/paint/load.ts` 注入 `<script>` 加载，不要 import。页面早已 load 完，p5 不会自动进全局模式，要手动 `new p5()` |
| 中文口播转写核对总差一点 | Whisper 常写繁体、数字写成阿拉伯数字。约定：`text`（字幕）写数字「3.36%」，`say`（念的）写读法「百分之三点三六」；专名读法不同就填 `asr` |
| 采样配乐的高潮被测早了一小节、对拍锚点降级 | 分析器按能量跳变找高潮；起势小节（吊镲渐强 + 军鼓滚奏）比高潮跳得猛。`sampled.ts` 让起势小节收一口气（旋律 / 低音 / 铺底 55%，滚奏从弱渐强），高潮再加厚 |
| 响度拉到 −14 后「静默 → 重击」没了劲 | loudnorm 线性增益超真峰时退回动态模式，实测 LRA 5.0 → 2.3。`master.ts` 改为限幅只削瞬态 + 纯增益（LRA 4.9） |
| Python 依赖装不上 | 本机 Python 3.11：numpy ≥ 2.5、scipy ≥ 1.18 要 3.12；Intel Mac 上 onnxruntime 只到 1.23.2。都已在 requirements.txt 里锁好 |
| Kokoro 中文读错字 | 实测三个中文声音 Whisper 相似度 0.55–0.69，不能用；英文全过。中文用 edge-tts（需联网） |
| edge-tts 连微软服务 403 | 旧版（7.2.8）的连接令牌被微软拒了；升到 7.3.1 解决（2026-10-26 用户同意提前一天升级，实测中文逐句核对全过） |
| 工作台里拖层推子，听到的变化是成片的两倍 | 试听时片段包络用了含层增益的公式、层节点上又乘了一遍层增益。改成片段链只放片段自己的增益 / 淡化 / 让位，层推子和总线在后级节点上（和离线测响度同一条链） |
| 有口播的片子成片里没有人声 | `Root.tsx` 里给出片用的 `<片>-Audio` 合成曾没把 `truth.voice` 传给 `FilmAudio`（口播只在探针里验过）。已补上；第一部真用口播的片子是 anlan-window |
| 变调在成片里没生效（工作台里却有） | Remotion 渲染时 `playbackRate` 走 atempo，只改速度不改音高。变调一律离线做成文件（`shared/pitch.ts` 命名 + `scripts/spot/pitch.ts` 生成），两边原速播放；`rate` 只表示变速 |

## 10. 导演决策：模型设计，工程兜底

做片时画面怎么设计、声音怎么配、是否 3D 主镜头都由模型决定。流程见 SKILL.md「导演流程」：读经验和方法 → 读素材 / 参考 → 开工前问答 → **内容策划（信息表 + `vw brief` 纸面稿）** →（参考不足时）三个方向 → 决策单 → 四张海报帧过设计评审 → 先做最难的一段 → 铺全片 → `vw check` → 封存、出片 → 冷看（`vw critic` + 不带上下文的子代理）→ `vw review`（含设计评审）→ 交付 → 收经验。

- **新增能力时同步更新 `docs/capabilities.md`**（能做什么 · 在哪 · 什么时候用 · 前提），否则模型规划时看不到它。
- `vw review`（`scripts/guard/review.ts`）只给提示、不拦出片；要变成硬规则的放进 `vw check`。
- 方法库借鉴 huashu-motion（原文照收、开头注明出处），本工程的改写与取舍写在 `docs/library/adaptation.md`，冲突时以它为准；觉得原文不合理就改 adaptation，并写理由。
- **冷看**（2026-10-27）：`vw critic <片>` 只打包观众看得到、听得到的东西，由做片的模型另起一个**不带上下文**的子代理按 `out/<片>/critic/PROMPT.md` 审片、写 `out/<片>/critic.md`；`vw review` 把它复述的一句话和信息表结论并排。模型自评（taste.md 评审表）照旧，两者都写进决策单。

## 11. 相关文档

- `architecture.html`：对标基准（系统架构加配音平台；本机文件，不进 git）。
- `skills/video-workbench/SKILL.md`：做片纪律。
- `src/styles/<id>/README.md`：各风格说明。
- `docs/capabilities.md`：能力目录（工程能做什么）。
- `docs/method/taste.md`：高级感的标准、反套路清单、设计评审表。
- `docs/library/README.md`：视觉语言库（怎么选）；`docs/library/exemplars/`：好例子。
- `docs/experience.md`：经验。
- `docs/templates/director.md`：导演决策单模板。
- `docs/templates/scene-3d-spec.md`：3D 场景说明模板。
- `docs/history/video-workbench-design.md` / `video-workbench-plan.md`：最初的设计和方案（部分内容已过时，以代码为准）。
