# 视频工作台 · 背景与方案（V2：LoomCare 内核 × huashu-motion 交互）

> 状态：方案定稿 V2（已融合 LoomCare 第二代架构与 huashu-motion 使用范式），待启动 S1
> 日期：2026-10-23
> 结论来源：grilling 拷问会 + `architecture.html`（LoomCare 架构拆解）+ `loomcare.mp4`（287s 成片样片）+ `huashu-motion` 交互协议

---

## 1. 一句话目标

从 0 建一套**本机运行的程序化影片工作室**：以 **LoomCare 第二代架构**为底层制作与渲染内核（秒 + 幕表、Blender 机身 + DOM 射影贴屏、Epidemic Adapt 钉高潮、七泳道混音、三段式 4K 超采样出片），以 **huashu-motion 的 CLI + Skill + 浏览器指点批注（inbox 协议）** 为统一交互外壳，产出 `loomcare.mp4` 量级的成片。

---

## 2. 核心理念：LoomCare 内核 × huashu-motion 外壳

原版 `create-video` 的能力极强，但散落在几十个 `npm run` 脚本、环境变量（`SFX_FILM`、`LOOMCARE_SSAA`）和双开发服务器（Remotion Studio + sfx-studio）里；而 `huashu-motion` 的优势在于**人机协作体验极佳**（单一 `om` CLI、Skill 驱动、浏览器里直接点画面下指令给 Agent）。

本方案将两者深度缝合：

| 维度 | 采纳来源 | 具体落地方式 |
|---|---|---|
| **时间与编舞模型** | **LoomCare（第二代）** | **全面采用「秒（浮点）+ 幕表（`buildPlan`）」**。彻底抛弃第一代（Dream V5/V6）的 30fps 整数帧表与 `Freeze` 双时钟画面变速；画面拥有绝对节拍，声音迁就画面。 |
| **真值数据单位** | **架构升级（去历史包袱）** | 九张真值 JSON **统一以「秒（保留 4 位小数）」存储**，不再沿用原系统 30fps 帧数，从根源消灭 30fps/60fps 折算与精度漂移。 |
| **音频挂载统一** | **架构升级（去割裂）** | 将原系统硬编码在 `LoomAudio.tsx` 里的 305 条 UI 音效（`MOUNTS`）纳入 JSON 真值体系（由各幕时间常量派生进 `sfxPlan.json` 的 `UI` 层），工作台与 Agent 可统一读写全部七条泳道。 |
| **配乐对拍路线** | **LoomCare 主路线** | **音乐迁就画面**（`zones` 全刚性）：通过 `bpmfit` 选曲网格拟合 + Epidemic Adapt 钉主高潮 + 乐句重排（`surgery`）钉第二高潮；砍掉高风险且 LoomCare 未使用的「画面弹性变速求解」，大幅降低工程复杂度。 |
| **CLI 与 Skill 入口** | **huashu-motion 形式** | 封装统一 CLI（如 `vw` / `om`），收敛所有画面、Blender、配音、工作台、质检与出片命令；内置导演方法论 Skill，Agent 通过标准 CLI 闭环执行。 |
| **工作台与交互** | **LoomCare + huashu-motion** | 融合 `sfx-studio` 七泳道实时 Web Audio 监听与 `huashu-motion` 的 **「指着改（inbox 协议）」**：支持在画面（坐标 + 时刻 + 幕 ID）和音频时间轴（泳道 + 片段 key + 秒）上直接点选打标，生成结构化任务进 `inbox.json`，Agent 接单改代码或调混音。 |

---

## 3. 终局架构与使用体验

### 3.1 架构全景

