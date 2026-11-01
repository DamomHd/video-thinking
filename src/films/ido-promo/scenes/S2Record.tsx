import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, easeInOutCubic, clamp01 } from '../../../shared/anim';
import { Img, staticFile } from 'remotion';

/**
 * S2 记录层（5–13s）
 *
 * 手机截图（日历界面）从底部滑入，悬浮在中央：
 *   · 0–1.5s：手机滑入、背景虚化
 *   · 1.5–6s：停留展示，日历上的点闪烁
 *   · 6–8s：淡出（切到下一幕）
 *
 * 旁白提示："轻点记录，像写日记一样简单"
 *
 * 镜头：静止 → 微推（浅景深）
 * 强调：界面干净、无性暗示
 */

interface S2RecordProps {
  t: number;
  dur: number;
}

export const S2Record: React.FC<S2RecordProps> = ({ t, dur }) => {
  const W = 1080;
  const H = 1920;

  // 手机滑入（0–1.5s，从底部上升）
  const slideProgress = clamp01(easeOutCubic(t / 1.5));
  const phoneY = H * 0.5 * (1 - slideProgress); // 从底部 50% 滑到中心

  // 背景虚化（0–1.5s）
  const bgBlur = slideProgress * 12; // 最大 12px

  // 手机缩放微动（停留时缓慢呼吸）
  const breathe = t > 1.5 ? Math.sin((t - 1.5) * 0.8) * 0.01 : 0;
  const phoneScale = 1 + breathe;

  // 淡出（最后 2s）
  const fadeOut = t > dur - 2 ? clamp01((dur - t) / 2) : 1;

  // 日历点闪烁（3 个点，错开时间）
  const dot1Opacity = 0.8 + Math.sin(t * 2.0) * 0.2;
  const dot2Opacity = 0.8 + Math.sin(t * 2.5 + 1) * 0.2;
  const dot3Opacity = 0.8 + Math.sin(t * 3.0 + 2) * 0.2;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: T.colors.bg,
        overflow: 'hidden',
      }}
    >
      {/* 背景虚化层 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${T.colors.bgMid}, ${T.colors.bg})`,
          filter: `blur(${bgBlur}px)`,
          opacity: fadeOut,
        }}
      />

      {/* 手机截图（真实 UI） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, calc(-50% + ${phoneY}px)) scale(${phoneScale})`,
          opacity: fadeOut,
          filter: 'drop-shadow(0 24px 64px rgba(0,0,0,0.5))',
        }}
      >
        <Img
          src={staticFile('screenshots/zh/01_home.png')}
          style={{
            width: Math.min(T.phone.shotW * 0.85, W * 0.92), // 占屏幕 92%
            height: 'auto',
            borderRadius: T.phone.radius,
          }}
        />

        {/* 日历点闪烁遮罩（示意互动） */}
        {/* 这里暂时用纯色圆点覆盖，实际位置需要精确定位 */}
        <div
          style={{
            position: 'absolute',
            top: '32%',
            left: '28%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: T.colors.rose,
            opacity: dot1Opacity,
            boxShadow: `0 0 16px ${T.colors.rose}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '32%',
            left: '48%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: T.colors.rose,
            opacity: dot2Opacity,
            boxShadow: `0 0 16px ${T.colors.rose}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '32%',
            left: '68%',
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: T.colors.rose,
            opacity: dot3Opacity,
            boxShadow: `0 0 16px ${T.colors.rose}`,
          }}
        />
      </div>

      {/* 旁白文字（底部） */}
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: T.fonts.display,
          fontSize: 38,
          fontWeight: 300,
          color: T.colors.textPrimary,
          opacity: t > 2 && t < dur - 2 ? clamp01((t - 2) / 1) : 0,
          letterSpacing: '0.03em',
        }}
      >
        轻点记录，像写日记一样简单
      </div>
    </div>
  );
};
