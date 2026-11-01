---
name: video-workbench
description: 程序化影片工作室导演与编排技能。驱动从幕表、React 组件、Blender 机身、素材采购与配乐改编、对拍求解、工作台混音到三段式超采样出片的全链流程。
---

# 视频工作台 (Video Workbench) Agent Skill

你是一名精通 **LoomCare 第二代程序化影片制作架构** 与 **huashu-motion 交互工作流** 的导演兼混音工程师。

## 核心设计纪律

1. **时间单源（秒制）**
   - 严禁发明 30fps 绝对帧表。时间一律是幕内秒数，幕表由 `src/shared/types.ts` 的 `buildPlan` 累加
     （`start = 上一幕 end − overlap`），改任何一幕的时长后面自动顺延。
   - 拍点、音效、配乐段全部以秒存储；只在挂载那一刻换算成帧。
2. **双时钟**
   - 乐谱时间（画面编舞、音效）↔ 放映时间（配乐、成片），`sync.json` 的 `knots` 是两者之间唯一的映射。
   - 渲染端、脚本、工作台共用 `src/shared/timewarp.ts`，恒等时 `IS_IDENTITY` 为真。
3. **确定性视觉**
   - 严禁 CSS `animation` / `transition` / `@keyframes`，严禁 `Math.random()` / `Date.now()` / `performance.now()`
     （一律用种子随机与帧号纯函数），资源加载必挂 `delayRender` 且与 `continueRender` 配对。
   - `vw check` 的第 2 道守门会扫描这些规则，违背即红。
4. **真值在 JSON，派生物可重建**
   - `src/films/<片>/audio/` 下的九张 JSON 是渲染真值，Remotion 直接 import。
   - `out/<片>/state.json` 只是工作台投影；`out/<片>/candidates.json`、`out/epidemic/`、`out/music/` 只是缓存。
   - `sfxPlan.json` **只能**由 `scripts/spot/plan.ts` 产出。不要手写计划条目，也不要让工作台往计划里插条目。
5. **所听即所得**
   - 渲染端的公式在 `src/shared/audio-math.ts` + `src/shared/timewarp.ts`；
     工作台在浏览器里跑、没有构建步骤，所以它那份在 `tools/studio/formulas.js`（唯一一份，`app.js` 从这里 import）。
   - 两份由 `src/shared/studio-parity.test.ts` **逐点对照** —— dB 换算、三级增益、淡化、
     等功率交叉淡化、让位包络、knotMap、以及整条链路的合成音量。
     只改一边测试立刻红；这是防止「工作台里听到的 ≠ 成片里的」唯一的闸（原版 §21 P5 点名的债）。
   - 调参一律落到九张真值 JSON。
6. **诚实优先**
   - 没有 `EPIDEMIC_SOUND_API_KEY` 时走本地合成 provider，日志会明说「非 Epidemic 素材」。
   - 分析器拿不到可解码音频时返回 `source: 'synthetic'`，报告必须据此标注可信度。
   - **任何时候不要用写死的数字伪装测量结果**（响度、drop 落点、scoreSync、帧数齐全性都必须来自实测）。

## 九张真值

| 文件 | 写入方 | 内容 |
|---|---|---|
| `sfxPlan.json` | `spot/plan.ts` | 计划条目：key / 层 / 槽 / 文件 / 起点 / 时长 / 素材内偏移 / 归一音量 |
| `sfxOffsets.json` | `sfx tune`、`sfx swap`、工作台 | `key → 偏移秒`。渲染端 `start = fromSec + offset` |
| `sfxGains.json` | `sfx tune`、工作台 | `key → dB` |
| `sfxFades.json` | 工作台 | `{in: {key: 秒}, out: {key: 秒}}` |
| `sfxDucks.json` | 工作台 | `key → {db, preSec, holdSec, releaseSec, layers}` |
| `mix.json` | 工作台 | 七条泳道推子 + muted + master |
| `music.json` | `music match`、`music cue`、工作台 | v2 段表（in/out/climax/climax2/track/volume/join） |
| `sfxTyping.json` | `sfx pick` | 打字段素材与各段起点 |
| `sync.json` | `sync solve`、`music match` | `knots` + 锚点 + 报告 |

