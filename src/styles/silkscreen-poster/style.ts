import { defineStyle } from '../types';

/**
 * 丝印旅行海报 · Silkscreen Travel Poster（收录自 lemo-opuscar，印刷与版画）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo silkscreen-poster）
 */
export const SILKSCREEN_POSTER = defineStyle({
  id: "silkscreen-poster",
  label: "丝印旅行海报 · Silkscreen Travel Poster",
  colors: {
    accentDawn: "#F6CD98",
    dawn: "#EE9A73",
    c1: "#9A7FA8",
    c2: "#3E7079",
    c3: "#1E3B3F",
    c4: "#FBE6B4",
    harbourNoon: "#E8F0F2",
    noon: "#7FB3C8",
    c5: "#D9C7A3",
    c6: "#2F6E8E",
    c7: "#173247",
    c8: "#E8553D",
    winter: "#EEF1F4",
    c9: "#B8C9D9",
    c10: "#8B9BB0",
    c11: "#4A5D78",
    c12: "#1F2A3C",
    c13: "#F2B134",
  },
  fonts: {
    display: "\"Big Shoulders Display\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"League Gothic\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
