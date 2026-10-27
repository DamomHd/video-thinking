import { defineStyle } from '../types';

/**
 * 图纸 (blueprint)
 *
 * 从 anlan-report 与 us-paper 两部片的 theme.ts 提炼出的共同部分；取值以 anlan-report 为准
 * （它的色值从参考片 迁移汇报.mp4 取样）。片子派生时通常只换 accent 一组颜色。
 * 完整约束见同目录 STYLE.md；README.md、CHANGES.md、refs/（含样片 demo.mp4 = 迁移汇报.mp4）。
 */
export const BLUEPRINT = defineStyle({
  id: 'blueprint',
  label: '图纸 · 工程制图',
  colors: {
    paper: '#F8F6F2',
    paperDeep: '#EFECE6',
    ink: '#0F0F10',

    // 墨线阶梯：制图里线宽和深浅都是语义
    line: 'rgba(24, 22, 20, 0.82)',
    lineMid: 'rgba(24, 22, 20, 0.36)',
    lineThin: 'rgba(24, 22, 20, 0.18)',
    grid: 'rgba(24, 22, 20, 0.07)',
    gridDot: 'rgba(24, 22, 20, 0.16)',

    text: '#161412',
    textMid: 'rgba(22, 20, 18, 0.64)',
    textFaint: 'rgba(22, 20, 18, 0.40)',

    // 强调只有一个色（片子派生时换这一组）
    accent: '#C98A1E',
    accentSoft: '#F7E7BC',
    accentDeep: '#E3AA3C',

    // 状态（极少量）
    ok: '#2F8F5B',
    bad: '#C8473F',
    warn: '#C9762F',

    // 暗场反相
    onInk: '#F2EFEA',
    onInkMid: 'rgba(242, 239, 234, 0.58)',
    onInkFaint: 'rgba(242, 239, 234, 0.26)',
    onInkGrid: 'rgba(242, 239, 234, 0.08)',
  },
  fonts: {
    display: '"PingFang SC", "Hiragino Sans GB", "Source Han Sans SC", -apple-system, sans-serif',
    text: '"PingFang SC", "Hiragino Sans GB", -apple-system, sans-serif',
    mono: '"SF Mono", "JetBrains Mono", Menlo, Monaco, monospace',
  },
  // 工程图纸的图框：四边分区刻度 1–6 / A–D，右下角标题栏（取自 anlan-report 的图框）
  frame: { margin: 42, tickLen: 9, cols: 6, rows: ['A', 'B', 'C', 'D'] },
});

export type BlueprintStyle = typeof BLUEPRINT;