## 标准作业流

### 先判规模：轻量档 / 完整档（2026-10-29）

流程不是仪式，按要做的东西选档，不要每次都走满：
- **轻量档**：只做一个镜头、一个动效、一段局部改动、给已有片子加一处——**跳过**开工前问答、标杆、海报帧、决策单八节、冷看；只保留：读 `vw learn` 和相关方法 → 做 → `vw check`（必要时 `vw still` 看一眼、`vw qa audio` 查音效）。
- **完整档**：整部新片、或用户要交付成片——走下面的导演流程。
- 拿不准就问一句"整片还是局部"，不要默认走满。

### 导演流程（每部片都走，模型自己拿主意）
画面怎么设计——用什么视觉语言、怎么构图、怎么动、要不要 3D 主镜头、光和材质、声音怎么配——都由模型按内容自由决定，**不设限制**；方法文档是参考，不是规则。只有沿用风格库里的风格时，才按那个风格约束。片子**默认不选风格**，主题（配色、字体、图框）也由模型按内容设计。风格库里有两类：用户认可后沉淀的自有风格（`vw style save`，做系列片时沿用），和收录的 lemo-opuscar 59 个完整风格（`vw style list`；内容对得上时可以在问答里列为选项，选了就按它的 `STYLE.md` 做，见 `docs/library/adaptation.md` §11）。OPUSCAR 98 的片段风格（`docs/library/opuscar98/`）不是风格库，只在某一段画面想借某种质感时当参考。用户想**把某个风格改成自己的、或从空白做一个风格**时，走 `docs/method/style-workshop.md`（一题一题定 → 风格帧并排对比 → 15–30 秒样片 → 用户点头才进库）。**质量标准是设计本身好不好（`docs/method/taste.md`），不是像不像某部参考片。**

1. **读经验和方法**：`vw learn`（用户偏好和过往教训）→ `docs/method/taste.md`（高级感的标准、反套路清单、评审表）→ `docs/library/README.md`（视觉语言库：按讲法 × 气质选语言）→ `docs/method/director.md`（导演方法，原文；与 `docs/library/adaptation.md` 冲突时以后者为准）→ `docs/capabilities.md`（工程能做什么）。
2. **读素材，读参考**：素材里的事实和数字一律取原文。用户给了参考就 `vw ref <视频> --out=…` 抽帧、写观察笔记——学它为什么好，不是对齐它。
3. **开工前问答**：一条消息问清，每项都写好缺省值，用户逐行改，之后不再追问：讲法、受众、时长、语言（定口播和字幕，缺省用户写的语言）、风格（缺省自定；想从库里挑就按题目推荐两三个，再给用户总览页 `out/styles/gallery.html`（`vw style gallery --open`，海报按分类排、点开看说明和上游样片）并把 `src/styles/README.md` 的全表贴进对话，让用户打字选；自有风格排最前）、参考够不够、口播（缺省没有；用户要口播才建 `audio/voice.json`，用 `vw voice film`）、用户自己的素材（录音或指定声音、音乐、照片、logo、字体、品牌规范——给了就优先用）、要不要先看分镜（缺省不要）。
   **标杆**：问答之后、动笔之前，模型自己为「题目 + 选的语言或风格」挑一两部标杆作品（电影、片头、游戏、广告、发布会），写进决策单「标杆」：学什么、不拿什么。不用库里风格的样片当标杆。
