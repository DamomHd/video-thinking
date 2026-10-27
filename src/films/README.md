# 片子目录

每部片一个目录。引擎**按目录自动发现**，不用再去总注册里加一行（约定见 `src/shared/film-root.ts`）。

```
src/films/<片>/
  film.json          id / title / fps / width / height      Node 侧（vw、工作台、测试）同步读；Remotion 合成尺寸也用它
  root.tsx           导出 filmRoot：幕表、画面组件、九张真值、打字表、额外合成（extra）
  timeline.ts        幕表（秒 + 幕，buildPlan）
  theme.ts           主题（默认自己设计；沿用库里的风格时 extendStyle）
  index.tsx          FilmShell 装配 + 真值导出
  scenes/ shots/     画面
  audio/             九张 JSON 真值 + adapter.ts（FilmAdapter 子类）；有口播时加 voice.json，按片作曲时加 score.ts
  director.md        导演决策单（vw review 会查）
```

- 新片：`vw init <片>` 生成骨架，并自动写好 `film.json` 和 `root.tsx`。**竖屏片**把 `film.json` 的宽高改成 `1080 × 1920`。
- 目录在就登记，不在就没有。真实业务数据的片子（`anlan-*`）被 `.gitignore` 排除，只留在本机；新增这类片子在 `.gitignore` 里加一行。
- `product-story-test`、`loomcare-demo`、`us`、`us-paper` 在库里，是风格样片、骨架和示例。
