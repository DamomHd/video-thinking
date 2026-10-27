import React from 'react';
import { interpolate } from 'remotion';
import { EnterTransition } from '../shared/types';

interface EnterWrapperProps {
  type: EnterTransition;
  overlapSec: number;
  localSec: number;
  children: React.ReactNode;
}

/**
 * 幕与幕交叠过渡包装器
 * 在交叠的 overlapSec 秒内使本幕浮现（blur-scale / fade / push-up / ink）
 */
export const EnterWrapper: React.FC<EnterWrapperProps> = ({
  type,
  overlapSec,
  localSec,
  children,
}) => {
  if (type === 'none' || overlapSec <= 0) {
    return <div style={{ width: '100%', height: '100%' }}>{children}</div>;
  }

  const p = Math.max(0, Math.min(1, localSec / overlapSec));

  let opacity = 1;
  let transform = 'none';
  let filter = 'none';

  switch (type) {
    case 'blur-scale': {
      opacity = interpolate(p, [0, 1], [0, 1]);
      const scale = interpolate(p, [0, 1], [1.03, 1.0]);
      const blur = interpolate(p, [0, 1], [14, 0]);
      transform = `scale(${scale})`;
      filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : 'none';
      break;
    }
    case 'fade': {
      opacity = interpolate(p, [0, 1], [0, 1]);
      break;
    }
    case 'push-up': {
      opacity = interpolate(p, [0, 1], [0, 1]);
      const ty = interpolate(p, [0, 1], [40, 0]);
      transform = `translate3d(0, ${ty}px, 0)`;
      break;
    }
    case 'ink': {
      opacity = interpolate(p, [0, 1], [0, 1]);
      filter = `contrast(${interpolate(p, [0, 1], [2, 1])})`;
      break;
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        opacity,
        transform,
        filter,
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    >
      {children}
    </div>
  );
};
