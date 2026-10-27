# 图纸 · Engineering Blueprint（blueprint）

> 自有风格，沉淀自参考片 `迁移汇报.mp4` 与 anlan-report。2026-10-27 按风格库规范补全（STYLE.md、CHANGES.md、样片）。

**一句话**：把要讲的东西当成一张真的工程图——可以被测量、被标注、被剖开看。冷静、精确、克制。

**适合**：项目汇报 · 技术方案 · 架构 / 链路 / 迁移讲解 · 关系复杂、数据不多的内容

**用来做**：横屏 1920×1080，30 秒到 3 分钟；没有口播（要口播先问）。

**不适合**：情绪向、生活方式类宣传；需要大面积照片、实拍或真实感产品界面的内容（那类用 product-story）。

## 文件
- `STYLE.md`：完整的风格说明（选了这个风格就按它做）。
- `CHANGES.md`：沉淀时相对基准作品做的取舍。
- `style.ts`：色板、字体、图框（片子派生时通常只换 `accent` 一组）。
- `refs/demo.mp4`：样片 = 基准作品 `迁移汇报.mp4`（软链到仓库根目录的原片；总览页里直接播）。只是一个例子，不照搬它的铁轨、道岔和镜头。
- `refs/poster.jpg`：海报帧（anlan-report 4.5s 封面）；`refs/styleframe.png`：风格帧（anlan-report 33s「搬逻辑，不搬应用。」）。
- `refs/ref-*.jpg`：基准作品的 4 帧（58s 架构迁徙、92s 双跑对照、116s 灰度切流、176s 落版）。
- 为什么它显得高级：`docs/library/exemplars/migration-report/notes.md`。

## 基准作品实测（迁移汇报.mp4，185 秒，960×544 · 27fps）
- 结构：编号章节（01 范围 → 03 架构 → 04 接口 → 05 换轨 → 06 存量 → 07 排期）→ 落版（道岔特写 + 大字 + 六格数字）。
- 画面：全片同一张图纸；静止 82% / 细微 15% / 明显 3% / 大幅 0%，动作段中位 0.30 秒，硬切 3 处。
- 声音：没有口播；响度 −16.8 LUFS、真峰 −2.1 dBFS、LRA 14.8 LU（安静段和重拍差得大）。

## 和 product-story 的区别
图纸讲「结构」：线和字、没有卡片和阴影、几乎不动。product-story 讲「一个系统怎么帮人把事办成」：真实感界面和单据、暗场金光、界面里的动作快。

## 片子怎么派生
```ts
import { extendStyle } from '../../styles/types';
import { BLUEPRINT } from '../../styles/blueprint/style';

export const MY_THEME = extendStyle(BLUEPRINT, {
  colors: { accent: '#FD8FAC' },     // 只写不同的部分
  track: { width: 7 },              // 片子特有的段直接加
});
```

样张：`vw style sheet blueprint` → `out/styles/blueprint-sheet.png`（色板、字号阶梯、墨线层级、图框）。
