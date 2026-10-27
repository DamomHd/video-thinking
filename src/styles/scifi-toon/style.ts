import { defineStyle } from '../types';

/**
 * 科幻情景喜剧卡通 · Sci-Fi Sitcom Toon（收录自 lemo-opuscar，卡通与动画）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo scifi-toon）
 */
export const SCIFI_TOON = defineStyle({
  id: "scifi-toon",
  label: "科幻情景喜剧卡通 · Sci-Fi Sitcom Toon",
  colors: {
    skinV: "#F2C9A0",
    skinVs: "#D9A57C",
    stub: "#DCB08E",
    robe: "#2A9D8F",
    robeS: "#1C6F66",
    pj: "#B9A7DC",
    pjS: "#8E79BD",
    slip: "#FF9ECB",
    slipS: "#E0719F",
    brow: "#3A3340",
    gogF: "#737B87",
    gogL: "#FFB020",
    skinG: "#A8714A",
    skinGs: "#855535",
    vest: "#9B7FD4",
    vestS: "#7A5FB3",
    shirt: "#F4F1EA",
    shorts: "#CDB37A",
    shortsS: "#A88F58",
    helm: "#EF5B3F",
    helmS: "#C43F27",
    sock: "#F4F1EA",
    shoe: "#3B6FD6",
    shoeS: "#2A52A8",
    frame: "#3A2A20",
    lens: "#D6F3FF",
    mouthIn: "#4A1A2A",
    tongue: "#E8637A",
    white: "#FFFFFF",
    cup: "#F7F3EA",
    cupS: "#D9D1C1",
    sleeve: "#B5763C",
    coffee: "#6B3E26",
    blob: "#7B4A2D",
    crema: "#C99A66",
  },
  fonts: {
    display: "\"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
