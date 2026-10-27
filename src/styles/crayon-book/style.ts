import { defineStyle } from '../types';

/**
 * 蜡笔儿童绘本 · Crayon Picture Book（收录自 lemo-opuscar，手绘与绘画）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo crayon-book）
 */
export const CRAYON_BOOK = defineStyle({
  id: "crayon-book",
  label: "蜡笔儿童绘本 · Crayon Picture Book",
  colors: {
    ink: "#2D3263",
    yellow: "#F5C63C",
    orange: "#EC8A3C",
    red: "#D4483C",
    pink: "#EE8EA4",
    peach: "#F4C7A4",
    brown: "#7A4B31",
    ochre: "#E7B867",
    green: "#62A24C",
    sky: "#79ACD9",
    violet: "#6A5AA6",
    white: "#FBFAF4",
    warmOffWhite: "#F4EFE3",
  },
  fonts: {
    display: "\"Patrick Hand\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Patrick Hand\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