```
用户（浏览器指着画面/音轨提意见） ──► inbox.json ──► Agent（加载导演 Skill + 配音 Skill）
                                                          │
                                                          │ 调 CLI / 改代码与真值
                                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 仓库真值层（src/<film>/）                                                        │
│  ├─ 画面真值：timeline.ts（秒+幕表）+ scenes/*.tsx（导出 *_SECONDS / *_T / rig） │
│  ├─ 衍生编舞：audio/world.ts（从幕常量纯函数派生 SC 段落表 + K 拍点表 + Spots）   │
│  └─ 声音真值：九张 JSON（秒制、单源真值）+ 单片独立 manifest.json                │
└───────────────┬─────────────────────────────────────────┬───────────────────────┘
                │                                         ▲
                ▼                                         │ 毫秒级写回 + 文件锁 + WS 广播
┌───────────────────────────────┐         ┌───────────────┴───────────────────────┐
│ 渲染与预渲染管线               │         │ 统一工作台（127.0.0.1:5177）           │
│  ├─ Blender 后台 Cycles 逐帧  │         │  ├─ 静音母片预览 + 画面框选批注        │
│  │  （四角投影校验+签名+降级） │         │  ├─ 七泳道时间轴 + Web Audio 实时监听  │
│  ├─ Remotion 4 确定性渲染     │         │  ├─ 曲库/音效检索 + Adapt 改编面板     │
│  │  （4K SSAA + CPU 栅格化）  │         │  ├─ BS.1770 响度实测 + 快照版本管理    │
│  └─ 三段式出片（静音片+WAV+封装│         │  └─ Inbox 任务队列（人发单 → Agent 结单│
└───────────────────────────────┘         └───────────────────────────────────────┘
                ▲                                         ▲
                └───────────────────┬─────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │ 共享纯数学包（src/shared/math） │
                    │ 增益 / 淡化 / 让位 / 射影矩阵   │
                    │（渲染端、工作台、CLI 同源引用） │
                    └───────────────────────────────┘
```

### 3.2 `huashu-motion` 式的极简使用形式

所有操作收敛到统一 CLI（以 `vw` 为例，兼容 `om` 习惯），**强制显式指定 `<film>`（或在当前活跃上下文绑定）**，杜绝原系统漏传 `SFX_FILM` 误改其他片的问题：

```bash
# 1. 创建与脚手架（自带秒+幕表模板、2.5D Stage、相机曲线与九张空 JSON）
vw init <film> --template=loomcare

# 2. 统一工作台（合并画面审阅、七泳道混音、Inbox 批注队列）
vw studio <film>                  # 启动本地服务，支持点画面/点音轨提修改单

# 3. 3D 预渲染管线（单源轨迹 → 四角投影校验 → Cycles 增量渲染 → 签名清单）
vw blender track <film>           # 导出机位与屏幕四角坐标 + FNV-1a 签名
vw blender render <film>          # 单进程 Metal 队列，仅重渲签名变更帧区间

# 4. 声音与配乐全链（Agent 一键或分步调用）
vw spot sync <film>               # 从各幕 *_T 派生拍点，增量同步编舞，迁移已有调参
vw sfx procure <film> [slot...]   # 走 Epidemic MCP（或本地兜底）检索、声学画像打分、落盘
vw music match <film>             # 按拍点算 bpmfit → 选曲 → Adapt 钉主高潮 → surgery 钉副高潮

# 5. 守门与出片
vw check <film>                   # 确定性扫描 + 双端 TS 类型检查 + 拍点覆盖守门 + 画面 QA 抽帧
vw render <film> --mode=master    # 30fps 静音母片 + 自动导出工作台 state.json
vw render <film> --mode=final     # 1080p60 成片：4K 超采样静音片 + 独立 Audio WAV + ffmpeg 封装
```

### 3.3 「指着画面 / 音轨改」的 Inbox 闭环协议

在工作台（`vw studio`）里，用户无需手动去代码里找第几幕第几秒或哪个槽名：
1. **点画面批注**：暂停在任意时刻，框选画面区域并输入「把这个卡片弹出的弹性改轻一点，并且配一个清脆的气泡音」。工作台自动捕获 `{ film, timeSec, sceneId, sceneLocalSec, rect, domSelector, screenshot }` 写入 `out/<film>/inbox.json`。
2. **点音轨批注**：右键时间轴上的某个音效片段或配乐区间，输入「这里心跳声太吵，压低配乐 5dB，或者换一个更闷的鼓点」。工作台自动捕获 `{ film, layer, slot, itemKey, timeSec, currentGainDb }` 写入 `inbox.json`。
3. **Agent 接单执行**：Agent 监听或读取 `vw inbox list <film>`，结合导演方法论（运动曲线、颜色规矩、混音守则）直接修改对应的 `scenes/*.tsx` 或九张真值 JSON，调用 `vw inbox resolve <id>`，工作台通过 WebSocket 实时热更新画面/Web Audio 节点。

