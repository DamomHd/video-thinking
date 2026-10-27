/**
 * 工业级拟真应用外壳 (AppShell)
 * 严格遵循 LoomCare §7 DOM 2.5D 规范：
 * 1. 拟真视窗质感：精细交通灯按钮、毛玻璃背景、内阴影高光边框
 * 2. 响应式布局架构：支持顶栏、侧边栏 (Sidebar) 与主视区灵活插槽
 * 3. 完美兼容 2.5D Stage 舞台投影与机身单应性贴合
 */

import React from 'react';

export interface AppShellProps {
  title?: string;
  subtitle?: string;
  width?: number | string;
  height?: number | string;
  sidebar?: React.ReactNode;
  headerRight?: React.ReactNode;
  theme?: 'dark' | 'light';
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const AppShell: React.FC<AppShellProps> = ({
  title = 'Application',
  subtitle,
  width = '100%',
  height = '100%',
  sidebar,
  headerRight,
  theme = 'dark',
  children,
  className,
  style,
}) => {
  const isDark = theme === 'dark';

  const bgColor = isDark ? 'rgba(18, 20, 26, 0.92)' : 'rgba(255, 255, 255, 0.94)';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(0, 0, 0, 0.08)';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const subtitleColor = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)';
  const headerBg = isDark ? 'rgba(24, 26, 32, 0.85)' : 'rgba(248, 249, 250, 0.85)';
  const sidebarBg = isDark ? 'rgba(15, 17, 22, 0.65)' : 'rgba(243, 244, 246, 0.7)';

  return (
    <div
      className={className}
      style={{
        width,
        height,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: bgColor,
        // 内容区的缺省文字色跟主题走：不设的话深色壳里的正文是黑字压黑底
        color: titleColor,
        border: `1px solid ${borderColor}`,
        boxShadow: isDark
          ? '0 24px 70px -12px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.12)'
          : '0 24px 70px -12px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(24px)',
        position: 'relative',
        ...style,
      }}
    >
      {/* 顶部标题栏 (Window Titlebar) */}
      <div
        style={{
          height: 44,
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: headerBg,
          borderBottom: `1px solid ${borderColor}`,
          userSelect: 'none',
        }}
      >
        {/* 左侧交通灯红黄绿控制按钮 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 100 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FF5F56', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#FFBD2E', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#27C93F', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
        </div>

        {/* 视窗居中标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: titleColor, letterSpacing: '-0.01em' }}>
            {title}
          </span>
          {subtitle && (
            <span style={{ fontSize: 11, color: subtitleColor, paddingLeft: 6, borderLeft: `1px solid ${borderColor}` }}>
              {subtitle}
            </span>
          )}
        </div>

        {/* 右侧扩展区 */}
        <div style={{ width: 100, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          {headerRight}
        </div>
      </div>

      {/* 主工作区 (Body Layout) */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
        {/* 可选侧边栏 */}
        {sidebar && (
          <div
            style={{
              width: 220,
              minWidth: 220,
              borderRight: `1px solid ${borderColor}`,
              backgroundColor: sidebarBg,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {sidebar}
          </div>
        )}

        {/* 主视区内容 */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
};