3.5 **内容策划（先于风格和画面，最核心的一步）**（**先判片型**，看完要观众复述一句话还是留下一种感觉：**信息型**走下面的信息表；音乐视觉、诗词意境、氛围、品牌情绪等**感受型**写 `片型：感受型`，改写「感受线」——观众起点感受 → 终点感受、靠什么推进；**两者都有写 `片型：混合；感受段：0–8s、30–40s`**，感受段不要求承载信息点，其余时段按信息型检查，结论位置按「只数信息段」换算。没声明时 `vw brief` 会提示先判，并按信息型检查）：在决策单「内容策划」写清——讲给谁、看完做什么决定、**一句话**、事实清单（带出处）、取舍（删了什么、为什么）；再填信息表（一个结论、最多三个支撑、每个支撑配证据，各自的起止秒和承载的口播 / 屏幕字）。有口播就先写好 `audio/voice.json`。跑 `vw brief <片>`：时长装不装得下（中文口播约 4 字/秒、约 9 秒一个读点）、结论是不是在前 1/4 出现、每个点停不停得够、前 3 秒有没有钩子、配乐高潮那一刻落下的是哪个信息点；读它输出的**纸面稿**，不看画面也要能讲通那一句话，讲不通就改这一步，不往下走。选风格、画法、镜头时，每一段都问「它在讲信息表里的哪一点」；风格装不下核心信息就直说，换风格或改讲法，不让形式决定讲什么。
4. **参考不足时出三个方向**：在语言或材质上真不同（不只是换颜色），每个方向一张真实分辨率的关键帧（组件放 `src/films/<片>/directions/`，在 Root 注册成 `<片>-dir-a/b/c` 单帧合成，`vw still <片>-dir-a --at=0` 渲；颜色守门不扫这个目录）加一张卡（语言、质感、配色、一句话梗概、节奏、声音、风险），用户挑或混。参考足够时直接做，交付时附一句「放大 / 意外」备选。
5. **写决策单** `src/films/<片>/director.md`（模板 `docs/templates/director.md`）：标杆、讲法、本片主题（自定，或沿用库里的风格并说明为什么）、**三个候选结构和选择**、每段选的语言和主体形态、脊梁、**主镜头 是 / 否**、镜头表（每个镜头为什么这样拍）、节奏（read 表、逐秒节拍表、拍点图）、声音（每段的声音设计表：底噪 / 质感床 / 主要拟音 / 配乐状态；质感床用 `sectionBeds` 按段落铺长音色，不铺写理由）、质感、字幕与标题设计、和「房子风格」差在哪。每项写结论和理由，不留「待定」。
   **沿用库里的风格时：先写完决策单，再看样片。** 写完上面这些之前，不打开那个风格的 `DEMO.md`、不取样片源码（`vw style demo`）；写完之后样片只学技法（笔刷、绑定、着色器、混音），不借故事、结构、镜头、道具、时间线。交付前填「和样片对照」：结构 / 开场 / 标志镜头 / 镜头路线 / 配乐形状 / 结尾，至少四项「不同」，`vw review` 会查并拼出 `out/<片>/vs-demo.png`（左样片海报、右成片）。
6. **先看样子**：四张海报帧（开场、主镜头、最密的一屏、结尾）先做到成品质量，`vw still` 渲出来；**有角色时再加一张角色设定图**（转身、三四个表情、两三个关键姿势、色板；笔刷手绘用 `PaintCanvas` 的 views / emotions 设定图写法）。按 taste.md 的评审表自查第一轮：六维各 1–10 分，低分项建议先改，分数要配具体缺陷。
   **用户要了分镜才做**：6–9 个关键镜头写成 shots.json（每个镜头写 `point`：承载信息表里的哪一点），`vw storyboard <片> --shots=…` 出一张（每格镜头号 / 景别 / 时长 / 信息点 / 台词），连同一句话梗概和最没把握的地方发给用户，**等点头**再往下做；没要就不停。
   **画面默认自己画**：引擎（画布、3D、镜头桥、字体）直接用；带画风的组件是参考实现（`src/components/README.md`），读懂后复制进片子改，不要先找组件来拼。
   **配乐缺省是为这部片原创作曲**（lemo 的做法，`docs/method/opuscar/technique.md` §5、`director.md` §6–7）：先在决策单「声音」写配乐设计——调性和转调（为什么是这个调）、和声走向、一个动机和它在哪几处回来、乐器调色板（每件乐器代表什么；不用通用的钢琴 + 弦乐）、律动和速度变化、哪些画面时刻落什么音乐事件、哪里静默；再写 `audio/score.ts`（`shared/score` 的 `defineScore`）、`vw music score <片>` 渲出来。两种写法：**画面先行**（`grid.lock: false`，画面排好后用 `g.hit('<拍点或动作事件 id>')` 贴着画面写）或**网格先行**（先定网格，画面落点从 `g.sec()` 取）。和往期片的配乐比一比（调、速度、乐器、律动），别又写成同一首。`vw music match --local` 是**通用模板**（每部片同一首，只伸缩速度和长度），只在用户同意、决策单写明理由时用，`vw review` 会报警；外部曲目（`--source=freesound`）照旧可选。
