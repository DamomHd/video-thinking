import { defineStyle } from '../types';

/**
 * 电视新闻包装 · Broadcast News Package（收录自 lemo-opuscar，剪辑与纪实）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo news-package）
 */
export const NEWS_PACKAGE = defineStyle({
  id: "news-package",
  label: "电视新闻包装 · Broadcast News Package",
  colors: {
    ink: "#121417",
    ink2: "#1B1E23",
    ink3: "#22262C",
    line: "#454B55",
    lemon: "#F2CF1D",
    lemonL: "#F8DE4A",
    lemonD: "#D8B30C",
    gold: "#D4B064",
    paper: "#F4F1E8",
    orange: "#FE6B3D",
    white: "#FFFFFF",
    grey: "#C9CCD2",
    grey2: "#7D838D",
    darkOlive: "#6E5A1E",
    whiteDuotone: "#0E1013",
    duotone: "#ECE7D8",
  },
  fonts: {
    display: "\"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
