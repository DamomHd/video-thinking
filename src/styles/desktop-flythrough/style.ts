import { defineStyle } from '../types';

/**
 * 桌面穿梭 · Desktop Flythrough（收录自 lemo-opuscar，材质与 3D）
 *
 * 风格的全部约束（材质、配色逻辑、字体用法、动效、镜头、声音、原生手法、坑）在同目录 STYLE.md 原文里；
 * 片子选了这个风格就按 STYLE.md 做。这里只放风格库的现有字段：
 *   colors  参考色板，不是定死的主题色：取自上游样片源码的色板对象和 STYLE.md 写明的色值，不到 3 个时补海报帧主色（poster1…）。
 *           片子用这个风格时，配色由模型按片子的需要、照 STYLE.md「Colour logic」的逻辑自己定（theme.ts），不必照抄这里
 *   fonts   STYLE.md「Type」一节点名的字体 + 系统中文字体兜底（字体文件在样片源码里：vw style demo desktop-flythrough）
 */
export const DESKTOP_FLYTHROUGH = defineStyle({
  id: "desktop-flythrough",
  label: "桌面穿梭 · Desktop Flythrough",
  colors: {
    learningPaper: "#E7E4F3",
    paperDot: "#CBC5E2",
    dotCard: "#FCFBFF",
    cardInk: "#1D1A2E",
    inkMute: "#807A96",
    muteLine: "#E2DFEE",
    lineAccent: "#6B4CE6",
    supportApricot: "#F39A5B",
    apricotSky: "#5FB4E8",
    skyLemon: "#F2C94C",
    lemonRed: "#E2483D",
    redGreen: "#3FA57A",
    greenHaze: "#E8E4E6",
    foodPaper: "#E5E9ED",
    dot: "#C8CFD7",
    card: "#FDFDFC",
    ink: "#20252B",
    mute: "#7F8790",
    line: "#E0E4E8",
    accent: "#E8890C",
    supportTealBlue: "#2F8FB0",
    tealBluePlum: "#8A5A9E",
    plumCream: "#F4E3B5",
    creamRed: "#D23A3A",
    amberGreen: "#3C9C6E",
    haze: "#E6E4E1",
  },
  fonts: {
    display: "\"JetBrains Mono\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    text: "\"Space Grotesk\", \"PingFang SC\", \"Hiragino Sans GB\", \"Source Han Sans SC\", sans-serif",
    mono: "\"DM Mono\", \"SF Mono\", Menlo, monospace",
  },
});
