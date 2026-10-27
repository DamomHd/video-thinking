import { defineStyle } from '../types';

/**
 * 点云测绘 · LiDAR Survey（收录自 lemo-opuscar，实证影像）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo lidar-survey）
 */
export const LIDAR_SURVEY = defineStyle({
  id: "lidar-survey",
  label: "点云测绘 · LiDAR Survey",
  colors: {
    bg: "#05080A",
    fog: "#0A1013",
    vLow: "#1F3F35",
    vMid: "#5C9A7A",
    vHigh: "#E2F3DC",
    gpt: "#C8B38C",
    clay: "#BDB5A6",
    shade: "#26303A",
    scan: "#D4FFF0",
    amber: "#FFB347",
    forest: "#83C495",
    ink: "#EEF3F1",
    dim: "#A9B8B3",
    faint: "#7F908B",
  },
  fonts: {
    display: "\"Barlow Condensed\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Noto Sans SC\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"IBM Plex Mono\", \"SF Mono\", Menlo, monospace",
  },
});
