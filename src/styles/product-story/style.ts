import { defineStyle } from '../types';

/**
 * 暖纸产品叙事 · Warm-paper Product Story（product-story）
 *
 * 从空白开始、技法借自风格 living-screencast（vw style fork）；基准作品 loomcare.mp4。
 * 完整约束在同目录 STYLE.md。色值取自基准作品的画面（主色聚类）：
 *   纸面与界面是中性的；状态色各司其职（荧光笔黄 = 关键那句，命中橙 = 要人看的那一项，通过绿 = 已核验）；
 *   暗场插叙只有金色的光。
 */
export const PRODUCT_STORY = defineStyle({
  id: 'product-story',
  label: "暖纸产品叙事 · Warm-paper Product Story",
  colors: {
    // 纸面与界面
    paper: '#FCFAF9',
    surface: '#FFFFFF',
    line: '#EFEAE5',
    text: '#1B1A18',
    textMid: '#938D88',
    textFaint: '#CBC7C4',
    // 真实感单据
    docPaper: '#E8DDD1',
    docInk: '#2B2621',
    redact: '#111111',
    // 状态（各司其职，一屏最多两种）
    highlight: '#E1C12B',
    hit: '#DF8318',
    hitSoft: '#FBF0E0',
    ok: '#34796F',
    okSoft: '#E5F1EF',
    alert: '#C8473F',
    // 暗场插叙
    stage: '#14110C',
    stageLift: '#241C10',
    gold: '#E7C877',
    goldDim: '#847342',
  },
  fonts: {
    display: '"PingFang SC", "Source Han Sans SC", "Hiragino Sans GB", sans-serif',
    text: '"PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif',
    quote: '"Noto Serif SC", "Songti SC", "STSong", serif',
    mono: '"SF Mono", "JetBrains Mono", Menlo, monospace',
  },
});