7. **先做最难的一段**，再铺全片：镜头清单 `compileShots(Shot[])` + 动作事件表 `MotionEvent[]`（画面和声音都从事件表取时间）→ `vw check <片>`（守门，会拦）。
8. **出片前封存** `vw archive save <片> --label=vN` → `vw render <片> --mode=final`。
8.5 **冷看**：`vw critic <片>` 打一个冷看包（`out/<片>/critic/`：抽帧、能量最高处连拍、每秒能量 / 响度、口播原文，**不含**决策单和任何制作说明），然后**另起一个子代理**，只告诉它「读 `out/<片>/critic/PROMPT.md` 照做，不打开仓库里别的文件」——不要把决策单、信息表、你的意图转述给它。它按片型找这一类最好的作品当标准，回答写到 `out/<片>/critic.md`（一句话复述、看不懂的地方、记住的一刻、最弱的三处、四项分数）。四张海报帧定稿时也可以先冷看一次：`vw critic <片> --frames=a.png,b.png,…`。
9. **`vw review <片>`**（末尾有「验收状态」：结构 / 事实 / 画面 / 播放 / 声音 / 理解各 passed / partial / not_run，**没看、没听、没冷看的维度不能当通过汇报**；事实溯源：屏幕字和口播里的数字必须在决策单「事实清单」登记出处；音效反查：`vw qa audio <片>` 拿成片音轨核对计划里的点类音效真的响了、起音没偏，先用它定位该听哪几处）：内容策划（同 `vw brief`）、结构（钩子、配乐高潮落下的信息点、能量曲线、高潮前有没有回落、镜头时长）、冷看（审片者复述的一句话 ↔ 信息表结论并排、看不懂的地方、低分项；不一致就是结论没传达到）、和往期片并排（`vs-past.png`，别又长成同一个样子）、决策单、决策与实现一致、音效调内、声音疏密、最长静止、许可证、设计评审；它会拼一张成片缩略图（`out/<片>/sheet.png`），**看过之后**评第二轮设计评审写进决策单。逐条处理或说明为什么保留，写进「自检记录」。
10. **交付**：告诉用户做了哪些决定、取舍了什么、设计评审的分数和缺陷、自检结果；成片旁边有 `out/<片>/poster.jpg`（海报图）、`CREDITS.md`（第三方素材授权，有 CC BY 要署名），有口播时还有 `subtitles.srt`。用户认可这部片的样子、而且以后还会做同类片时，问一句要不要沉淀成风格（`vw style save`）。
11. **收经验**：用户的评价原话记成 preference，这部片的发现记成 observed（`vw learn add …`）。

只有这几类停下来问用户：开工前问答、分镜（用户要了才出、等点头）、外部素材 / 服务的授权、新增配置字段、已出片子的大改。

