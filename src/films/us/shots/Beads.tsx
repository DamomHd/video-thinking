import React from 'react';
import { US_THEME as T } from '../theme';
import { clamp01, createRng } from '../../../shared/anim';

/**
 * 珠子（App 里一条记录 = 一颗珠子）
 *
 * 产品的色彩语言是「颜色由发生的时刻决定」，所以这里颜色不随便取，
 * 而是按一天中的小时映射到 App 的 timePigment：
 *   深夜偏紫、傍晚浅紫、夜晚暖橙。
 */
export function pigmentAt(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 0 && h < 5) return T.colors.beadNight;
  if (h >= 5 && h < 12) return T.colors.beadDusk;
  if (h >= 12 && h < 19) return T.colors.beadWarm;
  return T.colors.beadEvening;
}

export interface BeadProps {
  x: number;
  y: number;
  r: number;
  color: string;
  opacity?: number;
  /** 0–1，光晕强度 */
  glow?: number;
}

/**
 * 单颗珠子：一圈外光晕 + 球体渐变 + 左上高光。
 * 和 App 里的珠子同构 —— 高光永远在左上 45°，这是它的识别特征。
 */
export const Bead: React.FC<BeadProps> = ({ x, y, r, color, opacity = 1, glow = 1 }) => (
  <div
    style={{
      position: 'absolute',
      left: x - r,
      top: y - r,
      width: r * 2,
      height: r * 2,
      borderRadius: '50%',
      opacity,
      background: `radial-gradient(circle at 34% 30%, #FFFFFF 0%, ${color} 42%, rgba(0,0,0,0.42) 100%)`,
      boxShadow: `0 0 ${r * 2.4 * glow}px ${r * 0.8 * glow}px ${color}55`,
    }}
  />
);

/**
 * 一串沿路径流动的珠子。
 * 路径是一条正弦摆动的竖线 —— 和 App「时间之河」的虚线河道同一种形态。
 */
export interface BeadStreamProps {
  /** 本幕秒 */
  t: number;
  /** 画布尺寸 */
  width: number;
  height: number;
  /** 珠子数量 */
  count?: number;
  /** 河道中心 x */
  centerX: number;
  /** 摆动幅度 */
  amp?: number;
  /** 流速（px/s） */
  speed?: number;
  opacity?: number;
  seed?: number;
}

export const BeadStream: React.FC<BeadStreamProps> = ({
  t,
  width,
  height,
  count = 14,
  centerX,
  amp = 120,
  speed = 46,
  opacity = 1,
  seed = 7,
}) => {
  const rng = createRng(seed);
  const beads = React.useMemo(() => {
    const out: { phase: number; r: number; hour: number; side: number }[] = [];
    for (let i = 0; i < count; i++) {
      out.push({
        // 相位均匀铺开再加一点抖动：纯随机会让珠子扎堆成一柱
        phase: (i + rng() * 0.6) / count,
        r: 9 + rng() * 13,
        hour: Math.floor(rng() * 24),
        side: rng() > 0.5 ? 1 : -1,
      });
    }
    return out;
    // createRng 是确定性的，count/seed 不变时结果逐帧一致
  }, [count, seed]);

  return (
    <>
      {beads.map((b, i) => {
        // 从下往上流（和 App 里时间轴向上回溯一致）
        const travel = (b.phase + (t * speed) / (height + 300)) % 1;
        const y = height + 120 - travel * (height + 240);
        /**
         * 波形必须和 RiverLine 用**同一个**式子 —— 之前这里多了个 b.phase 的相位偏移，
         * 每颗珠子各走各的曲线，结果是珠子聚成一柱、河线在旁边自己飘。
         */
        const wave = Math.sin((y / height) * Math.PI * 2.2) * amp;
        // 进出场各淡化 12%
        const edge = clamp01(Math.min(travel, 1 - travel) / 0.12);
        return (
          <Bead
            key={i}
            x={centerX + wave + b.side * 18}
            y={y}
            r={b.r}
            color={pigmentAt(b.hour)}
            opacity={edge * opacity}
            glow={0.9}
          />
        );
      })}
    </>
  );
};

/**
 * 河道虚线：App 里串起所有记录的那条线。
 * 用 SVG 画，dash 偏移随时间走，形成缓慢流动感。
 */
export const RiverLine: React.FC<{
  t: number;
  width: number;
  height: number;
  centerX: number;
  amp?: number;
  opacity?: number;
}> = ({ t, width, height, centerX, amp = 120, opacity = 1 }) => {
  const pts: string[] = [];
  for (let y = -40; y <= height + 40; y += 16) {
    const wave = Math.sin((y / height) * Math.PI * 2.2) * amp;
    pts.push(`${centerX + wave},${y}`);
  }
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, opacity }}
    >
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={T.colors.river}
        strokeWidth={2}
        strokeDasharray="10 14"
        strokeDashoffset={-t * 26}
        strokeLinecap="round"
      />
    </svg>
  );
};
