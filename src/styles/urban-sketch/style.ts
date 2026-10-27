import { defineStyle } from '../types';

/**
 * 钢笔淡彩 · Urban Sketch · Pen & Wash（收录自 lemo-opuscar，手绘与绘画）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo urban-sketch）
 */
export const URBAN_SKETCH = defineStyle({
  id: "urban-sketch",
  label: "钢笔淡彩 · Urban Sketch · Pen & Wash",
  colors: {
    summerLawn: "#C3C96F",
    lawnLeaves: "#7FA04A",
    leavesSky: "#9FBCD6",
    skyLimestone: "#D8C6A0",
    morningSea: "#7FA6B8",
    seaHulls: "#C9573F",
    hullsRope: "#C8A86B",
    ropeSky: "#BCD0DC",
    marketRoofs: "#8B93A6",
    roofsLights: "#E2B04A",
    lightsAwnings: "#B8483E",
  },
  fonts: {
    display: "\"Caveat\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Caveat\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
