import { defineStyle } from '../types';

/**
 * 浮世绘 · Ukiyo-e（收录自 lemo-opuscar，东方传统）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo ukiyoe）
 */
export const UKIYOE = defineStyle({
  id: "ukiyoe",
  label: "浮世绘 · Ukiyo-e",
  colors: {
    paper: "#EEE2C6",
    paperD: "#E2D3B0",
    mount: "#C9B690",
    mountD: "#B19D74",
    prus: "#1D3A66",
    prusD: "#13284A",
    prusL: "#4D6F98",
    ai: "#2F4F73",
    sky: "#8DB0C6",
    skyL: "#BCD0D6",
    sumi: "#231F1C",
    sumiL: "#4A4540",
    grey: "#8B8A80",
    greyL: "#B3B0A2",
    greyD: "#5F5E58",
    beni: "#B8412F",
    beniL: "#E3A08A",
    beniP: "#EFC4A8",
    ochre: "#CF9F4A",
    ochreL: "#E2C27E",
    straw: "#C9A45C",
    green: "#8AA152",
    greenD: "#50703C",
    greenL: "#B5C07A",
    pine: "#3E5A3A",
    skin: "#ECD6B2",
    wood: "#8A6A48",
    woodD: "#5E4631",
    woodL: "#B08D63",
    plaster: "#DFD2B2",
    white: "#F6EFDC",
  },
  fonts: {
    display: "\"Shippori Mincho\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    text: "\"Shippori Mincho\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