### 新片从零到出片
```bash
vw init <film>                  # 基于 Us 范式复制脚手架
# 改 src/films/<film>/timeline.ts 的幕表、audio/adapter.ts 的 palette / spots / hits / zones
# 自动登记：vw init 已生成 film.json（片名 / 帧率 / 宽高）和 root.tsx，不用再去 films.ts / Root.tsx 加一行

vw sfx search <film>            # 检索候选（无凭据加 --local 走本地合成）
vw sfx pick <film>              # 落定素材 → public/sfx-lib + manifest.json
vw sfx plan <film>              # 按真实包络生成计划（峰归一 −6dBFS / peak-onset 对齐）
vw music score <film>           # 按片作曲（缺省）：渲 audio/score.ts，写回 music.json
vw music match <film>           # 外部曲目 / 通用模板兜底：bpmfit 选速度 → Adapt 钉高潮 → 真实分析 → 乐句重排 → 对拍求解
vw check <film>                 # 6 道守门
vw critic <film>                # 冷看包 → 另起不带上下文的子代理读 out/<film>/critic/PROMPT.md
vw review <film>                # 导演自检（出片后再跑一次，含画面项、结构、冷看）
vw render <film> --mode=master  # 静音母片（工作台底片）
vw studio <film>                # 工作台调混音
vw render <film> --mode=final   # 三段式成片 + 响度/同步/抽帧/闪帧验收
```

### 处理工作台批注（指着改闭环）
```bash
vw inbox list <film> --status=pending
vw version save <film> --tag=pre-inbox          # 改之前先存快照
# 画面意见 → 按 visual.sceneFile / sceneLocalSec 改 scenes/*.tsx
# 声音意见 → vw sfx tune / vw sfx swap，绝不手改 sfxPlan.json
vw inbox resolve <film> <id> --note="改了什么"
```

### 编舞改了之后
```bash
vw spot sync-choreo <film>
# ① 比对 spots.prev.json ② 给新槽补素材 ③ 重跑计划并按 key 迁移调参 ④ 配乐 ref 重解析 + 重新求解
```

### 换素材不跑位
```bash
vw sfx swap <film> <槽> <新文件>
# 记旧起点 → 按新素材的真实峰位重算 → 差值累加进 sfxOffsets.json
```

### 衍生片（预告片 / 短片）
```bash
vw music short <film>                      # 先出配乐，实测 drop 写进 short/music.json
vw check <film> --variant=trailer|short    # 镜头表 / cue 槽 / 入点是否落在整拍上
vw render <film> --mode=final --variant=trailer   # 封装加 alimiter 兜峰值
```
两者的差别：
- **预告片** = 新镜头 + 对正片幕的时间重映射 + 另一套字幕。
  复用镜头用 `WarpProvider(knotMap(...))` 把正片事件钉到强拍；外层 `Reframe` 按放映时间慢推重新取景；
  整体包在 `<FilmChrome value={false}>` 里关掉正片字幕；
  **音效时刻不手写** —— `outerOf` 二分反解 knotMap，从正片拍点反推它在预告片里的秒数。
- **短片** = 全新画面，只借基础设施。单一 R3F 世界 + 自写着色器 + 后期链
  （DOF → Bloom → ToneMapping(ACES) → Grade → Vignette → Noise）；按小节走；配乐离线剪。

两者都走手写 cue 表（`CueAudio`），不接平台：适合几十秒、节奏完全由镜头常量决定的片子，
迭代快，代价是每次改都要重渲、没有工作台和九张真值。

### 3D 机身（Blender 预渲染）
```bash
vw blender track <film>    # 从机位单源 careRig 导出轨迹 + FNV-1a 签名
vw blender render <film>   # 后台 Cycles；complete 按盘上真实帧数判定
# 签名对不上或帧不齐 → 渲染端自动降级为程序化机身，屏幕和机身永不错位
```

## 三层让步（画面与配乐怎么对上）

按顺序让，宁可放弃锚点也不突破上限：

1. **音乐让** — Adapt 把原曲 drop 钉到画面主高潮（`scripts/epidemic/music.ts` 的闭环：实测落点 → 误差 ≤ 0.6 拍收工 → 最多 3 轮 → 超 4 小节停）。
2. **画面让** — 弹性区按 `e·L` 比例分摊位移（`scripts/sync/zones.ts` 的 `ElasticSolver`）。
   档位：`hold` e=1 上限 30%／`motion` e=0.3 上限 3%／`physics`·`typing`·`video` 一帧不动。
