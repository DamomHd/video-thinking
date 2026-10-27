import { defineStyle } from '../types';

/**
 * 视觉调查 · Visual Investigation（收录自 lemo-opuscar，剪辑与纪实）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo visual-investigation）
 */
export const VISUAL_INVESTIGATION = defineStyle({
  id: "visual-investigation",
  label: "视觉调查 · Visual Investigation",
  colors: {
    valueGround: "#0B0C0E",
    groundPanels: "#141619",
    hairlinesFrames: "#2E3238",
    framesText: "#ECEAE4",
    secondaryText: "#8B9097",
    ticksUncertain: "#4A4F57",
    nowMatch: "#FF4A2E",
    typesetTelegrams: "#E4E0D4",
    telegramsInk: "#1D1D1B",
  },
  fonts: {
    display: "\"Noto Sans SC\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Source Serif\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    mono: "\"IBM Plex Mono\", \"SF Mono\", Menlo, monospace",
  },
});
