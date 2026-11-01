import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, clamp01 } from '../../../shared/anim';

/**
 * S1 开场提问（0–5s）
 *
 * 黑底渐亮，问句文字逐行浮现：
 *   行 1："你记录过运动、睡眠、情绪"（1s 显示）
 *   行 2："但你了解自己的亲密状态吗？"（2s 显示，稍大）
 *
 * 镜头：静止
 * 情绪：克制、提问、不评判
 */

interface S1QuestionProps {
  t: number;
  dur: number;
}

export const S1Question: React.FC<S1QuestionProps> = ({ t }) => {
  // 底色从深紫渐亮（0–1s）
  const bgOpacity = clamp01(easeOutCubic(t / 1.0));

  // 第一行文字：1s 显示（0.5–1.5s）
  const line1Progress = clamp01(easeOutCubic((t - 0.5) / 1.0));
  const line1Opacity = line1Progress;
  const line1Y = -20 * (1 - line1Progress); // 上浮 20px

  // 第二行文字：2s 显示（2.0–3.5s）
  const line2Progress = clamp01(easeOutCubic((t - 2.0) / 1.5));
  const line2Opacity = line2Progress;
  const line2Y = -20 * (1 - line2Progress);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: T.colors.bg,
        opacity: bgOpacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
      }}
    >
      {/* 第一行 */}
      <div
        style={{
          fontFamily: T.fonts.display,
          fontSize: 42,
          fontWeight: 300,
          color: T.colors.textSecondary,
          opacity: line1Opacity,
          transform: `translateY(${line1Y}px)`,
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}
      >
        你记录过运动、睡眠、情绪
      </div>

      {/* 第二行（稍大、更亮） */}
      <div
        style={{
          fontFamily: T.fonts.display,
          fontSize: 52,
          fontWeight: 400,
          color: T.colors.textPrimary,
          opacity: line2Opacity,
          transform: `translateY(${line2Y}px)`,
          textAlign: 'center',
          letterSpacing: '0.01em',
          lineHeight: 1.4,
          maxWidth: 800,
        }}
      >
        但你了解自己的<br />亲密状态吗？
      </div>
    </div>
  );
};