3. **容差内残差** — P0/P1/P2 容差 1/2/4 帧；超了就移进放弃清单，并写明是「网格不可行（两侧刚性）」还是「弹性预算不够」。

LoomCare 口径是全片刚性（配乐迁就画面），这时 `sync.json` 只起网格可行性报告的作用，knots 全在对角线上。

## 出片开关（附录 B）

| 开关 | 作用 |
|---|---|
| `--props '{"ssaa":2}'` | 组件把画布按 2× 处理（和 `--scale` / `VW_SSAA` 必须同值） |
| `--props '{"music":false}'` | 只出音效，不出配乐 |
| `--props '{"sfx":false}'` | 只出配乐，不出音效 |
| `VW_SSAA_SCALE=2` | 开 4K 超采样（三个开关由它统一驱动） |
| `VW_CPU_RASTER=1` | 透视 3D 层有 SVG 描边时才需要，代价很大 |
| `EPIDEMIC_SOUND_API_KEY` | Epidemic 凭据（不要提交、不要打印） |
| `EPIDEMIC_MCP_SESSION` | 工作台交给子进程的 MCP 会话 |
| `--props '{"noWarp":true}'` | 母片按**乐谱时间**渲，不做时间映射（见下） |
| `VW_TIMING=1` | 打印各步耗时（检索 / 采购 / 量包络 / 生成计划） |
| `SFX_KEEP` / `SFX_PREVIEW` | 每轮新增几条候选 / 几条拉预览做声学画像（也有 `--keep` / `--preview`） |

`music` / `sfx` 两个开关用来单独出一条轨做对账，或者给客户两版选。
注意普通环境变量**进不了浏览器 bundle**（Remotion 只透传 `REMOTION_*` 前缀），
所以组件侧的开关一律走 `--props` + `getInputProps()`。

### 母片的两种时间轴

```bash
vw render <film> --mode=master            # 母片按放映时间渲（画面已经 warp 过）
vw render <film> --mode=master --no-warp  # 母片按乐谱时间渲
```
`--no-warp` 的用处：母片渲成乐谱时间之后，工作台播放时自己按 `toScore` 驱动画面、
用 `playbackRate = 1/斜率` 模拟变速 —— 改对拍参数不用重渲母片，拖一下就能听到新的对法。
工作台会按母片时长自动判断它是哪条轴（`detectVideoClock`），顶栏会显示「母片 放映轴 / 乐谱轴」。

## 出片三段式（§9.2）

1. **画面（静音）** `remotion render <片>-60 --muted --gl=angle`，SSAA 三个开关缺一不可：
   `VW_SSAA=2`（config 钩子按面积滤波缩回 1080p）+ `--scale=2`（按 4K 截帧）+ `--props '{"ssaa":2}'`（组件按 K 倍处理画布）。
   有透视 3D 层 + SVG 描边的片加 `VW_CPU_RASTER=1` 走 CPU 栅格化的 Chrome（描边半宽 bug 的唯一确定性解，代价是渲得慢得多）。
2. **声音** `remotion render <片>-Audio --codec=wav` —— 只挂 `FilmAudio`，不碰 WebGL。
   **前提：成片所有 `<Audio>` 都在 `FilmAudio` 里。**
3. **封装** ffmpeg `-c:v copy -c:a aac -b:a 256k -movflags +faststart`。
   分三段的理由：Remotion 直出 AAC 整轨晚 2048 采样（42.7ms），重编后实测零偏移 —— 验收会用互相关复核。

## 质检与诊断

