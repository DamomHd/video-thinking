import React from 'react';
import { IDO_PROMO_THEME as T } from '../theme';
import { easeOutCubic, easeOutExpo, clamp01 } from '../../../shared/anim';
import { Img, staticFile } from 'remotion';

/**
 * S3 频率图（13–21s）
 *
 * 切到统计页面，柱状图从底部长高：
 *   · 0–1s：硬切到统计界面
 *   · 1–4s：柱子逐个长高（周一到周日）
 *   · 4–8s：停留，数字跳动
 *
 * 旁白："看见自己的节奏和模式"
 *
 * 镜头：硬切 + 静止
 */

interface S3FrequencyProps {
  t: number;
  dur: number;
}

export const S3Frequency: React.FC<S3FrequencyProps> = ({ t, dur }) => {
  const W = 1080;
  const H = 1920;

  // 柱子生长（1–4s，错开 0.2s）
  const bars = [
    { day: '周一', value: 0, delay: 0 },
    { day: '周二', value: 3, delay: 0.2 },
    { day: '周三', value: 1, delay: 0.4 },
    { day: '周四', value: 8, delay: 0.6 },
    { day: '周五', value: 2, delay: 0.8 },
    { day: '周六', value: 0, delay: 1.0 },
    { day: '周日', value: 0, delay: 1.2 },
  ];

  const maxValue = 8;

  // 淡出（最后 2s）
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
          transform: 'translate(-50%, -50%)',
          filter: 'drop-shadow(0 24px 64px rgba(0,0,0,0.4))',
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

        {/* 柱状图动画遮罩（覆盖在截图柱子上） */}
        <div
          style={{
            position: 'absolute',
            top: '42%', // 柱状图区域
            left: '8%',
            right: '8%',
            height: '20%',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-around',
            gap: 8,
          }}
        >
          {bars.map((bar, i) => {
            const growProgress = clamp01(easeOutExpo((t - 1 - bar.delay) / 1.2));
            const barHeight = (bar.value / maxValue) * 100 * growProgress;

            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: `${barHeight}%`,
                  background: `linear-gradient(180deg, ${T.colors.rose}, ${T.colors.peach})`,
                  borderRadius: '8px 8px 0 0',
                  boxShadow: bar.value > 0 ? T.shadows.glowSoft : 'none',
                  opacity: bar.value > 0 ? 1 : 0.2,
                }}
              />
            );
          })}
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
          fontSize: 38,
          fontWeight: 300,
          color: T.colors.textPrimary,
          opacity: t > 2 && t < dur - 2 ? 1 : 0,
          letterSpacing: '0.03em',
        }}
      >
        看见自己的节奏和模式
      </div>
    </div>
  );
};
