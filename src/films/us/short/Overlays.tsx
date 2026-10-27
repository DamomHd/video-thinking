import React from 'react';
import { AbsoluteFill } from 'remotion';
import { clamp01, easeOutCubic } from '../../../shared/anim';
import { US_THEME } from '../theme';
import { SEGMENTS, localOf } from './timeline';

/**
 * 短片的二维层 (对标 §6.5 的 Overlays.tsx)
 * 盖在 R3F 世界之上：段落小字 + 织造进度条 + 落版。
 * 纯 DOM，不进后期链，所以文字始终锐利。
 */

export const Overlays: React.FC<{ t: number; weave: number; totalSec: number }> = ({
  t,
  weave,
  totalSec,
}) => {
  const seg = SEGMENTS.find((s) => {
    const a = localOf(s.fromSec);
    const b = localOf(s.toSec);
    return t >= a && t < b;
  });

  const endP = clamp01((t - (totalSec - 3.2)) / 2.0);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* 段落小字 */}
      {seg && (
        <div
          style={{
            position: 'absolute',
            left: 72,
            bottom: 72,
            fontFamily: US_THEME.fonts.mono,
            fontSize: 13,
            letterSpacing: '0.34em',
            color: US_THEME.colors.textMuted,
            opacity: 1 - endP,
          }}
        >
          {seg.label}
        </div>
      )}

      {/* 织造进度条 */}
      <div
        style={{
          position: 'absolute',
          right: 72,
          bottom: 78,
          width: 180,
          height: 1,
          background: 'rgba(255,255,255,0.1)',
          opacity: 1 - endP,
        }}
      >
        <div
          style={{
            width: `${(weave * 100).toFixed(1)}%`,
            height: '100%',
            background: US_THEME.colors.goldCore,
            boxShadow: `0 0 10px ${US_THEME.colors.goldCore}`,
          }}
        />
      </div>

      {/* 落版 */}
      {endP > 0 && (
        <AbsoluteFill
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            opacity: easeOutCubic(endP),
          }}
        >
          <div
            style={{
              fontFamily: US_THEME.fonts.display,
              fontSize: 120,
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: US_THEME.colors.whiteCore,
              textShadow: US_THEME.shadows.glowWhite,
            }}
          >
            US
          </div>
          <div
            style={{
              marginTop: 14,
              fontFamily: US_THEME.fonts.mono,
              fontSize: 13,
              letterSpacing: '0.4em',
              color: US_THEME.colors.goldCore,
            }}
          >
            WOVEN TOGETHER
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
