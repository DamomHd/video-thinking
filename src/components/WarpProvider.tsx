/**
 * 工业级时间重映射容器 (WarpProvider)
 * 严格遵循 LoomCare §6.2 镜头复用规范：
 * 预告片通过包装 WarpProvider(knotMap(...)) 复用正片各幕，把正片事件精确重映射到音乐强拍上
 */

import React, { createContext, useContext } from 'react';
import { TimeMapFn } from '../shared/warp';

export interface WarpContextValue {
  time: number;     // 重映射后的内部幕时间
  rawTime: number;  // 外部时间（如预告片时间）
  scale: number;    // 局部变速比率
}

const WarpContext = createContext<WarpContextValue>({
  time: 0,
  rawTime: 0,
  scale: 1,
});

export const useWarpedTime = (): WarpContextValue => useContext(WarpContext);

export interface WarpProviderProps {
  outerTime: number;
  map: TimeMapFn;
  children: React.ReactNode | ((warpedTime: number) => React.ReactNode);
}

export const WarpProvider: React.FC<WarpProviderProps> = ({
  outerTime,
  map,
  children,
}) => {
  const warpedTime = map(outerTime);

  // 数值微分估算瞬时倍速比 (scale = dt_inner / dt_outer)
  const dt = 0.005;
  const tNext = map(outerTime + dt);
  const scale = (tNext - warpedTime) / dt;

  const value: WarpContextValue = {
    time: warpedTime,
    rawTime: outerTime,
    scale,
  };

  return (
    <WarpContext.Provider value={value}>
      {typeof children === 'function' ? children(warpedTime) : children}
    </WarpContext.Provider>
  );
};