---

## 4. 关键技术设计（贴合 LoomCare 最佳实践 + 填平已知坑）

### 4.1 画面与渲染层（LoomCare 第二代标准）
1. **秒 + 幕表（`timeline.ts`）**：
   - 每幕导出 `*_SECONDS` 与幕内节拍常量 `*_T`（单位均为秒）；复杂运动抽离为纯函数 `rig.ts`（逐帧计算，不量 DOM，供 Canvas、DOM、Blender 轨迹、配音表四方共用）。
   - `buildPlan` 按 `start = prevEnd - overlap` 自动累加出全片 `PLAN`；改任意一幕时长，后续幕与配音拍点自动顺延。
   - 画面子组件不直接调 `useTime()`，时间 `t` 由幕组件统一作为 prop 传入，外层包 `WarpProvider` 即可零成本把正片幕复用到预告片/短片。
2. **四层视觉与 Blender 机身射影贴合**：
   - **DOM 2.5D + 射影矩阵（`homography.ts`）**：界面幕用 `Stage` + 对数 Z 轴相机插值；针对 Blender 预渲染的 3D 手机机身，通过 `quadMatrix3d` 将清晰锐利的 React DOM 屏幕实时射影贴合到 Blender 机身的四个投影角上，再把玻璃反光层逆映射（`screen` 混合模式）叠回屏幕。
   - **单源 + 签名 + 自动降级**：`phoneGeo` 在 Node 和浏览器共用；Blender 渲染前先校验四角投影与 three.js 偏差（`> 0.5px` 直接报错退出）；运行时校验 `track.sig`（FNV-1a），机位改了但未重渲 Blender 序列时，自动无缝退回 three.js 机身，杜绝屏幕与机身错位。
3. **确定性纪律与硬件渲染避坑**：
   - 严禁 CSS `animation` / `transition`、`Math.random()`（一律用 mulberry32 种子随机）；字体、贴图、模型加载一律走 `delayRender`。
   - **Stage 动态 `will-change`**：按镜头缩放倍率逐帧开关 `willChange`，避免大倍率推拉时主线程卡死；放大超 6 倍自动关闭阴影与滤镜。
   - **Three.js 后期色调映射**：`EffectComposer` 挂载后显式补 `<ToneMapping mode={ACESFilmic} />`，防止亮金色高光被截断洗白。
   - **CPU 栅格化包装**：出片默认启用 `--disable-gpu-rasterization` 包装脚本（WebGL 仍走 ANGLE GPU），解决透视 3D 层下 SVG 描边偶发半宽的 Chromium 宿疾。
4. **三段式出片与超采样（SSAA）**：
   - **第一段（静音画面）**：`--muted --scale=2 --gl=angle`，配合 `remotion.config.ts` 的 `overrideFfmpegCommand` 钩子用 `scale=iw/2:ih/2:flags=area` 面积滤波缩回 1080p，消除斜细线与透视边缘锯齿。
   - **第二段（独立纯音频合成 `<Film>-Audio`）**：只挂载音频组件，不挂载任何视觉与 WebGL 组件（几十秒出完 48kHz WAV，彻底避免并发编译着色器丢失 WebGL 上下文）。
   - **第三段（ffmpeg 封装 + 验收）**：`-c:v copy -c:a aac -b:a 256k`（必要时挂 `alimiter`），消除 Remotion 直出 AAC 的 42.7ms（2048 采样）预滚偏移；出片后自动跑 `ebur128` 响度检测与 WAV/AAC 互相关零时差校验。

### 4.2 声音、配乐与混音层
1. **九张真值 JSON（秒制 + 单片隔离）**：
   - 存放在 `src/<film>/audio/`：`sfxPlan.json`（含环境/动作与派生的 UI 音效）、`sfxOffsets.json`、`sfxGains.json`、`sfxFades.json`、`sfxDucks.json`、`mix.json`、`music.json`（v2 多段格式）、`sfxTyping.json`、`sync.json`（在 LoomCare 刚性模式下作为节拍网格可行性报告）。
   - 候选池与已选清单按片隔离在 `out/<film>/candidates.json` 与 `src/<film>/audio/manifest.json`，底层 WAV 缓存在全局内容寻址库（或 Git LFS），既跨片复用大文件，又避免换音效时串片污染。