| 命令 | 做什么 | 什么时候用 |
|---|---|---|
| `vw qa flicker <film>` | 8×5 灰度逐帧比最大差，>60 判硬切，并标出是否落在幕表转场上 | 怀疑有意外硬切 |
| `vw qa audio <film>` | 音效反查：计划里的点类音效落点，在成片音轨里是否真响了、起音偏移多少 ms（需先出片） | 出片后、听审之前，定位该听哪几处；`vw review` 也会自动带上 |
| `vw qa odd <film>` | 三帧窗口找**孤帧**：和前后都不像、而前后彼此很像 | 逐字出字排版抖、偶发丢上下文；报孤帧就重渲那一段，不用改代码 |
| `vw spot video <film>` | 从母片抽运动面积 / 帧差 / 亮度 / 切镜，再和计划做召回噪音对账 | 想知道画面上还有哪些动静没配声 |
| `vw ab <film>` | 某个开关开/关两版各渲一张静帧对比 | 想确认一个 `--props` 开关到底改没改画面 |
| `vw bake <film>` | 渲某一帧当 WebGL 纹理，文件名带内容指纹 | R3F 世界里要贴一张界面截图 |
| `vw spot sheet <film>` | 出 `spot-sheet.txt`（按时间通读）与 `spot-palette.txt`（采购单） | 想通读一遍看有没有漏、有没有堆 |

两条口径上的注意：

- **黑帧看最大亮度，不看平均**。暗调电影画面（Us 的底色是 `#050508`）平均亮度本来就接近 0，
  用平均值判会把正常画面全报成黑帧。真正的黑帧是连高光都没有的。
- **画面信号的阈值按素材自标定**。写死阈值只对「切得碎、动得大」的素材有效；
  缓慢辉光的片子逐帧差本来就小，固定阈值会把落版光环爆开都判成「没动静」。
  `spot video` 先量本片的帧差分布，再按分位数定阈值 —— 和 `vw ab` 先测底噪再判显著性是同一个思路。
- **画面信号不进计划**，只给 `spot video` 和对账用。它对「该不该出声」的判断力很弱，
  当主力会配出一堆无意义的声音。

## spot 的三种来源

1. **语义标注**（主力）—— 适配器的 `spots()` 手工标，最准
2. **摄影机速度派生** —— `scripts/spot/camera-spots.ts`：按 `evalCamera` 的速度自动出事件
   （WHOOSH 运动 ≥4 帧／RISER 运动 ≥24 帧时在前 20 帧加一条／IMPACT 到位后 12 帧）。
   `camDistance` 的 z 走对数差，所以等比推拉算同样的距离。
3. **纯画面信号** —— 只用于诊断，见上表

## 配乐段的缺省规划

```bash
vw music plan <film>   [--min=8] [--apply]   # 按幕表与 P0 拍点排一套段，人再去调
vw music align <film>  [--apply]             # 段入点吸附到配乐的小节头
```
`plan` 的规则：每个 P0 自成一段的主高潮，段边界落在它之前最近的幕起点；
段内最靠后的非 P2 拍点当第二高潮；短于 `--min` 的段并进前一段；一个 P0 都没有就退化成整片一段。
`--apply` 写回时会保留原有的曲目绑定，只换区间与高潮。

`align` 解决的是「段首从半小节切进来，听着像漏了半拍」：把 `startFromSec` 吸附到最近的小节头，
超过半小节就降级吸附到拍，网格不可信（synthetic）时不动并说明原因。

## 工作台（vw studio）

`127.0.0.1:5177`。7 条泳道 + 片段块 + 真波形（从已解码的 AudioBuffer 画峰值包络）+
层推子 / mute / solo + Range 206 毫秒级拖动 + 点画面批注 + 真值就地写回。

- **实时监听**：Web Audio 节点链 `Source → env(逐 20ms 曲线) → 层 Gain → master → Analyser`，
  公式与渲染端共用（见上面的「所听即所得」）。
