import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, easeOutExpo, clamp01 } from '../../../shared/anim';

/**
 * S6 行动召唤（45–50s）
 *
 * APP icon 居中放大，产品名 + Slogan + 下载提示：
 *   · 0–1.5s：icon 从小放大、旋转落定
 *   · 1.5–3.5s：产品名 "iDo Space" 浮现
 *   · 3.5–5s：Slogan "理解自己，从记录开始" + App Store / Google Play 图标
 *
 * 背景：深紫 + 粉橙渐变球（品牌色）
 * 镜头：dissolve（溶解）
 */

interface S6CtaProps {
  t: number;
  dur: number;
}

export const S6Cta: React.FC<S6CtaProps> = ({ t }) => {
  const W = 1080;
  const H = 1920;

  // Icon 放大（0–1.5s）
  const iconScale = clamp01(easeOutExpo(t / 1.5));
  const iconRotate = iconScale * 360; // 旋转一圈

  // 产品名显示（1.5–3.5s）
  const nameOpacity = t > 1.5 ? clamp01(easeOutCubic((t - 1.5) / 1)) : 0;
  const nameY = -30 * (1 - nameOpacity);

  // Slogan 显示（3.5–5s）
  const sloganOpacity = t > 3.5 ? clamp01(easeOutCubic((t - 3.5) / 1)) : 0;
  const sloganY = -20 * (1 - sloganOpacity);

  // 下载图标（3.5–5s）
  const downloadOpacity = t > 3.5 ? clamp01((t - 3.5) / 1) : 0;

  // 背景渐变球呼吸
  const breathe = Math.sin(t * 1.2) * 0.05;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: T.colors.bg,
        overflow: 'hidden',
      }}
    >
      {/* 背景渐变球（品牌色） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 45%, ${T.colors.rose}44, ${T.colors.peach}22, transparent 65%)`,
          transform: `scale(${1 + breathe})`,
          opacity: 0.6,
        }}
      />

      {/* APP Icon（圆角方形 + 渐变） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '32%',
          transform: `translate(-50%, -50%) scale(${iconScale}) rotate(${iconRotate}deg)`,
        }}
      >
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: 36,
            background: `linear-gradient(135deg, ${T.colors.rose}, ${T.colors.peach})`,
            boxShadow: T.shadows.glowStrong,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Icon 内容（简化的心形 + i） */}
          <div
            style={{
              fontFamily: T.fonts.display,
              fontSize: 72,
              fontWeight: 700,
              color: '#FFFFFF',
              textShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            i
          </div>
        </div>
      </div>

      {/* 产品名 "iDo Space" */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, calc(-50% + ${nameY}px))`,
          opacity: nameOpacity,
        }}
      >
        <div
          style={{
            fontFamily: T.fonts.display,
            fontSize: 64,
            fontWeight: 700,
            color: T.colors.textPrimary,
            textAlign: 'center',
            letterSpacing: '0.02em',
            textShadow: T.shadows.glowSoft,
          }}
        >
          iDo Space
        </div>
      </div>

      {/* Slogan */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '60%',
          transform: `translate(-50%, calc(-50% + ${sloganY}px))`,
          opacity: sloganOpacity,
        }}
      >
        <div
          style={{
            fontFamily: T.fonts.display,
            fontSize: 38,
            fontWeight: 300,
            color: T.colors.textSecondary,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          理解自己，从记录开始
        </div>
      </div>

      {/* 下载提示（App Store / Google Play 图标） */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 180,
          transform: 'translateX(-50%)',
          opacity: downloadOpacity,
          display: 'flex',
          gap: 32,
        }}
      >
        {/* App Store */}
        <div
          style={{
            padding: '12px 32px',
            borderRadius: 12,
            backgroundColor: T.colors.bgCard,
            border: `1px solid ${T.colors.border}`,
            fontFamily: T.fonts.display,
            fontSize: 24,
            fontWeight: 500,
            color: T.colors.textPrimary,
          }}
        >
          App Store
        </div>

        {/* Google Play */}
        <div
          style={{
            padding: '12px 32px',
            borderRadius: 12,
            backgroundColor: T.colors.bgCard,
            border: `1px solid ${T.colors.border}`,
            fontFamily: T.fonts.display,
            fontSize: 24,
            fontWeight: 500,
            color: T.colors.textPrimary,
          }}
        >
          Google Play
        </div>
      </div>
    </div>
  );
};
