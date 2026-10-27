import { defineStyle } from '../types';

/**
 * 暗色科技发布 · Dark Tech Keynote（收录自 lemo-opuscar，信息与发布）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo dark-keynote）
 */
export const DARK_KEYNOTE = defineStyle({
  id: "dark-keynote",
  label: "暗色科技发布 · Dark Tech Keynote",
  colors: {
    bg0: "#0A0B0F",
    bg1: "#151822",
    surf: "#12151C",
    surf2: "#1A1E28",
    surf3: "#222734",
    text: "#E8EAF0",
    dim: "#8A90A0",
    mute: "#5C6272",
    accent: "#B7F34A",
    red: "#FF5A5F",
    cool: "#3B4CCA",
    electricViolet: "#8B7CFF",
    signalOrange: "#FF7A1A",
  },
  fonts: {
    display: "\"Inter\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Inter Tight\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"JetBrains Mono\", \"SF Mono\", Menlo, monospace",
  },
});