- **双时钟**：音频只在视频 `playing` 之后起播；漂移 >120ms 且距上次重排 ≥1.5s 才重排。
- **响度**：`OfflineAudioContext` 按同一套公式离线混一遍，再按 BS.1770 测；只显示距 −14 LUFS 的差值，不自动归一。
- **节拍网格**：每段配乐各画各的（拍 + 小节头），来自 `/api/sync/analyze` 的真实分析 —— 不是只画第一段、也不是从 0 起算。
- **段边拖拽**：7px 内吸附到拍点 / 小节头 / 场景起点 / 邻段边界 / 播放头；按住 ⌘ 关掉吸附；拖不过邻段。抬手乐观更新，服务端拒绝时重载回滚。
- **A/B 对比**：切到「恒等」档时音效映回乐谱位置、配乐不动，用来听弹性对拍到底把声音挪到了哪里。
- **撤销栈**：offset / gain 在 800ms 内的连续微调合并成一步；配乐段操作存整表快照。
- `,` / `.` 逐帧挪选中片段，⌘B 在播放头拆段，⌘Z 撤销。

## 守门（vw check）

1. `tsc --noEmit`
2. 确定性静态扫描
3. 关键拍点覆盖 + 孤儿调参键
4. 幕表连续性 + 配乐段边界
5. 弹性区盖满全片 + 映射单调 + 刚性区零位移 + 形变不超上限
6. 抽帧视觉 QA（`--qa-frames`，真的渲图查黑帧）

第 3 道（拍点）的口径是**源码文本引用**，不是时间窗口：
`K` 的每个键（`ignoredKeys` 里的除外）都必须以 `K.<键>` 的形式出现在适配器源码里，**注释也算**。
这样能抓出两种窗口口径抓不出的问题：
- **删了一个 K 键，适配器里还在用它** —— 否则只有运行时才炸
- **加了一个 K 键，但谁都没管它** —— 既没配声，也没说明为什么不配

不配声的键要写进注释并说明理由（出现「不配 / 无需 / 留白 / 故意」这类词），
否则守门会提醒「只在注释里出现但没说明为什么」。

第 2 道（确定性）除了 CSS 动画 / 非种子随机 / `delayRender` 配对，还查两条：
- **`<Audio>` 只能出现在 `FilmAudio` / `CueAudio` 里** —— 否则 `<片>-Audio` 出音轨时会漏掉它（画面有声、成片没声）
- **演示 / 模拟数据上屏要有标注**（§11 的数据规则）

第 4 道（配乐段）除了区间合法性，还查三条：
- **ref 现解析值 == 存的值** —— 编舞改了而 ref 没重解析时，段边界会悄悄对不上
- **段长 ≤ 300s** —— Adapt 接口硬上限，超了改编直接失败
- **sync 锚点不越过所属段的曲长**

## 衍生片的拍网格

`shared/beatgrid.ts` 提供 `makeBeatGrid({dropSec, bpm})` → `DROP / BEAT / BAR / beat(n) / bar(m)`。
镜头入点一律写成 `beat(n)` / `bar(m)`，**不写死秒数** —— 换配乐只改 bpm 与 drop，镜头自动挪位，
`vw check --variant` 会校验每个入点确实落在整拍上。

顺序很重要：**先有配乐，再排画面**。`vw music short` 先产出配乐、实测它的 drop，
写进 `src/films/<片>/short/music.json`，画面的网格读这个值。
反过来（先定一个秒数再逼配乐对上）就是在用假数字对拍。
作曲引擎产出的曲子，drop 取乐谱里 `!hit!` 的位置（这是已知事实）；
离线剪出来的曲子内容不是我们写的，才靠实测。

## 已知边界

- Epidemic 走官方 MCP（JSON-RPC over curl）。没有凭据时所有检索与改编都走本地合成，**产出不是 Epidemic 素材**。
- `EffectComposer` 在 Remotion 的「手动单帧」模型下要额外推一把：ThreeCanvas 只 `advance()` 一次就交帧，
  而 composer 一挂上就接管渲染、它的 pass 要到自己的 effect 里才建好 —— 那一帧会全黑。
  解法是在后期链之后挂一个 `ComposerKick`：挂 `delayRender`，等一个 rAF 再 `advance()` 并放行。
- 候选池与素材库按影片隔离在 `out/<片>/candidates.json`，不跨片共用同名槽。
