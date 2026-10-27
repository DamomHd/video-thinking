/**
 * Us 宣传片设计 Token
 *
 * 全部取自 App 真实界面的取色（screenshots/zh/*.png），不是另起一套：
 *   深空底   #0C0A1B → #100E25 → #261A3D（紫调夜空，越往下越偏紫红）
 *   卡片     #221D2E
 *   珠子     紫 #8475A4 / 暖橙 #B8674F —— 颜色由「发生的时刻」决定，这是产品的色彩语言
 *   主渐变   蜜桃 #FDB3A9 → 玫瑰 #FD8FAC（周/月/年切换、强调按钮都是这条）
 *   文字白   #EFEAFF（带一点薰衣草，不是纯白）
 *
 * 片子不另造配色，是因为社媒上用户先看到片子、再看到 App 截图，
 * 两者对不上会觉得是两个产品。
 */

export const US_THEME = {
  colors: {
    // 深空底（取自时间之河页）
    bg: '#0C0A1B',
    bgDeep: '#07060F',
    bgMid: '#100E25',
    bgWarm: '#261A3D',
    bgCard: 'rgba(34, 29, 46, 0.82)',
    bgCardSolid: '#221D2E',

    border: 'rgba(239, 234, 255, 0.10)',
    borderSubtle: 'rgba(239, 234, 255, 0.05)',

    // 文字阶梯（带薰衣草调的白）
    textPrimary: '#EFEAFF',
    textSecondary: 'rgba(239, 234, 255, 0.76)',
    textMuted: 'rgba(239, 234, 255, 0.44)',
    textFaint: 'rgba(239, 234, 255, 0.20)',

    // 主渐变：蜜桃 → 玫瑰
    peach: '#FDB3A9',
    rose: '#FD8FAC',

    // 珠子：颜色 = 发生的时刻（产品的 timePigment）
    beadNight: '#8475A4',   // 深夜 · 紫
    beadDusk: '#9789B6',    // 傍晚 · 浅紫
    beadEvening: '#B8674F', // 夜晚 · 暖橙
    beadWarm: '#D4683C',    // 暖橙高饱和

    // 河线
    river: 'rgba(239, 234, 255, 0.28)',

    /**
     * 衍生片（预告片 / 短片）沿用的旧键名，映射到新色板。
     * 主片换成 App 真实配色后这些名字已经不准确（不再是金色），
     * 但衍生片是独立交付物，不在这次改动范围内 —— 留别名让它们继续编译，
     * 等衍生片重做时一起清掉。
     */
    goldCore: '#FDB3A9',
    goldLight: '#FDE3DC',
    whiteCore: '#EFEAFF',
  },

  shadows: {
    glowSoft: '0 0 40px rgba(132, 117, 164, 0.28)',
    glowStrong: '0 0 72px rgba(253, 143, 172, 0.38)',
    card: '0 24px 60px rgba(7, 6, 15, 0.7)',
    glowWhite: '0 0 34px rgba(239, 234, 255, 0.55)',
  },

  fonts: {
    display:
      '"PingFang SC", "Hiragino Sans GB", -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
    serif: '"Songti SC", "Noto Serif SC", Georgia, serif',
    mono: '"SF Mono", "JetBrains Mono", Menlo, Monaco, monospace',
  },

  /** 手机框：16:9 画幅里竖屏手机的呈现尺寸 */
  phone: {
    /** 截图原始尺寸 */
    shotW: 1320,
    shotH: 2868,
    /** 片中显示高度（1080 画布里占 76%） */
    displayH: 820,
    radius: 54,
  },
} as const;

export type UsTheme = typeof US_THEME;
