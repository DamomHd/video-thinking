# 程序化影片工作室 · 详细设计文档（Detailed Design Specification）

> **版本**：v1.0（LoomCare 第二代内核 × huashu-motion 交互外壳）
> **状态**：详细设计定稿（可直接作为 S1–S7 编码实现蓝本）
> **日期**：2026-10-23
> **适用平台**：macOS（Apple Silicon 优先）

---

## 目录

1. [系统全景与仓库目录拓扑](#1-系统全景与仓库目录拓扑)
2. [核心数据契约与九张真值 Schema（S1 地基）](#2-核心数据契约与九张真值-schemas1-地基)
3. [共享纯数学与几何核心库（`src/shared/`）](#3-共享纯数学与几何核心库srcshared)
4. [LoomCare 第二代视觉架构与 Blender 管线（S2 & S3）](#4-loomcare-第二代视觉架构与-blender-管线s2--s3)
5. [三段式超采样出片与硬件渲染避坑（S2）](#5-三段式超采样出片与硬件渲染避坑s2)
6. [配音与配乐智能平台（S5 & S6）](#6-配音与配乐智能平台s5--s6)
7. [统一工作台与 Inbox「指着改」协议（S4）](#7-统一工作台与-inbox指着改协议s4)
8. [CLI 命令体系、守门质检与 Agent Skill 封装（S7）](#8-cli-命令体系守门质检与-agent-skill-封装s7)

---

## 1. 系统全景与仓库目录拓扑

### 1.1 架构分层与数据流向

本系统采用 **「代码即画面、JSON 即混音真值、CLI 驱动管线、浏览器工作台实现所听即所得与人机协同」** 的四层架构：

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 交互与智能层（Human & Agent Interface）                                             │
│  ├─ Web Studio (127.0.0.1:5177)：画面预览 + 框选批注 + 七泳道调音 + Web Audio 监听   │
│  ├─ Inbox 协议 (out/<film>/inbox.json)：画面/音轨批注单 ──► Agent 自动接单改代码/JSON │
│  └─ Agent Skill (skills/video-workbench/)：导演方法论 + 配音编排 + CLI 自动化调用    │
└──────────────────┬────────────────────────────────────────────────┬────────────────┘
                   │ 统一 CLI (vw / om)                             │ REST / WebSocket
                   ▼                                                ▼ (原子写锁+磁盘现读)
┌────────────────────────────────────────────────────────────────────────────────────┐
│ 仓库真值层（Single Source of Truth · Git 纳管）                                     │
│  ├─ 影片注册表：src/films.ts（显式声明各片入口、分辨率、母片配置、适配器）            │
│  ├─ 画面与时间单源：src/films/<film>/timeline.ts (秒+幕表) + scenes/*.tsx (*_T/rig) │
│  ├─ 派生编舞层：src/films/<film>/audio/world.ts（纯函数派生 SC 段落、K 拍点、Spots） │
│  └─ 声音九张真值：src/films/<film>/audio/*.json（全秒制）+ manifest.json（按片隔离） │
└──────────────────┬────────────────────────────────────────────────┬────────────────┘
                   │                                                │
                   ▼                                                ▼
┌─────────────────────────────────────────┐      ┌───────────────────────────────────┐
│ 共享纯数学核心（src/shared/ · 双端同源） │      │ 外部计算与采购服务                 │
│  ├─ audio-math：gain / fade / duck / eq │      │  ├─ Epidemic Sound 官方 MCP 服务  │
│  ├─ camera-math：对数相机 / 种子随机     │      │  ├─ 本地 ABC 作曲 + 采样兜底引擎   │
│  └─ homography：quadMatrix3d 射影矩阵   │      │  └─ Blender 4.x (-b Cycles/Metal) │
└─────────────────────────────────────────┘      └───────────────────────────────────┘
```

### 1.2 仓库目录拓扑与资产隔离策略

为彻底解决原系统 `public/` 膨胀至 2.0 GB、`.git` 膨胀至 3.2 GB 的问题（原架构文档 §21 S1），新仓库在 S1 初始化时即实行 **「代码/真值进 Git，重型二进制资产走本地缓存池 + 符号链接（Symlink）」** 策略：

```text
video-workbench/
├─ package.json                     # 锁死 Remotion 4.0.534、React 19、Three 0.184、tsx
├─ tsconfig.json                    # 覆盖 src/、scripts/、tools/ 全量类型检查（修复 §21 S3）
├─ remotion.config.ts               # SSAA 4K→1080p 面积滤波钩子 + Chromium CPU 栅格化配置
├─ bin/
│  └─ vw.mts                        # 统一 CLI 入口（支持别名 om），收敛全部子命令
├─ src/
│  ├─ index.ts                      # Remotion registerRoot 入口
│  ├─ Root.tsx                      # 动态遍历 src/films.ts 自动注册 <Film>、<Film>-60、<Film>-Audio
│  ├─ films.ts                      # 全局影片注册表（唯一入口，禁隐式默认片）
│  ├─ shared/                       # 【核心】渲染端、CLI、工作台前端三方直接 import 的零依赖纯模块
│  │  ├─ audio-math.ts              # 增益、淡化、等功率交叉淡化、让位包络、dB 换算
│  │  ├─ time-warp.ts               # 刚性/分段线性/Hermite 时间映射与反解函数 outerOf()
│  │  ├─ homography.ts              # 2D 四角像素 ↔ CSS matrix3d 射影变换与逆映射
│  │  ├─ camera.ts                  # 对数 Z 轴相机插值、屏幕投影、动态 will-change 判定
│  │  ├─ anim.ts                    # 缓动曲线、mulberry32 种子随机、进度计算纯函数
│  │  └─ types.ts                   # 九张 JSON、Spot、Palette、Inbox、State 全局类型契约
│  ├─ components/                   # 跨片公共视觉基建
│  │  ├─ Stage.tsx                  # 2.5D 画布容器（集成对数相机与动态 will-change 护栏）
│  │  ├─ Phone3D.tsx                # Blender 帧序列 / Three.js 自动降级机身 + DOM 屏幕射影贴合
│  │  ├─ FilmAudio.tsx              # 通用声音挂载组件（消费九张 JSON，支持 MusicBed/Plan/Typing）
│  │  └─ WarpProvider.tsx           # 供预告片/短片复用正片幕的时间重映射 Context
│  └─ films/                        # 各部影片独立目录（以首支牵引片 loomcare-demo 为例）
│     └─ <film>/
│        ├─ index.tsx               # 影片主组件（装配 Sequence + Enter 交叠转场 + ActBridge）
│        ├─ timeline.ts             # 【单源】buildPlan 幕表定义（秒制）
│        ├─ theme.ts                # OKLab 色彩 Token、字体加载（delayRender）
│        ├─ scenes/                 # 各幕组件（导出 *_SECONDS, *_T, 以及纯函数 rig.ts）
│        ├─ three/                  # 本片专属 3D 几何（phoneGeo.ts）与 phoneBody.json 签名清单
│        └─ audio/                  # 【单源真值】本片专属声音目录
│           ├─ adapter.ts           # 派生 SC / K / Spots / Palette 的片适配器
│           ├─ manifest.json        # 本片已绑定的音效槽文件清单（按片隔离，修复 §21 P2）
│           ├─ sfxPlan.json         # 真值 1：挂载计划（含环境/动作与 UI 挂载）
│           ├─ sfxOffsets.json      # 真值 2：时间微调偏移（秒）
│           ├─ sfxGains.json        # 真值 3：片段独立增益（dB）
│           ├─ sfxFades.json        # 真值 4：片段独立淡入淡出（秒）
│           ├─ sfxDucks.json        # 真值 5：让位包络参数
│           ├─ mix.json             # 真值 6：七层推子、Mute 列表、Master 总线增益
│           ├─ music.json           # 真值 7：v2 多段配乐表（入出点 ref、高潮锚点、曲目元数据）
│           ├─ sfxTyping.json       # 真值 8：真实键盘打字切片配置
│           └─ sync.json            # 真值 9：对拍锚点与网格可行性报告
├─ scripts/                         # CLI 底层实现模块
│  ├─ blender/                      # 轨迹导出、Blender 后台驱动、四角校验、增量渲染
│  ├─ spot/                         # 拍点派生、覆盖守门、计划生成、swap 换素材、sync-choreo
│  ├─ epidemic/                     # MCP 常驻会话守护、音效声学画像打分、Adapt 闭环、本地作曲兜底
│  ├─ sync/                         # 多频带音频分析 (analyze)、网格选曲 (bpmfit)、乐句重排 (surgery)
│  ├─ render/                       # 三段式出片、CPU 栅格化 Chrome 包装、ebur128 与互相关验收
│  └─ guard/                        # 确定性静态扫描、全量 tsc、拍点覆盖率、画面抽帧 QA
├─ blender/                         # Blender Python 脚本（phone.py 等）与基础 .blend 模板
├─ tools/
│  └─ studio/                       # 统一工作台（Vite 7 + React 19 + Tailwind 4 + Web Audio + Inbox）
├─ public/                          # Remotion 静态资源目录（仅存轻量字体/图标，大目录均为软链）
│  ├─ sfx-lib -> ~/.vw-assets/sfx   # 软链至本机内容寻址音效池
│  ├─ music -> ~/.vw-assets/music   # 软链至本机配乐池
│  └─ blender -> ../out/blender-pub # 软链至本机 Blender WebP 帧序列产物
├─ out/                             # 运行时产物与缓存（全部 gitignore）
│  └─ <film>/
│     ├─ master-mute.mp4            # 供工作台播放的 30fps 静音母片
│     ├─ final-60.mp4               # 交付级 1080p60 成片
│     ├─ state.json                 # 工作台投影数据（由 export 生成，支持毫秒级就地更新）
│     ├─ inbox.json                 # 【huashu-motion 核心】指着画面/音轨改的任务队列
│     └─ versions/                  # 混音版本快照目录
└─ skills/                          # Agent Skill 封装目录
   └─ video-workbench/
      ├─ SKILL.md                   # 主指令：全链工作流与 CLI 路由
      └─ references/                # 20 种运动语言、节奏单规则、OKLab 色彩规矩、混音手册
```

---

## 2. 核心数据契约与九张真值 Schema（S1 地基）

### 2.1 时间单位铁律：全链路「秒制（Seconds）」

- **废除 30fps 整数帧存储**：所有幕长、节拍常量、九张真值 JSON、`state.json`、`inbox.json` 一律使用**浮点数秒（`number`，序列化时统一调用 `roundSec(t) = Math.round(t * 10000) / 10000`，保留 4 位小数，精度 0.1ms）**。
- **帧率解耦**：`fps`（30 或 60）仅在 Remotion `<Composition>` 注册与最终渲染帧号换算 `toFrame(sec, fps) = Math.round(sec * fps)` 时介入。同一套代码和同一套九张 JSON 真值，无需任何转换即可同时渲染 30fps 预览母片和 60fps 交付成片。

### 2.2 幕表（`timeline.ts`）与节拍派生契约

```typescript
// src/shared/types.ts

export type EnterTransition = 'fade' | 'blur-scale' | 'push-up' | 'ink' | 'none';

export interface ScenePlanInput {
  id: string;              // 幕唯一标识，如 'prologue' | 'title' | 'care'
  label: string;           // 中文名，如 '序幕（3D 纸）'
  dur: number;             // 幕时长（秒），必须 import 自该幕导出的 *_SECONDS
  overlap: number;         // 与上一幕的交叠时长（秒），首幕为 0
  enter: EnterTransition;  // 交叠期入场方式（全部内置实现，修复 §21 S7）
}

export interface ScenePlanResolved extends ScenePlanInput {
  index: number;
  start: number;           // 全片绝对起点（秒）：prev.end - overlap
  end: number;             // 全片绝对终点（秒）：start + dur
}

export interface FilmTimelinePlan {
  scenes: ScenePlanResolved[];
  byId: Record<string, ScenePlanResolved>;
  totalSeconds: number;    // 全片总时长（秒）
  sceneStart: (id: string, localSec?: number) => number; // 幕内秒 → 全片绝对秒
}
```

**`buildPlan` 纯函数实现逻辑**：
```typescript
export function buildPlan(inputs: ScenePlanInput[]): FilmTimelinePlan {
  const scenes: ScenePlanResolved[] = [];
  const byId: Record<string, ScenePlanResolved> = {};
  let cursor = 0;
  inputs.forEach((item, index) => {
    const start = index === 0 ? 0 : roundSec(cursor - item.overlap);
    const end = roundSec(start + item.dur);
    cursor = end;
    const resolved: ScenePlanResolved = { ...item, index, start, end };
    scenes.push(resolved);
    byId[item.id] = resolved;
  });
  return {
    scenes,
    byId,
    totalSeconds: cursor,
    sceneStart: (id: string, localSec = 0) => {
      const s = byId[id];
      if (!s) throw new Error(`[timeline] Unknown scene id: ${id}`);
      return roundSec(s.start + localSec);
    },
  };
}
```

### 2.3 影片接入适配器接口（`FilmAdapter`）

每部影片在 `src/films/<film>/audio/adapter.ts` 实现该接口，供 CLI 与工作台调用：

```typescript
export type AudioLayer = 'MUSIC' | 'BG' | 'TEX' | 'RISER' | 'WHOOSH' | 'IMPACT' | 'UI';

export interface PaletteSpec {
  slot: string;                    // 槽主键，如 'cardPop' | 'whooshSoft'
  layer: Exclude<AudioLayer, 'MUSIC'>;
  cat: string;                     // 大类描述
  tags: string;                    // Epidemic 主检索串（大类, 子类, 物体, 材质, 动作）
  alt?: string;                    // 备选检索串
  dur: [number, number];           // 目标时长区间（秒），如 [0.6, 1.2]
  variants: number;                // 变体数量（UI 层固定为 1）
  mood?: string;
  align: 'peak' | 'onset';         // peak: 素材峰值对齐事件终点; onset: 起点对齐事件起点
  gain: number;                    // 在层基准音量上的线性倍率（默认 1.0）
  ucs?: string[];                  // 允许的 UCS 子类，如 ['designed--riser']
}

export interface SpotAnnotation {
  id: string;                      // 事件语义名，如 '五重万向环越转越快'（不含动态数字）
  fromSec: number;                 // 事件起点（全片秒）
  toSec: number;                   // 事件终点（全片秒）
  layer: Exclude<AudioLayer, 'MUSIC'>;
  slot: string;                    // 关联的 Palette 槽名
  what: string;                    // 画面动作描述
  force?: boolean;                 // 是否无视同层 ±0.4s 覆盖规则强制排入
  take?: [number, number];         // 截取多连击素材中的某一段 [起秒, 止秒]
  pitchSemis?: number;             // 音高偏移半音数（主要用于 UI 连续点击挂载）
}

export interface VisualHit {
  id: string;                      // 如 'K.ink' | 'K.dropMain'
  sec: number;                     // 全片绝对秒
  priority: 'P0' | 'P1' | 'P2';    // 容差：P0=1/30s(33ms), P1=2/30s(67ms), P2=4/30s(133ms)
  want: 'drop' | 'downbeat' | 'beat' | 'end' | 'finish';
  note: string;
}

export interface FilmAdapter {
  filmId: string;
  title: string;
  fps: 30 | 60;
  width: number;
  height: number;
  timeline: FilmTimelinePlan;
  SC: Record<string, number>;      // 段落起点字典（秒），含 SC.end = totalSeconds
  K: Record<string, number>;       // 关键拍点字典（秒）
  ignoredKeys: string[];           // 明确不配声的 K 键白名单（需附理由，供 check 守门）
  palette: Record<string, PaletteSpec>;
  spots: () => SpotAnnotation[];   // 包含环境/动作 Spot 及从各幕派生的 UI 挂载 Spot
  typings: () => { id: string; fromSec: number; durSec: number; label: string }[];
  hits: () => VisualHit[];
}
```

### 2.4 九张真值 JSON 完整 Schema（`src/films/<film>/audio/*.json`）

所有 JSON 真值均存放在对应影片目录下，**Key 命名空间全局统一**：
- 普通与 UI 音效 Key：`<slot>·<spot.id>`（同槽同名事件第二次出现起自动追加 `#2`、`#3`；插入新事件不破坏已有 Key 的调参绑定）。
- 打字音效 Key：`typing:<id>`。
- 配乐段 Key：`music:<cueId>`（如 `music:c1`）。

#### (1) `sfxPlan.json` —— 音效挂载计划表
由 `vw spot plan <film>` 生成。**改进点**：将原系统硬编码在组件里的 `MOUNTS`（UI 层）一并纳入 `sfxPlan.json`，支持 `pitchSemis`（半音变调），实现 7 条泳道真值完全统一：
```typescript
export interface SfxPlanItem {
  key: string;                     // 主键，如 "lcFnSpin·五重万向环越转越快" 或 "uiClick·发送按钮#2"
  what: string;
  layer: Exclude<AudioLayer, 'MUSIC'>;
  slot: string;
  file: string;                    // 相对 public/ 的路径，如 "sfx-lib/epidemic/lcFnSpin-1.wav"
  title: string;                   // 素材原始标题
  fromSec: number;                 // 计算出的挂载起点（秒）
  durSec: number;                  // 播放时长（秒）
  startFromSec: number;            // 素材内部裁剪起点（秒，跳过声头静音或折算 take）
  volume: number;                  // 峰值归一到 -6 dBFS 后的基础线性音量
  fadeSec: number;                 // 默认首尾淡化时长（秒）
  loop?: boolean;                  // BG / TEX 层循环标志
  pitchSemis?: number;             // 播放速率变调：playbackRate = 2^(pitchSemis / 12)
}
export type SfxPlanFile = SfxPlanItem[];
```

#### (2) `sfxOffsets.json` —— 时间偏移微调表
```typescript
// key -> 偏移秒数（正数推迟，负数提前；为 0 的键自动删除）
export type SfxOffsetsFile = Record<string, number>;
```

#### (3) `sfxGains.json` —— 片段独立增益表
```typescript
// key -> 增益 dB（如 -3.5, +2.0；为 0 的键自动删除）
export type SfxGainsFile = Record<string, number>;
```

#### (4) `sfxFades.json` —— 片段独立淡入淡出覆盖表
```typescript
export interface SfxFadesFile {
  in: Record<string, number>;      // key -> 淡入秒数（覆盖 sfxPlan.fadeSec）
  out: Record<string, number>;     // key -> 淡出秒数
}
```

#### (5) `sfxDucks.json` —— 闪避/让位包络表
```typescript
export interface DuckSpec {
  db: number;                      // 压低深度（负数 dB，如 -5）
  preSec: number;                  // 命中前提前压低时间（秒，如 0.2）
  holdSec: number;                 // 保持最深压低时间（秒，如 1.1）
  releaseSec: number;              // 线性恢复时间（秒，如 0.8）
  layers: AudioLayer[];            // 被压低的目标泳道，通常为 ["MUSIC"] 或 ["MUSIC", "BG"]
}
export type SfxDucksFile = Record<string, DuckSpec>;
```

#### (6) `mix.json` —— 调音台推子与总线表
```typescript
export interface MixFile {
  layers: Record<AudioLayer, number>; // 七条泳道各自的推子 dB（默认全 0）
  muted: AudioLayer[];                // 被静音的泳道列表（会进入最终成片；solo 仅存工作台内存）
  master: number;                     // 总线增益 dB（默认 0）
}
```

#### (7) `music.json` —— 多段配乐编排表（v2）
```typescript
export interface TimeRef {
  ref: string;                     // 符号引用表达式，如 "SC.prologue" 或 "K.ink - 0.5"
  sec: number;                     // 当前解析出的秒数（sync-choreo 时重新求值）
}

export interface MusicCue {
  id: string;                      // 如 "c1", "c2"
  label: string;                   // 如 "序幕 · 片名"
  in: TimeRef;                     // 段入点
  out: TimeRef;                    // 段出点
  climax?: TimeRef;                // 主高潮锚点（供 Adapt 钉 drop）
  climax2?: TimeRef;               // 第二高潮锚点（供 surgery 乐句重排）
  brief: string;                   // 选曲简报（情绪、流派、配器关键词）
  track?: {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    key?: string;                  // Camelot 调性码，如 "8A"
    file: string;                  // 如 "music/8f3a12b0-loomcare-c1-adapt.wav"
    durationSec: number;
    adapted: boolean;
    editId?: string;
    surgeryApplied?: boolean;
  };
  startFromSec: number;            // 从曲目内部第几秒开始播
  volume: number;                  // 段基础线性音量（默认 0.55）
  fadeInSec: number;
  fadeOutSec: number;
  join?: {
    kind: 'cut' | 'crossfade' | 'gap' | 'bridge'; // 衔接方式：bridge 会在入点前 2.5s 自动生成 riser+impact
    overlapSec?: number;           // crossfade 时的等功率交叠时长
  };
}

export interface MusicFile {
  version: 2;
  cues: MusicCue[];
}
```

#### (8) `sfxTyping.json` —— 键盘打字音效配置
```typescript
export interface SfxTypingFile {
  file: string;                    // 默认 "sfx-lib/typing-real.wav"
  title: string;
  offsets: Record<string, number>; // typingId -> 从录音文件的第几秒切入（防多段打字听感重复）
}
```

#### (9) `sync.json` —— 节拍网格与对拍诊断报告
在 LoomCare 第二代刚性时间模型下，`knots` 恒为对角线 `[[0, 0], [totalSeconds, totalSeconds]]`，该文件主要记录各 `VisualHit` 与当前配乐实测拍点（`analysis.json`）的对齐误差，供工作台顶栏显示「对拍得分」与拍点偏离预警：
```typescript
export interface SyncAnchor {
  hit: string;                     // 如 "K.ink"
  cueId: string;
  targetSec: number;               // 画面拍点秒数
  musicSec: number;                // 匹配到的配乐拍点秒数
  musicKind: 'drop' | 'downbeat' | 'beat' | 'end' | 'finish';
  errMs: number;                   // 误差毫秒数（musicSec - targetSec）* 1000
  priority: 'P0' | 'P1' | 'P2';
  status: 'locked' | 'downgraded' | 'dropped';
  note?: string;
}

export interface SyncFile {
  knots: [number, number][];       // [[scoreSec, filmSec]]，LoomCare 模式恒为恒等映射
  anchors: SyncAnchor[];
  report: {
    scoreSync: number;
    lockedCount: number;
    downgradedCount: number;
    droppedCount: number;
  };
}
```

---

## 3. 共享纯数学与几何核心库（`src/shared/`）

为践行「**所听即所得**」与「**单源几何**」，以下核心公式写在 `src/shared/` 下，没有任何 Node 或 DOM 专属 API 依赖，由 **Remotion 渲染组件、CLI 脚本、Vite 工作台前端三方直接 import**。

### 3.1 混音音量与包络数学（`src/shared/audio-math.ts`）

```typescript
// 1. dB 转线性倍率
export const dbToLinear = (db: number): number => Math.pow(10, db / 20);
export const linearToDb = (lin: number): number => 20 * Math.log10(Math.max(lin, 1e-6));
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// 2. 计划生成时的素材峰值归一化音量（目标峰值 -6 dBFS）
export const LAYER_BASE_VOL: Record<Exclude<AudioLayer, 'MUSIC'>, number> = {
  BG: 0.32,
  TEX: 0.20,
  RISER: 0.50,
  WHOOSH: 0.50,
  IMPACT: 0.60,
  UI: 0.50,
};

export function calcPlanVolume(
  layer: Exclude<AudioLayer, 'MUSIC'>,
  peakDb: number,
  paletteGain = 1.0
): number {
  const norm = Math.max(0.15, Math.min(1.6, dbToLinear(-6 - peakDb)));
  return LAYER_BASE_VOL[layer] * norm * paletteGain;
}

// 3. 三级增益计算（片段增益 × 层推子 × Master 总线）
export function gainOf(
  key: string,
  layer: AudioLayer,
  gains: Record<string, number>,
  mix: MixFile
): number {
  if (mix.muted.includes(layer)) return 0;
  const itemDb = gains[key] ?? 0;
  const layerDb = mix.layers[layer] ?? 0;
  const masterDb = mix.master ?? 0;
  return dbToLinear(itemDb + layerDb + masterDb);
}

// 4. 片段线性淡入淡出包络（localSec 为片段内已播放秒数）
export function fadeAt(
  localSec: number,
  durSec: number,
  fadeInSec: number,
  fadeOutSec: number
): number {
  const inFactor = fadeInSec > 0 ? localSec / fadeInSec : 1;
  const outFactor = fadeOutSec > 0 ? (durSec - localSec) / fadeOutSec : 1;
  return clamp01(Math.min(inFactor, outFactor));
}

// 5. 配乐段等功率交叉淡化（保证重叠期 cos² + sin² = 1，能量不塌陷不凸起）
export function equalPowerCrossfade(progress01: number): { outGain: number; inGain: number } {
  const p = clamp01(progress01);
  const angle = p * (Math.PI / 2);
  return {
    outGain: Math.cos(angle),
    inGain: Math.sin(angle),
  };
}

// 6. 让位（Ducking）包络计算：同层被多个音效触发让位时，取压得最深（最小值）的一项
export interface ActiveDuckTrigger {
  triggerStartSec: number; // 触发源音效的实际起点（已加 offset）
  spec: DuckSpec;
}

export function duckAt(filmSec: number, targetLayer: AudioLayer, triggers: ActiveDuckTrigger[]): number {
  let minGain = 1.0;
  for (const { triggerStartSec, spec } of triggers) {
    if (!spec.layers.includes(targetLayer)) continue;
    const t0 = triggerStartSec - spec.preSec;
    const t1 = triggerStartSec;
    const t2 = triggerStartSec + spec.holdSec;
    const t3 = t2 + spec.releaseSec;

    if (filmSec <= t0 || filmSec >= t3) continue;
    const targetFloor = dbToLinear(spec.db);
    let g = 1.0;
    if (filmSec < t1) {
      // 线性下潜
      const p = (filmSec - t0) / Math.max(spec.preSec, 1e-4);
      g = 1.0 + (targetFloor - 1.0) * p;
    } else if (filmSec <= t2) {
      // 保持底部
      g = targetFloor;
    } else {
      // 线性释放恢复
      const p = (filmSec - t2) / Math.max(spec.releaseSec, 1e-4);
      g = targetFloor + (1.0 - targetFloor) * p;
    }
    if (g < minGain) minGain = g;
  }
  return minGain;
}
```

### 3.2 四角射影矩阵（`src/shared/homography.ts`）

用于将大小为 `W × H` 的 React DOM 手机屏幕精准贴合到 Blender 预渲染机身的四个投影角 `[[x0,y0], [x1,y1], [x2,y2], [x3,y3]]`（顺序：左上、右上、右下、左下）：

1. **求解 2D 单应性矩阵 $H_{3\times 3}$**：
   构建 8 元线性方程组（DLT 算法），将源矩形四角 $(0,0), (W,0), (W,H), (0,H)$ 映射到目标四点 $(x_i, y_i)$，用高斯消元解出 $h_{11} \dots h_{32}$（令 $h_{33} = 1$）。
2. **提升为 CSS `matrix3d`（列主序 16 元素）**：
   将 Z 轴置为单位传递，构造 $4 \times 4$ 矩阵：
   $$\text{matrix3d}(h_{11}, h_{21}, 0, h_{31}, \quad h_{12}, h_{22}, 0, h_{32}, \quad 0, 0, 1, 0, \quad h_{13}, h_{23}, 0, 1)$$
3. **逆映射 `inverseQuadMatrix3d`**：
   对 $H_{3\times 3}$ 求伴随矩阵逆矩阵 $H^{-1}$，用于将全屏 1920×1080 的 Blender 玻璃高光反光层裁切并逆变换回手机屏幕局部坐标系内，以 `mix-blend-mode: screen` 叠加在 DOM 屏幕之上。

---

## 4. LoomCare 第二代视觉架构与 Blender 管线（S2 & S3）

### 4.1 视觉渲染四层模型与确定性护栏

| 渲染层 | 适用场景 | 核心组件与技术规范 |
|---|---|---|
| **1. DOM 2.5D 层** | 产品界面幕（对话、收件箱、调度台、卡片流） | `<Stage>` 容器 + `camera.ts`。相机状态为 `{ x, y, z, rx, ry, rz }`，其中缩放/景深距离 **`z` 按对数插值**（`exp(lerp(ln(z0), ln(z1), t))`），确保大倍率推拉时视觉速度均匀；文字全程保持矢量锐利。 |
| **2. Canvas 2D 层** | 确定性几何手稿、粒子环、数据流线 | 幕组件将当前秒 `t` 作为 prop 传入，Canvas 内部逐帧清空重绘；开启超采样（`ssaa=2`）时调用 `ctx.setTransform(ssaa, 0, 0, ssaa, 0, 0)`；辉光效果采用 1/4 分辨率离屏 Canvas 高斯模糊后以 `lighter` 叠回。 |
| **3. Three.js / R3F 层** | 3D 纸张序幕、光线交织过场、备用 3D 手机 | 经 `@remotion/three` 的 `<ThreeCanvas>` 接入；**严禁使用 R3F 时钟**，相机由 `<CameraRig>` 在 `useLayoutEffect` 中按 `t` 同步摆位；`EffectComposer`（`multisampling={4}`）末尾强制挂载 `<ToneMapping mode={ToneMappingMode.ACES_FILMIC} />`（修复 §21 S10 高光洗白问题）。 |
| **4. Blender 预渲染层** | 苹果官网级照片质感手机机身与玻璃反光 | 见 4.2 节「单源 + 签名 + 自动降级」管线。 |

**五条硬性确定性护栏（由 `vw check` 自动扫描强制执行）**：
1. **禁 CSS 动画**：源码中严禁出现 CSS `transition`、`animation`、`@keyframes`（逐帧并发截图时 CSS 动画不会按帧推进）。
2. **禁非种子随机**：严禁 `Math.random()`、`Date.now()`、`performance.now()`，一律调用 `src/shared/anim.ts` 的 `mulberry32(seed)`。
3. **资源加载必挂 `delayRender`**：字体（`FontFace`）、纹理贴图、GLB 模型、Blender 帧图加载未完成前必须阻塞当前帧截图。
4. **动态 `will-change` 与显存保护**：`<Stage>` 组件根据当前帧相机倍率 `scale` 动态控制 `will-change: transform`（当镜头从百倍微距拉回常规视距时自动卸载 `will-change`，防止 Chromium 把纹理栅格化倍率锁死在首帧导致主线程卡死 20 分钟以上）；当 `scale > 6` 时自动关闭 DOM `box-shadow` 与 `backdrop-filter`，当本幕被下一幕完全盖住时停止渲染内部舞台。
5. **逐字打字标点防跳行**：流式打字组件（`ChatStream`）遇到汉字后紧跟标点符号（`，。！？；：、）》”`）时，将该汉字与标点绑定在同一帧显现，消除多线程并发渲染时行尾折行来回跳动的问题。

### 4.2 Blender 预渲染管线（单源 + 四角校验 + 签名降级）

```
scenes/careRig.ts (相机/机身姿态纯函数，幕内秒 t)
        │
        ├──► 浏览器端：Phone3D.tsx (若签名不匹配，直接驱动 Three.js 机身兜底)
        │
        ▼ (vw blender track <film>)
out/<film>/blender/track.json
  { sig: "fnv1a_hex", fps: 60, frames: [{ k, pos, rot, scale, cam, screenQuad: [[x,y]x4] }] }
        │
        ▼ (vw blender render <film> -> blender -b -Y --factory-startup -P phone.py)
  1. 投影对齐校验：对比 Blender 相机投影出的屏幕四角与 track.json 的 screenQuad，最大偏差 > 0.5px 立即报错退出
  2. 增量帧判定：比对上一版 track.prev.json，仅渲染姿态/相机发生变化的帧 k（写临时文件再 atomic rename）
  3. 坐标换基与设置：(x,y,z) -> (x,-z,y)，sensor_fit = VERTICAL，Cycles GPU 降噪，仅渲染机身 Bounding Box
        │
        ▼
public/blender/<film>/phone/0000.webp ... NNNN.webp (无损 WebP，60fps 网格，30fps 渲染时取偶数帧 2k)
        │
        ▼ (自动生成签名清单)
src/films/<film>/three/phoneBody.json  { complete: true, sig: "fnv1a_hex", frames: 1441 }
```

---

## 5. 三段式超采样出片与硬件渲染避坑（S2）

针对 Chromium 与 Remotion 在 macOS Apple Silicon 下的实测底层缺陷，出片（`vw render <film> --mode=final`）严格执行三段式流水线：

### 5.1 第一段：静音 4K 超采样画面渲染
- **命令参数**：渲染 `<Film>-60` 合成，开启 `--muted --scale=2 --gl=angle --concurrency=6 --crf=16`，并通过 `--props='{"ssaa":2}'` 通知画布组件。
- **CPU 栅格化 Chrome 包装器**：通过 `--browser-executable` 指向 `scripts/render/chrome-cpu-raster.sh`（内部调用 Remotion 的 `chrome-headless-shell` 并追加 `--disable-gpu-rasterization`），让 DOM/SVG 走 Skia CPU 软件栅格化、WebGL 继续走 ANGLE Metal GPU，彻底根治 3D 透视层内 SVG 描边隔帧变半宽的 bug。
- **FFmpeg 编码期面积滤波缩回 1080p**：在 `remotion.config.ts` 的 `overrideFfmpegCommand` 中拦截视频流编码指令，将 Remotion 4.0.534 默认的 `-vf copy` 替换为 `-vf scale=iw/2:ih/2:flags=area`，使每个 1080p 像素都成为 4K 下 $2 \times 2$ 像素的精确面积平均，斜细线与文字边缘零锯齿。
- **画面缓存复用**：计算 `src/films/<film>/` 下除 `audio/` 以外所有文件的 Hash；若仅修改了混音或配乐而画面代码未变，跳过第一段直接复用已有的 `video-60-muted.mp4`。

### 5.2 第二段：无 WebGL 独立音轨合成渲染
- **根因规避**：若在挂有重型 WebGL/Three.js 的主合成上导出音频，Remotion 仍会并发跑满组件树，导致多标签页同时编译景深/辉光着色器而丢失 WebGL 上下文崩溃（原文档 §9.3 事故）。
- **独立 `<Film>-Audio` 合成**：`Root.tsx` 为每部片自动注册一个同名 `<Film>-Audio` 合成，其内部**仅挂载 `<FilmAudio />` 组件，不挂载任何画面组件**。调用 `npx remotion render <Film>-Audio out/<film>/audio.wav --codec=wav`，30 秒内即可输出逐样本一致的 48kHz 无损 WAV。

### 5.3 第三段：FFmpeg 零偏移封装与自动化声学验收
- **消除 42.7ms AAC 偏移**：不用 Remotion 内置 AAC 编码器（缺少预滚补偿会导致整轨晚 2048 采样 / 42.7ms），改用系统 `ffmpeg` 直接封装：
  ```bash
  ffmpeg -y -i video-60-muted.mp4 -i audio.wav \
    -map 0:v:0 -map 1:a:0 \
    -c:v copy -c:a aac -b:a 256k -movflags +faststart \
    final-60.mp4
  ```
  （若为节奏紧凑的预告片/短片，可选附加 `-af "alimiter=limit=0.85:attack=5:release=50"` 兜住瞬态峰值）。
- **出片后自动验收**：
  1. **同步零时差校验**：解码 `final-60.mp4` 音轨与 `audio.wav` 做互相关（Cross-correlation），断言最大相关峰值对应的采样偏移为 `0ms`（容差 `±1ms`）。
  2. **BS.1770 响度与真峰值报告**：调用 `ffmpeg -nostats -i final-60.mp4 -filter_complex ebur128=peak=true -f null -`，输出 Integrated LUFS（对照目标 -14 LUFS）与 True Peak（dBTP）。

---

## 6. 配音与配乐智能平台（S5 & S6）

### 6.1 音效链路：拍点派生 → 声学画像采购 → 智能排程

1. **拍点派生与覆盖判定（`scripts/spot/plan.mts`）**：
   - 从 `adapter.spots()` 收集全部标注事件，加上 `music.json` 中 `join.kind === 'bridge'` 自动生成的过桥事件（入点前 2.5s 铺 `riser` + 入点落 `impact`，均带 `force: true`）。
   - **同层覆盖去重**：同一泳道（非 `UI` 且无 `force`）在 `±0.4s` 内已有事件时自动跳过（生成计划前强制在进程内清空旧计划引用，避免原系统漏设 `SPOT_NO_PLAN=1` 导致新事件被上一版计划自我吞噬的坑）。
   - **声学包络测量与缓存**：用 `ffprobe` + `ffmpeg astats` 测量每个 WAV 素材的 `onsetSec`（可听起点）、`peakSec`（能量最高点）、`peakDb`（峰值分贝）、`durSec`，按 `filepath + size + mtime` 缓存在 `~/.vw-assets/envelope-cache.json`。
   - **对齐算子**：
     - `RISER (align: 'peak')`：`fromSec = spot.toSec - env.peakSec`（让起势最高峰精准撞在镜头切换那一刻）。
     - `RISER (align: 'onset')`：`fromSec = spot.fromSec - env.onsetSec`，持续时长最多拖过终点 `0.5s`。
     - `WHOOSH / IMPACT / UI`：`fromSec = spot.fromSec`，`startFromSec = env.onsetSec`（切掉素材头部静音，点到即响）。
     - 若算出的 `fromSec < 0`，自动将负差值折算进 `startFromSec` 并将 `fromSec` 置 0。

2. **Epidemic MCP 常驻会话与声学画像打分（`scripts/epidemic/`）**：
   - **常驻会话守护**：工作台与 CLI 共享同一个后台 MCP Session 守护进程，启动时完成 JSON-RPC `initialize` 握手，每 4 分钟自动发送心跳保活，通过环境变量 `EPIDEMIC_MCP_SESSION` 传给子进程，遇 404 自动重握手。
   - **两轮检索 + 预览声学画像打分**：对每个槽跑两轮 `SearchSoundEffects`（第一轮按 `ucs` 子类硬过滤，第二轮放开兜底），拉取免费低清预览 MP3 测量声学特征（如校验 `UI` 层起音 `attackMs <= 25ms`、`RISER` 后半段均方根大于前半段），按以下公式打分排序写入 `out/<film>/candidates.json`：
     $$\text{Score}_{\text{sfx}} = 0.3 \cdot \text{TagOverlap} + 0.15 \cdot \text{Rank} + 0.4 \cdot \text{AcousticFit} + 0.15 \cdot \text{UCSHit} - 0.35 \cdot \text{AvoidWords} - 0.5 \cdot \text{MissingMustWords}$$
   - **换素材保位置（`swap.mts`）**：当用户在工作台或 Agent 通过 CLI 更换某个槽的素材时（特别是峰值位置不同的 `RISER`），自动计算新旧 `fromSec` 差值并反向累加进 `sfxOffsets.json`，确保已调好的时间轴位置不会因换素材而乱跳。

### 6.2 音乐链路：网格选曲 → Adapt 钉主高潮 → Surgery 钉副高潮

贴合 LoomCare 第二代「画面刚性、音乐让步」原则，配乐通过三步精准卡死画面关键拍点：

```
Step 1: 网格可行性选曲 (bpmfit + mscore)
  以画面主高潮 (climax.sec) 为原点，在 60–180 BPM 扫描计算各 P0/P1 视觉拍点到节拍网格的残差代价，
  结合情绪 (0.3)、流派 (0.15)、网格速度 (0.2)、时长 (0.15)、排名 (0.2)、人声惩罚 (-0.6) 与 Camelot 调性接续分选出候选曲。
        │
        ▼
Step 2: Epidemic Adapt 闭环改编（钉死第一高潮 climax）
  调用 MCP EditRecording：targetDurationMs = 段长, requiredRegionsAtOffsets = [{ drop, offsetMsInEdit = climax }]。
  并发跑配方池（r8, r16, r8-peak, r8-noIntro 等），在预览 MP3 上实测 drop 落点（扣除 23ms 预览延迟）：
  - 若 |误差| ≤ 0.6 拍：收敛成功；
  - 若 |误差| > 0.6 拍且 ≤ 4 小节：令 nextOffset -= 0.6 * error，最多迭代修正 3 轮；
  - 完成后等待 1.5s 二次轮询确认 editId 稳定后再下载无损 WAV（规避 Epidemic editId 漂移 bug）。
        │
        ▼
Step 3: 多频带分析 (analyze) + 整小节乐句重排 (surgery，钉死第二高潮 climax2)
  1. analyze.mts：ffmpeg 单次解码分三频带（全带 / <120Hz 低频 / >2500Hz 高频），每 10ms 算 RMS 一阶差分正半波 flux；
     在 4 拍滞后 ±3% 粗搜、16/32 拍滞后 ±0.4% 归一化自相关+抛物线插值精修拍周期（搜索窗严格 < 半拍防八分音符别名）；
     结合低频能量与 Drop 到顶拍加权消除电子乐 1/3 拍半小节相位歧义，输出实测 beats / downbeats / sections / jumps。
  2. surgery.mts（当存在第二高潮 climax2 且 Adapt 后偏离 > 1 拍时触发）：
     提取逐拍 12 维 Chroma + 6 带能量 + 小节位置 + RMS，计算任意两拍间的接缝跳跃代价：
     jumpCost(i -> j) = d(i+1, j) + 0.5*d(i+2, j+1) + 0.5*d(i, j-1) + [barPos(i) != barPos(j)] + |ΔRMS|/6
     仅允许在整小节边界（4/8/16 拍，严禁半小节下刀以防后续拍网格错位）执行「一删一插」，
     刀口置于小节头前 15ms 处做 12ms 等功率交叉淡化，将第二高潮精准平移至 climax2.sec 且保持总时长不变。
```

> **本地 ABC 作曲兜底 Provider**：在未配置 Epidemic 账号或离线环境下，`vw music match` 自动路由至内置的本地作曲引擎（继承自 `huashu-motion`），直接按照 `timeline.ts` 的目标 BPM、小节结构与高潮秒数生成多轨采样合成 WAV，输出相同格式的 `analysis.json` 与 `music.json`，上层混音与工作台完全无感。

---

## 7. 统一工作台与 Inbox「指着改」协议（S4）

### 7.1 工作台架构与 Web Audio 实时监听图

工作台（`tools/studio`，运行于 `127.0.0.1:5177`）是一个前后端一体的 Vite 应用：
- **后端（Vite Server Plugin）**：
  - **禁 ESM 缓存读取**：所有读取 `src/films/<film>/audio/*.json` 的接口一律走 `fs.readFileSync` 实时读盘，彻底根治原系统因 Node 模块缓存导致工作台比成片轻 6 dB 的顽疾。
  - **分级执行与原子锁**：调参接口（`offset / gain / fade / duck / mix`）走内存队列 + 临时文件 `rename` 原子写盘，并在毫秒级内就地更新 `out/<film>/state.json`，同时通过 WebSocket 向浏览器广播 `state:patch`；耗时任务（`adapt / surgery / sync-choreo / render`）走异步子进程池并通过 WebSocket 流式推送进度。
- **前端 Web Audio 节点拓扑（与 `src/shared/audio-math.ts` 完全同构）**：
  ```
  BufferSourceNode (按 startFromSec / playbackRate 触发)
       │
       ▼
  GainNode (片段基础音量 plan.volume × dbToLinear(sfxGains[key]))
       │
       ▼
  GainNode (淡入淡出包络 fadeAt)
       │
       ▼
  GainNode (让位包络 duckAt)
       │
       ▼
  LayerBus GainNode (七条泳道各自汇总：dbToLinear(mix.layers[layer]) × Mute/Solo 门控)
       │
       ▼
  MasterBus GainNode (dbToLinear(mix.master)) ──► AnalyserNode (实时峰值表 + BS.1770 离线响度测量) ──► AudioDestination
  ```
  - **防抖重排纪律**：拖动推子、改增益、改淡化、改让位时**只更新现有 GainNode 参数，绝不重建音源**；仅当视频播放头与音频时钟漂移 `> 120ms` 且距离上次重排 `>= 1.5s` 时才重新 seek 音源。

### 7.2 `huashu-motion` Inbox「指着画面/音轨改」协议

工作台右上角与快捷键（`C` 键进入批注模式）内置 **Inbox 批注器**，支持对**画面**和**音轨**发起结构化修改单，保存在 `out/<film>/inbox.json`：

```typescript
// src/shared/types.ts 中的 Inbox 协议定义

export type InboxTargetType = 'visual' | 'audio' | 'global';

export interface InboxVisualContext {
  sceneId: string;                 // 自动反查 timeline.ts 命中的幕 ID，如 "care"
  sceneFile: string;               // 对应源码路径，如 "src/films/loomcare/scenes/Care.tsx"
  sceneLocalSec: number;           // 幕内秒数，如 4.25
  boxNormalized?: [number, number, number, number]; // 框选区域归一化坐标 [x, y, w, h] (0~1)
  domHint?: string;                // 若点击在 DOM 2.5D 元素上，自动提取 data-vw-id 或组件类名
  screenshotPath?: string;         // 自动截取的当前帧带红框标注图 "out/<film>/inbox/shot-001.png"
}

export interface InboxAudioContext {
  layer: AudioLayer;               // 如 "IMPACT" | "MUSIC"
  itemKey?: string;                // 如 "lcAwHeart·心跳两下" 或 "music:c1"
  slot?: string;                   // 如 "lcAwHeart"
  currentOffsetSec?: number;
  currentGainDb?: number;
  currentDuck?: DuckSpec;
}

export interface InboxItem {
  id: string;                      // 如 "INB-001"
  film: string;
  createdAt: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  targetType: InboxTargetType;
  filmSec: number;                 // 批注发生的全片秒数
  instruction: string;             // 用户输入的自然语言指令，如 "卡片弹出的弹簧太硬，顺便把这里的咔哒声换轻一点"
  visual?: InboxVisualContext;
  audio?: InboxAudioContext;
  resolutionNote?: string;         // Agent 处理完成后回填的修改说明与涉及的文件列表
  snapshotVersionBefore?: string;  // Agent 动手前自动创建的混音快照 ID（支持一键撤销）
}
```

**人机闭环工作流**：
1. 用户在工作台边看边听，点画面或点波形留下 3~5 条批注单。
2. 用户对 Agent 说一句：「处理一下收件箱里的修改意见」（或在工作台点击「让 Agent 执行 Inbox」）。
3. Agent 运行 `vw inbox list <film> --status=pending` 获取全部带精确源码坐标、幕内秒数、截图与音效 Key 的任务单。
4. Agent 自动先调 `vw version save <film> --tag="pre-inbox"` 备份快照，随后修改对应的 `scenes/*.tsx` 或调用 `vw sfx tune / swap` 修改九张 JSON，最后执行 `vw inbox resolve <film> <id> --note="..."`。
5. 工作台通过 WebSocket 收到 `inbox:resolved` 与 `state:patch` 事件，自动刷新音轨与预览，用户当场验收。

---

## 8. CLI 命令体系、守门质检与 Agent Skill 封装（S7）

### 8.1 统一 CLI（`vw` / `om`）命令速查表

所有命令第一个位置参数均为 `<film>`（若当前终端设置了 `.vwrc` 默认活跃片可省略，否则缺失即报错退出）：

| 命令分类 | 标准命令签名 | 核心行为与产出 |
|---|---|---|
| **项目初始化** | `vw init <film> [--template=loomcare]` | 创建 `src/films/<film>/` 标准目录、秒制 `timeline.ts`、空九张 JSON 并注册进 `src/films.ts`。 |
| **工作台** | `vw studio <film> [--port=5177]` | 先执行 `export` 生成最新 `state.json`，再启动带 Web Audio 混音与 Inbox 批注的本地工作台。 |
| **Blender 管线** | `vw blender track <film> [--scene=care]`<br>`vw blender render <film> [--force]` | 导出机位与屏幕四角坐标 + FNV-1a 签名；后台启动单进程 Cycles 渲染变更帧，输出无损 WebP 与 `phoneBody.json`。 |
| **拍点与音效** | `vw spot sync <film>`<br>`vw sfx search <film> [slot...]`<br>`vw sfx pick <film> <slot> <candIndex>`<br>`vw sfx tune <film> <key> [--offset=] [--gain=] [--fade=] [--duck=]` | 从各幕 `*_T` 派生拍点并增量迁移已有九张 JSON 调参；走 Epidemic MCP 检索并按声学画像打分；切换槽素材并自动保位置；命令行直接精修混音参数。 |
| **配乐智能** | `vw music search <film> [--cue=c1]`<br>`vw music adapt <film> <cueId> <trackId> [--dropAt=]`<br>`vw music surgery <film> <cueId>` | 按 `bpmfit` 网格代价与简报打分选曲；执行 Adapt 闭环钉死第一高潮；执行多频带分析与整小节乐句重排钉死第二高潮。 |
| **Inbox 协同** | `vw inbox list <film> [--status=pending]`<br>`vw inbox resolve <film> <inboxId> --note="..."` | 供 Agent 读取用户在工作台点选画面/音轨生成的结构化批注单，并在修复后结单通知前端。 |
| **质检守门** | `vw check <film> [--qa-frames]` | 一键执行 5 项静态与动态守门（详见 8.2），不通过返回非 0 退出码。 |
| **渲染出片** | `vw render <film> --mode=master`<br>`vw render <film> --mode=final` | `master`：出 30fps 静音母片并更新工作台；`final`：执行三段式出片（4K SSAA 静音片 + 独立 Audio WAV + ffmpeg 零偏移封装 + ebur128 验收）。 |

### 8.2 `vw check <film>` 五道自动化质检守门

结合原系统 `guard`（架构文档 §19）与 `huashu-motion` 的视觉 QA 守门，任何修改在出片前必须通过 `vw check <film>`：
1. **确定性静态守门**：全量扫描 `src/films/<film>/` 与 `src/components/`，发现 CSS `transition`、`animation`、`Math.random`、未配对的 `delayRender` 立即报错（修复原系统只扫 dream 目录的漏洞 §21 S2）。
2. **全量 TypeScript 类型守门**：同时校验渲染代码、适配器脚本与工作台前后端类型（修复原系统根 `tsconfig` 漏查适配器脚本的漏洞 §21 S3）。
3. **拍点覆盖与死键守门**：校验 `adapter.K` 中的每一个关键拍点要么被 `spots()` 挂载了声音，要么显式列在 `ignoredKeys` 白名单中；校验 `sfxOffsets / Gains / Fades / Ducks` 中不存在悬空的孤儿 Key。
4. **配乐与时间轴守门**：校验 `timeline.ts` 无循环依赖（修复 §21 S6）；校验 `music.json` 各段 `TimeRef` 现解析秒数与存储值一致、段间无非法重叠、曲目 WAV 存在、锚点不越界；若启用了 Blender 机身，校验 `phoneBody.json` 的 `sig` 与当前 `rig.ts` 实时计算的签名是否一致。
5. **画面抽帧视觉 QA（`--qa-frames`）**：在各幕关键拍点 `K` 处调用 `remotion still` 抽帧，自动检测是否存在黑帧、文字溢出安全框裁切、前景与背景 OKLab 对比度不足等问题。

### 8.3 Agent Skill 封装结构（`skills/video-workbench/`）

将整套工具链与 `huashu-motion` 的导演手艺封装为标准 Skill，使 Agent 既懂工程命令，又具备审美手艺：
- **`SKILL.md`**：定义四大标准作业流——
  1. **新片创制流**：读产品事实 → 规划 12 幕节奏单与 `timeline.ts` → 写各幕组件与 `rig.ts` → 跑 `vw blender` → 跑 `vw render --mode=master`。
  2. **自动配音配乐流**：写 `adapter.ts` 语义拍点 → `vw spot sync` → `vw sfx procure` → `vw music match` → `vw check`。
  3. **Inbox 接单精修流**：读 `vw inbox list` → 自动备份快照 → 定位画面幕代码或混音 JSON 修改 → `vw inbox resolve`。
  4. **交付出片流**：跑 `vw check --qa-frames` → 跑 `vw render --mode=final` → 核对 LUFS 响度与 0ms 同步报告。
- **`references/director-craft.md`**：收纳 `huashu-motion` 的 20 种运动语言、LoomCare 的产品曲线（`out / inOut / spring`）与镜头曲线（`camOut / cam`）、四档标准时长 `DUR`，以及「金色只标 AI 时刻」的 OKLab 色彩规范。
- **`references/sound-design.md`**：收纳七泳道职责边界、UCS 检索词语法、让位（Ducking）标准参数（如心跳/重点提示压配乐 -5dB，pre 0.2s / hold 1.1s / release 0.8s）与 BS.1770 响度配平经验。
