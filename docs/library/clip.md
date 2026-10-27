# 画法片段（huashu-clip）

> 从 huashu-motion 收录的 7 个参数化画法（MIT，见 `src/vendor/huashu-clip/NOTICE.md`）。模型给数据和节奏，画法负责画。
> 它们是**积木，不是片子骨架**：一部片可以在某一段用一个画法片段，其余照常自己设计；不要整部片套一个模板。

## 7 个画法

| grammar | 中文 | 对应语言（`languages/`） | 适合 | 不适合 |
|---|---|---|---|---|
| `t1_3b1b` | 公式讲解（3Blue1Brown 式） | mechanism | 公式、曲线、算法：上一个概念直接变成下一个 | 发布、故事、快切 |
| `t2_keynote_ui` | 发布会卡片 | card-montage / modular-grid | 功能、参数、一张截图、一个大数字 | 机制讲解、坏消息 |
| `t3_finance_chart` | 金融图表 | data-story | 营收、增长、占比、带一个转折点的趋势（真数据） | 只有一个孤零零的数 |
| `y1_kurzgesagt` | 科普插画（Kurzgesagt 式） | flat-world | 「X 里面有什么」：系统、部件、尺度 | 真人真事、一步步推理 |
| `y2_vox` | 拼贴论证（Vox 式） | editorial-collage | 用真实截图 / 文档 / 剪报论证：「看这一行」 | 没有真实素材的纯概念（会变成假证据） |
| `y3_whiteboard` | 白板推演 | hand-drawn | 一步步推理、因果链、「为什么」，最后拉远看全板 | 精确数据 |
| `y5_kinetic_type` | 动态文字 | kinetic-type | 清单、阶段、章节卡、一句结论、一个数字 | 超过 ~5 项的长解释 |

不收：`y4_storytime`（作者本人卡通形象，不在授权范围内）。

## 数据怎么写

```ts
import type { ClipSpec } from '../../shared/clip';
const SPEC: ClipSpec = {
  grammar: 'y5_kinetic_type',
  duration: 8,          // 秒（乘 pace 前）
  pace: 1,              // 所有时刻乘它；上游示例比实际节奏密 2.5–3 倍，正式用时常设 2–3
  cues: [
    { at: 0, kind: 'title', text: '三个阶段' },
    { at: 1.9, kind: 'point', text: '补全', sub: '写一行，补一行', data: { label: '01' } },
    { at: 6.4, kind: 'highlight', data: { word: '补全' } },
  ],
};
```

- 每个画法认哪些 `kind`、`data` 字段怎么写：看画法文件开头的注释（`src/vendor/huashu-clip/grammars/<grammar>.js`），完整示例在 `src/probe/clip-specs/<grammar>.json`。
- 图片（`cue.image` / `data.image`）写相对 `public/` 的路径，或 `http(s):` / `data:` 地址。
- 透明底（叠在别的画面上）：`alpha: true`。竖屏：`width: 1080, height: 1920`。
- 编数据要带「示意数据」角标（金融图表的 `data.badge`）；真数据写真来源。

## 放进片子

```tsx
import { ClipCanvas } from '../../components/clip';
import { clipEvents } from '../../shared/clip';

// 画面：在某一段里放一个片段，t 是片段内的秒
<ClipCanvas spec={SPEC} t={t - CLIP_START} />

// 声音：提示点自动变成动作事件，和别的画面动作一起交给 autoSpots
export const EVENTS = [...otherEvents, ...clipEvents(SPEC, { offsetSec: CLIP_START })];
```

提示点 → 动作事件：title 渐起、point / step / insert / bar 弹出、number 滚动计数、highlight / line / draw 描、card 落定、equation 聚焦、enter 嗖、image 纸张、react 盖章；`sfx: false` 记为留白。

## 限制
- 同一画法的排版存在画法模块里（只有一份）：同一部片先后用两个同画法片段没问题（组件发现换了片段会重新排版），**同一帧里同时显示两个同画法片段不行**。
- 不支持口播对齐（上游的 `cue.word` 锚点要配合口播，本工程还没有口播）。
- 片段内部有自己的镜头（画法自带），和片子的镜头清单是两层：片段整体放在世界里的哪、多大，由片子决定。

## 验收
- 探针：`npx remotion still src/probe/index.ts ClipProbe-<grammar 下划线换连字符> out.png --frame=N --gl=angle`（7 个画法都渲过、同一帧跳着渲逐字节一致，2026-10-26）。
- 在真片里用过：还没有。第一次用时按 `docs/method/taste.md` 先做海报帧评审。
