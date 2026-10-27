# huashu-clip（收录）

- 来源：npm 包 `huashu-motion@0.1.1`（花叔，2026-10-19 发布）的 `runtime/clip/`；它本身来自 huashu-art-motion `scripts/engine/`（commit `57d6760`，2026-10-08）。
- 授权：MIT，见同目录 `LICENSE`。字体在 `public/fonts/clip/`（SIL OFL 1.1，见那里的 `LICENSES.md`、`OFL.txt`）。
- 收录日期：2026-10-26。

## 收了什么
- `lib/*.js`：上游 11 个共用画图库，**原样**（只有 `toon.js` 例外，见下）。
- `grammars/*.js`：上游 8 个画法里的 7 个，原样：`t1_3b1b`（公式讲解）、`t2_keynote_ui`（发布会卡片）、`t3_finance_chart`（金融图表）、`y1_kurzgesagt`（科普插画）、`y2_vox`（拼贴论证）、`y3_whiteboard`（白板推演）、`y5_kinetic_type`（动态文字）。
- `cues.js`：上游的文案对时（pace、口播词锚点、片长），原样。

## 没收什么、改了什么
- **不收 `y4_storytime`，并从 `lib/toon.js` 删掉了「豆子花叔」角色（`TOON.POSES` / `TOON.bean`）**：那是作者本人的卡通形象，上游 `THIRD_PARTY.md` 写明不在 MIT 授权范围内，不许用于本项目演示以外的用途。删掉后补了一行线条色常量（下面的漫画符号要用）。
- 不收上游的 `clip.js`（它依赖 GSAP 和 huashu-motion 的 `OM.*`）。本工程的对应部分在 `src/components/clip/`：按 Remotion 的逐帧方式重写了「读 spec → 排 cue → 每帧调用 `grammar.draw(画布, t, ctx)`」，字体与图片用 `delayRender` 等待。
- GSAP 不需要（它有自己的授权，本工程不用）。

## 规矩
- 这里的文件尽量保持原样，方便跟上游对照和同步。要改行为，改 `src/components/clip/`，不改这里。
- 这些文件是浏览器全局脚本（挂 `window.U` / `window.MO` / `window.TY`…），只在 Remotion 渲染端由 `src/components/clip/load.ts` 按上游顺序加载；Node 端（测试、脚本）不要 import 它们。
