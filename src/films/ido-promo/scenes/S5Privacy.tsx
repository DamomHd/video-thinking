import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, easeOutExpo, easeInOutCubic, clamp01 } from '../../../shared/anim';

/**
 * S5 隐私层（30–45s，15 秒）
 *
 * 这是最重要的一幕：打消用户对隐私的顾虑。
 *
 * 分三个小节：
 *   · 0–4s：锁图标从小放大，旋转落定
 *   · 4–9s："本地存储"四个字逐字浮现
 *   · 9–15s：Face ID 解锁动画 + "你的数据，只属于你"
 *
 * 背景：深紫 + 光晕（安全感）
 * 镜头：fade in
 */

interface S5PrivacyProps {
  t: number;
  dur: number;
}

export const S5Privacy: React.FC<S5PrivacyProps> = ({ t, dur }) => {
  const W = 1080;
  const H = 1920;

  // 锁图标动画（0–4s）
  const lockScale = t < 4 ? easeOutExpo(t / 4) * 1.5 : 1.5;
  const lockRotate = t < 4 ? easeOutCubic(t / 4) * 15 : 15; // 旋转 15 度后归 0
  const lockFinalRotate = t > 4 ? easeOutCubic((t - 4) / 0.5) * -15 : 0;

  // "本地存储"逐字显示（4–9s，每个字延迟 0.8s）
  const words = ['本', '地', '存', '储'];
  const wordOpacity = (index: number) => {
    const delay = 4 + index * 0.8;
    return t > delay ? clamp01(easeOutCubic((t - delay) / 0.6)) : 0;
  };

  // Face ID 圆环动画（9–15s）
  const faceIdProgress = t > 9 ? clamp01(easeInOutCubic((t - 9) / 2)) : 0;
  const faceIdScale = 0.8 + faceIdProgress * 0.2;
  const faceIdOpacity = faceIdProgress;

  // 底部文字（11–15s）
  const bottomTextOpacity = t > 11 ? clamp01((t - 11) / 1) : 0;

  // 背景光晕呼吸
  const glowPulse = 0.6 + Math.sin(t * 0.8) * 0.2;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: T.colors.bg,
        overflow: 'hidden',
      }}
    >
      {/* 背景光晕（安全感 + 紫色） */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 40%, ${T.colors.accentPurple}33, transparent 60%)`,
          opacity: glowPulse,
        }}
      />

      {/* 锁图标 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '35%',
          transform: `translate(-50%, -50%) scale(${lockScale}) rotate(${lockRotate + lockFinalRotate}deg)`,
        }}
      >
        <LockIcon size={120} color={T.colors.textPrimary} />
      </div>

      {/* "本地存储"逐字显示 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          display: 'flex',
          gap: 24,
        }}
      >
        {words.map((word, i) => (
          <div
            key={i}
            style={{
              fontFamily: T.fonts.display,
              fontSize: 72,
              fontWeight: 600,
              color: T.colors.textPrimary,
              opacity: wordOpacity(i),
              transform: `translateY(${20 * (1 - wordOpacity(i))}px)`,
              textShadow: T.shadows.glowSoft,
            }}
          >
            {word}
          </div>
        ))}
      </div>

      {/* Face ID 圆环 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '64%',
          transform: `translate(-50%, -50%) scale(${faceIdScale})`,
          opacity: faceIdOpacity,
        }}
      >
        <FaceIdIcon size={100} color={T.colors.accentPink} progress={faceIdProgress} />
      </div>

      {/* 底部文字："你的数据，只属于你" */}
      <div
        style={{
          position: 'absolute',
          bottom: 200,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: T.fonts.display,
          fontSize: 42,
          fontWeight: 300,
          color: T.colors.textPrimary,
          opacity: bottomTextOpacity,
          letterSpacing: '0.04em',
          lineHeight: 1.6,
        }}
      >
        你的数据<br />只属于你
      </div>
    </div>
  );
};

/** 锁图标（SVG） */
const LockIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <rect x="5" y="11" width="14" height="11" rx="2" stroke={color} strokeWidth="2" />
    <path
      d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    />
    <circle cx="12" cy="16" r="1.5" fill={color} />
  </svg>
);

/** Face ID 圆环（动画进度） */
const FaceIdIcon: React.FC<{ size: number; color: string; progress: number }> = ({
  size,
  color,
  progress,
}) => {
  const dashArray = 2 * Math.PI * 40; // 圆周长
  const dashOffset = dashArray * (1 - progress);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle
        cx="50"
        cy="50"
        r="40"
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      {/* 人脸轮廓（简化） */}
      <ellipse cx="50" cy="50" rx="20" ry="26" stroke={color} strokeWidth="2" fill="none" />
      <circle cx="43" cy="46" r="2" fill={color} />
      <circle cx="57" cy="46" r="2" fill={color} />
      <path d="M 44 58 Q 50 62 56 58" stroke={color} strokeWidth="2" fill="none" />
    </svg>
  );
};
