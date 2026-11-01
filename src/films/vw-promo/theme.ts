/**
 * 视频工作台宣传大片 (vw-promo) · 风格主题
 *
 * 遵循 product-story 规范（暖纸产品叙事）：
 *   - 暖白纸面底色 + 极细浅描边卡片 + 深墨黑字
 *   - 荧光笔划过关键词 + 克制的状态胶囊
 *   - 暗场电影感插叙（深暖黑 #14110C + 金色辉光 #E7C877）
 */
export const VW_PROMO_THEME = {
  colors: {
    // 纸面与界面系统
    paper: '#FCFAF9',
    surface: '#FFFFFF',
    surfaceSubtle: '#F7F5F2',
    line: '#EFEAE5',
    lineStrong: '#DDD6CE',

    // 文字阶梯
    text: '#1B1A18',
    textMid: '#736D68',
    textFaint: '#A8A29D',
    textLight: '#CBC7C4',

    // 状态色彩族（严格语义）
    highlight: '#E1C12B',       // 荧光笔黄
    highlightSoft: '#FEF9C3',   // 荧光浅底
    hit: '#DF8318',             // 橙色命中
    hitSoft: '#FBF0E0',
    ok: '#34796F',              // 通过绿
    okSoft: '#E5F1EF',
    warn: '#DC2626',            // 驳回红
    warnSoft: '#FEE2E2',
    codeBg: '#212529',          // 终端深底
    codeText: '#F8F9FA',        // 终端代码白

    // 暗场系统（S3 专用）
    stage: '#14110C',
    stageSurface: '#1F1B15',
    stageLine: '#332D24',
    gold: '#E7C877',
    goldGlow: '#FDE68A',
    goldDim: '#927838',

    // 衍生兼容字段
    rose: '#FF6B9D',
    peach: '#FFA06B',
  },

  fonts: {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    serif: 'Songti SC, Noto Serif SC, Georgia, serif',
  },
} as const;
