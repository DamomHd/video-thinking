import { defineStyle } from '../types';

/**
 * 瑞士动态排版 · Swiss Motion Graphics（收录自 lemo-opuscar，图形与排版）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo swiss-motion）
 */
export const SWISS_MOTION = defineStyle({
  id: "swiss-motion",
  label: "瑞士动态排版 · Swiss Motion Graphics",
  colors: {
    page: "#EAE9E5",
    paper: "#FFFFFF",
    ink: "#111111",
    red: "#E30613",
    grid: "#CFCEC9",
    pgrid: "#E2E1DC",
    bass: "#CFCEC9",
    mute: "#77766F",
    col: "#E2E1DC",
    wall: "#DFDED9",
    signal: "#F2F0EA",
    c1: "#141414",
    signalSignal: "#FF5A00",
    c2: "#E9ECEF",
    rSignal: "#0B0B0B",
    c3: "#1F3FFF",
  },
  fonts: {
    display: "\"Archivo\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Inter\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
