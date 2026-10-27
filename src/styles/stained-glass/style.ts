import { defineStyle } from '../types';

/**
 * 彩色玻璃窗 · Stained Glass（收录自 lemo-opuscar，图形与排版）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo stained-glass）
 */
export const STAINED_GLASS = defineStyle({
  id: "stained-glass",
  label: "彩色玻璃窗 · Stained Glass",
  colors: {
    cobalt: "#1D3A9C",
    deepblue: "#142A70",
    blue2: "#2A52B0",
    ruby: "#A8101C",
    ruby2: "#860C18",
    gold: "#DC9A22",
    gold2: "#EAB640",
    green: "#2F7F36",
    green2: "#22602E",
    olive: "#6B7A22",
    purple: "#632A63",
    purple2: "#4C2A5E",
    flesh: "#D2A288",
    white: "#CFDAC6",
    sky: "#7FA2CF",
    brown: "#7A4E24",
    amber: "#FF9A2A",
    steel: "#A9B7B2",
    steel2: "#8D9E9C",
    red2: "#C8452A",
    teal: "#2F7F86",
    rose: "#C25A78",
  },
  fonts: {
    display: "\"IM Fell English\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    text: "\"IM Fell English\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