2. **「所听即所得」零复制架构**：
   - 建立 `src/shared/audio-math/` 纯函数包（三级增益 `gainOf`、淡入淡出 `fadeAt`、等功率交叉淡化、让位包络 `duckAt`、时间映射 `warp`）。
   - Remotion 音频组件、CLI 导出脚本、Vite 工作台前端**直接引用同一份 TypeScript 源码**，彻底废除手动复制代码，并配齐单元测试。
   - 工作台服务端读取真值 JSON 一律走磁盘实时读取（禁 ESM 模块缓存），写入时加文件级原子锁。
3. **配乐三步法（贴合 LoomCare 实战）**：
   - **Step 1 · 网格选曲（`bpmfit` + `mscore`）**：以画面主高潮（Drop 拍点）为原点，在 60–180 BPM 评估节拍网格拟合代价，结合情绪、流派、Camelot 调性与去人声打分选曲。
   - **Step 2 · Adapt 闭环钉主高潮**：调 Epidemic MCP `EditRecording`（单硬钉点 `requiredRegionsAtOffsets` + 配方池 r8/r16/peak 等），在预览 MP3 上实测 drop 落点（扣除 23ms 预览偏移），最多 3 轮迭代修正直到误差 ≤ 0.6 拍。
   - **Step 3 · 乐句重排钉第二高潮（`surgery`）**：基于 12 维 chroma + 6 带能量 + RMS 计算逐拍接缝代价（`jumpCost`），在整小节边界（4/8/16 拍）一插一删 + 12ms 等功率交叉淡化，将第二高潮对齐画面转折点。

---

## 5. 搭建顺序（S1 → S7，每阶段产出可运行闭环）

调整了原方案中 S5 与 S6 的倒置依赖，先打通 Epidemic MCP 与 Adapt，再做配乐分析与重排；并将 `huashu-motion` 的 CLI / Inbox 骨架前置贯穿全流程：

```
S1  脚手架 + CLI 骨架 + 九张真值 Schema（秒制）+ 共享数学包 + 资产存储策略
S2  LoomCare 第二代画面体系（秒+幕表、Stage 2.5D、四层渲染）+ 三段式 SSAA 出片
S3  Blender 预渲染管线（单源轨迹 + 四角投影校验 + DOM 射影贴屏 + 签名降级）
S4  统一工作台（七泳道 Web Audio + BS.1770 响度 + Inbox 指着画面/音轨改协议）
S5  Epidemic MCP 采购链路（音效画像打分 + 配乐检索 + Adapt 闭环钉主高潮 + 本地作曲兜底）
S6  配乐深度智能（多频带拍周期/小节头分析 + bpmfit 网格选曲 + surgery 乐句重排钉副高潮）
S7  导演与配音 Skill 封装（运动/节奏/色彩方法论 + 全链自治 + 验收守门 `vw check`）
```

### 各阶段交付标准

- **S1 · 地基与契约**
  - 初始化仓库，配置大文件隔离策略（`public/` 下重型 WAV/WebP 走本地缓存目录软链或 Git LFS，保证 `.git` 轻量）。
  - 落地 `vw` CLI 骨架、片注册表（强制显式 `film` 参数）、九张真值 JSON Schema（全秒制，含 UI 挂载）及 `src/shared/audio-math` 纯模块与单测。
- **S2 · 视觉内核与三段式出片**
  - 实现 `timeline.ts`（`buildPlan`）、`Stage`（对数相机 + 动态 `will-change`）、`WarpProvider`、种子随机与 `delayRender` 封装。
  - 跑通「4K 超采样静音片（CPU 栅格化 Chrome）→ `<Film>-Audio` 独立 WAV → ffmpeg 封装 + 零时差校验」三段式管线。
  - **里程碑**：用首支牵引片（仿 LoomCare 宣传片）跑出 30–60s 画面完整、带基础占位音效的 1080p60 成片。
