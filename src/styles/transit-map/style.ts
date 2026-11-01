import { defineStyle } from '../types';

/**
 * 地铁线路图 · Transit Map（收录自 lemo-opuscar，信息与发布）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo transit-map）
 */
export const TRANSIT_MAP = defineStyle({
  id: "transit-map",
  label: "地铁线路图 · Transit Map",
  colors: {
    warmTable: "#1B1918",
    demoPaper: "#F2EEE5",
    paperInk: "#1B1C1E",
    secondaryText: "#4A4740",
    textRiver: "#BCD6EA",
    river: "#8FB5D6",
    riverLabels: "#5F88AD",
    labelsAccent: "#E3002B",
    comparisonNavy: "#24346E",
  },
  fonts: {
    display: "\"Inter\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Noto Sans SC\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
