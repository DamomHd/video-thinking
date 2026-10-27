import React from 'react';
import { blurFilter, charFocus, FocusOptions, FocusState, rackFocus } from '../../shared/lens';

const focusStyle = (s: FocusState): React.CSSProperties => ({
  opacity: s.opacity,
  filter: blurFilter(s.blurPx),
  transform: s.dy ? `translateY(${s.dy.toFixed(2)}px)` : undefined,
});

/**
 * 逐字从模糊聚焦出来的文字。
 * 每个字是一个 inline-block span，空格换成不换行空格，避免 inline-block 吃掉空白。
 */
export const FocusText: React.FC<{
  text: string;
  t: number;
  from: number;
  spanSec?: number;
  durSec?: number;
  style?: React.CSSProperties;
} & FocusOptions> = ({ text, t, from, spanSec, durSec, blurPx, dyPx, style }) => {
  const chars = Array.from(text);
  return (
    <span style={{ display: 'inline-block', whiteSpace: 'pre', ...style }}>
      {chars.map((ch, i) => (
        <span
          key={i}
          style={{ display: 'inline-block', ...focusStyle(charFocus(i, chars.length, t, from, { spanSec, durSec, blurPx, dyPx })) }}
        >
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
};

/**
 * 同一位置换内容：before 在 at 失焦退场，after 稍后逐字聚焦进来。
 * 两者叠在同一个格子里（grid 叠放），容器尺寸取两者较大的，不会跳版。
 */
export const FocusSwap: React.FC<{
  before: string;
  after: string;
  t: number;
  at: number;
  gapSec?: number;
  style?: React.CSSProperties;
} & FocusOptions> = ({ before, after, t, at, gapSec, blurPx, dyPx, style }) => {
  const r = rackFocus(t, at, { gapSec, blurPx, dyPx });
  const inFrom = at + (gapSec ?? 0.2);
  return (
    <span style={{ display: 'inline-grid', ...style }}>
      <span style={{ gridArea: '1 / 1', ...focusStyle(r.out), visibility: r.out.opacity <= 0.001 ? 'hidden' : 'visible' }}>
        {before}
      </span>
      <span style={{ gridArea: '1 / 1', visibility: t < inFrom ? 'hidden' : 'visible' }}>
        <FocusText text={after} t={t} from={inFrom} blurPx={blurPx} dyPx={dyPx} />
      </span>
    </span>
  );
};