- **S3 · Blender 照片级机身管线**
  - 实现 `phoneGeo`（Node/浏览器同源）、`track.json` 导出（含屏幕四角像素与 FNV-1a 签名）、`phone.py` 后台渲染（四角偏差 ≤ 0.5px 守门 + 增量帧渲染）、`homography.ts` DOM 射影贴合与反光逆映射。
  - **里程碑**：牵引片接入 3D 手机幕，验证改机位自动降级 three.js、补渲后自动切回 Cycles 无损 WebP。
- **S4 · 混音与批注工作台（Inbox 闭环）**
  - 搭建 Vite + React 工作台：静音母片同步播放、七泳道（MUSIC/BG/TEX/RISER/WHOOSH/IMPACT/UI）Web Audio 节点链、BS.1770 响度实测、乐观更新 + 快照。
  - 落地 **Inbox 批注协议**：支持在视频画面上框选打点、在音轨片段上批注，生成 `inbox.json` 并由 Agent 接单写回真值、WebSocket 实时刷新。
- **S5 · Epidemic MCP 采购与 Adapt 钉高潮**
  - 实现 MCP 常驻会话服务（4 分钟保活、`EPIDEMIC_MCP_SESSION` 跨进程复用）与本地 ABC 作曲兜底适配器。
  - 实现音效检索 + 预览 MP3 声学画像（起音/尾长/亮度/峰均差）自动打分 + `swap` 换素材保位置。
  - 实现配乐检索与 **Adapt 闭环改编**（把原曲 drop 钉到画面主高潮，自动补偿 23ms 预览偏移）。
- **S6 · 配乐分析与乐句重排（Surgery）**
  - 实现 `analyze`（三频带能量差分 + 归一化自相关拍周期 + 小节头相位消歧 + 段落 novelty 边界）。
  - 实现 `bpmfit` 网格代价评估与 `surgery` 整小节刀口一插一删（12ms 等功率交叉淡化），解决多高潮精准卡点。
- **S7 · Skill 封装与全链守门**
  - 迁入 `huashu-motion` 导演方法论（20 种运动语言、节奏单、OKLab 色彩规矩）与 `vw check` 守门（禁 CSS 动画扫描、全量 `tsc`、拍点覆盖率、画面裁切/对比度抽帧 QA）。
  - 封装成完整 Agent Skill：支持从「分镜脚本 → 写幕代码 → Blender 渲染 → 自动配音配乐 → 人工指点精修 → 60fps 终混出片」全流程驱动。

---

## 6. 风险与应对矩阵

| 风险项 | 等级 | 应对策略 |
|---|---|---|
| **成片视觉质感依赖导演手艺** | **高** | S2 起用牵引片实操验证；将 LoomCare 的镜头曲线、OKLab 色彩 Token、排版护栏与 `huashu-motion` 20 种运动语言固化为组件库与 Skill 规则。 |
| **人机同时改混音导致覆盖冲突** | **中** | 工作台服务端弃用 ESM 缓存，一律磁盘现读 + 原子写锁；Agent 执行批量任务前自动触发工作台版本快照，完成后通过 WebSocket 推送增量状态。 |
| **Epidemic Adapt / Surgery 边界情况** | **中** | 严格遵循实测护栏（单硬钉点、完成后等 1.5s 二次确认 editId、刀口强制落整小节）；Adapt 软失败时自动降级到次优配方或使用 `surgery` 本地裁剪。 |
| **Apple Silicon 渲染性能与显存** | **中** | 出音轨强制走无 WebGL 的 `<Film>-Audio` 合成；Blender 强制单进程队列 + 帧级 diff 增量渲染；Chrome 启用 CPU 栅格化包装防 SVG 描边异常。 |
| **大体积音视频资产撑爆 Git** | **低** | S1 即建立外部资产缓存目录（或 Git LFS），`public/` 下仅保留软链或轻量索引，代码仓库始终保持轻量。 |

---

## 7. 下一步行动（S1 启动清单）

1. 确定新仓库目录路径与 CLI 命令名（如 `vw` 或沿用 `om`）。
2. 定稿 **九张真值 JSON 的 TypeScript 类型定义（秒制）** 与 **`FilmAdapter` 片注册表接口**。
3. 编写 `src/shared/audio-math`（增益、淡化、让位、射影矩阵）纯模块及对照测试。
