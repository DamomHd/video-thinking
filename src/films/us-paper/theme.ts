/**
 * Us「图纸」版设计 Token
 *
 * 这是一套**工程制图**的语言，不是广告片的语言：
 *   暖白纸底 + 细点阵网格 + 四边坐标刻度 + 裁切标记 + 右下角图签栏。
 *
 * 和 Us 主片（深紫夜空）的关系：
 *   主片是产品自己的气质，这一版是「把产品当成一件可以被测量、标注、剖开看的东西」。
 *   两者共用的是**强调色**（蜜桃→玫瑰）—— 底色和骨架完全不同，但一眼还认得出是 Us。
 *
 * 强调色只用一个。参考片用琥珀黄，这里换成 Us 的玫瑰，
 * 因为在暖白纸上玫瑰同样和谐，而且保住了品牌识别。
 */

export const US_PAPER_THEME = {
  colors: {
    /* 纸 */
    paper: '#F5F3EF',
    paperDeep: '#EDEAE4',
    /* 暗场（全片只反转一次，用来放产品真实界面） */
    ink: '#0E0E0F',
    inkDeep: '#070708',

    /* 墨线阶梯 —— 制图里线宽和深浅都是语义 */
    line: 'rgba(24, 22, 20, 0.82)',      // 主轮廓
    lineMid: 'rgba(24, 22, 20, 0.34)',   // 次要结构
    lineThin: 'rgba(24, 22, 20, 0.16)',  // 标注引线
    grid: 'rgba(24, 22, 20, 0.085)',     // 网格
    gridDot: 'rgba(24, 22, 20, 0.16)',   // 网格交点

    /* 字 */
    text: '#171513',
    textMid: 'rgba(23, 21, 19, 0.62)',
    textFaint: 'rgba(23, 21, 19, 0.38)',

    /* 强调：蜜桃 → 玫瑰（和 Us 主片同源） */
    accent: '#FD8FAC',
    accentDeep: '#E4607F',
    accentSoft: '#FDB3A9',

    /* 状态（极少量，只在状态机那类图里出现） */
    ok: '#2F9E6B',
    warn: '#C9762F',

    /* 暗场里的反相 */
    onInk: '#F2EFEA',
    onInkMid: 'rgba(242, 239, 234, 0.58)',
    onInkFaint: 'rgba(242, 239, 234, 0.28)',
    onInkGrid: 'rgba(242, 239, 234, 0.10)',
  },

  fonts: {
    /** 大标题：粗黑体，字距开 */
    display:
      '"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", -apple-system, sans-serif',
    /** 说明文字 */
    text:
      '"PingFang SC", "Hiragino Sans GB", -apple-system, BlinkMacSystemFont, sans-serif',
    /** 图号 / 刻度 / 字段名：等宽 */
    mono: '"SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace',
  },

  /** 图幅：画面四边留给坐标刻度的边距 */
  frame: {
    margin: 42,
    tickLen: 9,
    /** 横向分区数（顶/底标 1…N） */
    cols: 6,
    /** 纵向分区（左/右标 A…D） */
    rows: ['A', 'B', 'C', 'D'] as const,
  },
} as const;

export type UsPaperTheme = typeof US_PAPER_THEME;
