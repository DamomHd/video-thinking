import { defineStyle } from '../types';

/**
 * 等距绘本 · Isometric Picture Book（收录自 lemo-opuscar，信息与发布）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo isometric-picture-book）
 */
export const ISOMETRIC_PICTURE_BOOK = defineStyle({
  id: "isometric-picture-book",
  label: "等距绘本 · Isometric Picture Book",
  colors: {
    ink: "#2E2522",
    bg: "#F2E6D0",
    paper: "#FBF4E6",
    soft: "#7A7468",
    ghost: "#D6CCBA",
    accent: "#D0573A",
    accentLt: "#EDBFA9",
    green: "#3D6B59",
    greenMid: "#6E9886",
    greenLt: "#A7C2B2",
    ginger: "#E2AE3A",
    hair: "#2A2624",
    skin: "#D9A882",
    dark: "#3A3E3B",
    apron: "#EAE2D3",
    apronJoint: "#DDD3C1",
    carpet: "#F2E5CE",
    carpetLane: "#EADAC0",
    carpetEdge: "#DCCAAC",
    body: "#F6F2EA",
    belly: "#E4DDD1",
    cabinFloor: "#E3D3B8",
    aisle: "#F5ECDC",
    wallIn: "#F7F1E6",
    glass: "#C3D8D1",
    metal: "#CEC7BA",
    screen: "#2F3532",
    palettePaper: "#F1E8D8",
    carpetInk: "#2A2E29",
  },
  fonts: {
    display: "\"Noto Serif SC\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    text: "\"Noto Serif SC\", \"Songti SC\", \"STSong\", \"Source Han Serif SC\", serif",
    mono: "\"SF Mono\", Menlo, monospace",
  },
});
