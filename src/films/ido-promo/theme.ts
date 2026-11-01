/**
 * iDo Space 宣传片设计 Token
 *
 * 全部取自 App 真实界面（screenshots/zh/*.png）：
 *   深紫底   #1A1A2E（主背景）→ #16213E（卡片）→ #0F1624（最深）
 *   渐变球   粉橙渐变 #FF6B9D → #FFA06B
 *   玻璃态   半透明毛玻璃 + 边缘高光
 *   文字白   #FFFFFF（纯白）/ #B0B0B0（次要文字）
 *
 * 片子不另造配色，社媒用户先看片再看 App 截图，两者要一致。
 */

export const IDO_PROMO_THEME = {
  colors: {
    // 深紫底（取自 APP 主界面）
    bg: '#1A1A2E',
    bgDeep: '#0F1624',
    bgMid: '#16213E',
    bgCard: 'rgba(22, 33, 62, 0.75)',
    bgCardSolid: '#16213E',

    border: 'rgba(255, 255, 255, 0.15)',
    borderSubtle: 'rgba(255, 255, 255, 0.08)',

    // 文字阶梯
    textPrimary: '#FFFFFF',
    textSecondary: 'rgba(255, 255, 255, 0.7)',
    textMuted: 'rgba(255, 255, 255, 0.45)',
    textFaint: 'rgba(255, 255, 255, 0.2)',

    // 主渐变：粉橙
    pink: '#FF6B9D',
    orange: '#FFA06B',
    rose: '#FF6B9D',
    peach: '#FFA06B',

    // 强调色（用于数据可视化）
    accentPink: '#FF6B9D',
    accentPurple: '#8B7CFF',

    // 玻璃高光
    glassHighlight: 'rgba(255, 255, 255, 0.2)',
    glassShadow: 'rgba(0, 0, 0, 0.3)',
  },

  shadows: {
    glowSoft: '0 0 32px rgba(255, 107, 157, 0.25)',
    glowStrong: '0 0 64px rgba(255, 107, 157, 0.45)',
    card: '0 8px 32px rgba(0, 0, 0, 0.4)',
    glass: '0 8px 32px rgba(0, 0, 0, 0.3)',
  },

  fonts: {
    // SF Pro Rounded（iOS 风格）→ Inter Rounded 替代
    display: '"Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif',
    // 数字用 Inter Tight
    number: '"Inter Tight", -apple-system, "SF Pro Display", sans-serif',
    mono: '"JetBrains Mono", "SF Mono", Menlo, Monaco, monospace',
  },

  /** 手机截图尺寸（竖屏 1080×1920 画布直接用） */
  phone: {
    /** 截图原始尺寸 */
    shotW: 1320,
    shotH: 2868,
    /** 竖屏片全屏显示 */
    displayH: 1920,
    radius: 48,
  },
} as const;

export type IdoPromoTheme = typeof IDO_PROMO_THEME;
