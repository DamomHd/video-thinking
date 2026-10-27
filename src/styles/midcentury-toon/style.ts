import { defineStyle } from '../types';

/**
 * 50s 扁平卡通 · Mid-century Cartoon（收录自 lemo-opuscar，卡通与动画）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo midcentury-toon）
 */
export const MIDCENTURY_TOON = defineStyle({
  id: "midcentury-toon",
  label: "50s 扁平卡通 · Mid-century Cartoon",
  colors: {
    poster1: "#F3E9D4",
    poster2: "#EADDC7",
    poster3: "#A59476",
    poster4: "#DDB8A5",
    poster5: "#F9F1DE",
    poster6: "#4D4536",
  },
  fonts: {
    display: "\"Oleo Script Bold\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Alfa Slab One\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
