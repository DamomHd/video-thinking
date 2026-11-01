import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, easeInOutCubic, clamp01 } from '../../../shared/anim';
import { Img, staticFile } from 'remotion';

/**
 * S4 时长分布（21–30s）
 *
 * 镜头缓推到"持续时间"卡片，滑块和数字动起来：
 *   · 0–1.5s：从上一幕缓推（glide）到这张卡片
 *   · 1.5–7s：滑块左右移动，数字跳动
 *   · 7–9s：淡出
 *
 * 旁白："数据告诉你，关于自己不曾注意的细节"
 *
 * 镜头：glide（直推）
 */

interface S4DurationProps {
  t: number;
  dur: number;
}

export const S4Duration: React.FC<S4DurationProps> = ({ t, dur }) => {
  const W = 1080;
  const H = 1920;

  // 缓推（0–1.5s，从 1.0 推到 1.15）
  const pushProgress = clamp01(easeInOutCubic(t / 1.5));
  const scale = 1 + pushProgress * 0.15;

  // 滑块位置（1.5–7s，在 20%–65% 之间来回）
  const sliderT = t > 1.5 ? (t - 1.5) * 0.4 : 0;
  const sliderPos = 20 + Math.sin(sliderT) * 22.5 + 22.5; // 20–65%

  // 数字跳动（平均时长 18min）
  const avgMin = Math.floor(15 + Math.sin(t * 2) * 3); // 12–18 min

  // 淡出
  const fadeOut = t > dur - 2 ? clamp01((dur - t) / 2) : 1;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: T.colors.bg,
        overflow: 'hidden',
        opacity: fadeOut,
      }}
    >
      {/* 手机截图（统计界面） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          filter: 'drop-shadow(0 32px 72px rgba(0,0,0,0.5))',
        }}
      >
        <Img
          src={staticFile('screenshots/zh/02_stats.png')}
          style={{
            width: Math.min(T.phone.shotW * 0.85, W * 0.92),
            height: 'auto',
            borderRadius: T.phone.radius,
          }}
        />

        {/* 持续时间卡片高光（示意焦点区域） */}
        <div
          style={{
            position: 'absolute',
            top: '60%',
            left: '5%',
            right: '5%',
            height: '18%',
            borderRadius: 24,
            border: `2px solid ${T.colors.glassHighlight}`,
            boxShadow: `0 0 32px ${T.colors.accentPink}`,
            opacity: t > 1 && t < dur - 2 ? 0.6 : 0,
          }}
        />

        {/* 滑块动画（覆盖在截图滑块上） */}
        <div
          style={{
            position: 'absolute',
            top: '68%',
            left: '10%',
            right: '10%',
            height: 4,
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 2,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: `${sliderPos}%`,
              top: -8,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${T.colors.rose}, ${T.colors.peach})`,
              boxShadow: T.shadows.glowSoft,
              transform: 'translateX(-50%)',
            }}
          />
        </div>

        {/* 平均时长数字（覆盖显示） */}
        <div
          style={{
            position: 'absolute',
            top: '65%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: T.fonts.number,
            fontSize: 64,
            fontWeight: 700,
            color: T.colors.textPrimary,
            opacity: t > 2 && t < dur - 2 ? 1 : 0,
            textShadow: T.shadows.glowSoft,
          }}
        >
          {avgMin}
          <span style={{ fontSize: 42, fontWeight: 400, marginLeft: 4 }}>分钟</span>
        </div>
      </div>

      {/* 旁白文字 */}
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: T.fonts.display,
          fontSize: 36,
          fontWeight: 300,
          color: T.colors.textPrimary,
          opacity: t > 3 && t < dur - 2 ? 1 : 0,
          letterSpacing: '0.03em',
          lineHeight: 1.5,
          padding: '0 80px',
        }}
      >
        数据告诉你<br />关于自己不曾注意的细节
      </div>
    </div>
  );
};
