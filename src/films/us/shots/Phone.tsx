import React from 'react';
import { staticFile, Img } from 'remotion';
import { US_THEME as T } from '../theme';
import { clamp01, easeInOutCubic } from '../../../shared/anim';

/**
 * 手机框 + 真实截图
 *
 * 截图是 1320×2868 的整屏真机截屏，所以机身**永远按这个比例整屏显示**，
 * 不做纵向滚动 —— 截图里没有屏幕之外的内容，滚上去下面只会露出黑底（实测踩过）。
 * 要表达「翻过去看」就换一张截图（见 PhoneSwap），不要假装在滚。
 *
 * 机身只画圆角描边和辉光：截图自带状态栏和灵动岛，再画一层必然错位。
 */
export interface PhoneProps {
  /** public/app-shots/ 下的文件名 */
  shot: string;
  /** 机身显示高度（px） */
  height?: number;
  opacity?: number;
  /** 机身辉光强度 0–1 */
  glow?: number;
  /** 缓慢推近（Ken Burns）：0 = 不推，1 = 推到 +4% */
  push?: number;
  children?: React.ReactNode;
}

export function phoneWidth(height: number): number {
  return (height * T.phone.shotW) / T.phone.shotH;
}

export const Phone: React.FC<PhoneProps> = ({
  shot,
  height = T.phone.displayH,
  opacity = 1,
  glow = 1,
  push = 0,
  children,
}) => {
  const w = phoneWidth(height);
  const radius = T.phone.radius * (height / T.phone.displayH);
  // 推近只在**图片**上做，机身尺寸不变 —— 机身跟着缩放会穿帮
  const zoom = 1 + clamp01(push) * 0.04;

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        opacity,
        /* 辉光取紫调：底色是紫夜空，中性黑辉光会让机身像贴上去的 */
        boxShadow:
          `0 0 ${60 * glow}px ${18 * glow}px rgba(132, 117, 164, ${0.22 * glow}), ` +
          `0 ${28 * glow}px ${70 * glow}px rgba(7, 6, 15, 0.75), ` +
          `inset 0 0 0 1.5px rgba(239, 234, 255, 0.14)`,
        backgroundColor: T.colors.bgDeep,
      }}
    >
      <Img
        src={staticFile(`app-shots/${shot}`)}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: w,
          height,
          transform: `translate(-50%, -50%) scale(${zoom})`,
          display: 'block',
        }}
      />
      {children}
    </div>
  );
};

/**
 * 换屏：两张截图交叉淡化，表达「在 App 里翻到下一页」。
 * progress 0 → 只有 a，1 → 只有 b。
 */
export const PhoneSwap: React.FC<{
  a: string;
  b: string;
  progress: number;
  height?: number;
  opacity?: number;
  glow?: number;
  push?: number;
  children?: React.ReactNode;
}> = ({ a, b, progress, height = T.phone.displayH, opacity = 1, glow = 1, push = 0, children }) => {
  const p = easeInOutCubic(clamp01(progress));
  const w = phoneWidth(height);
  const radius = T.phone.radius * (height / T.phone.displayH);
  const zoom = 1 + clamp01(push) * 0.04;

  const img = (src: string, o: number, dy: number): React.ReactNode => (
    <Img
      src={staticFile(`app-shots/${src}`)}
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: w,
        height,
        opacity: o,
        transform: `translate(-50%, -50%) translateY(${dy}px) scale(${zoom})`,
        display: 'block',
      }}
    />
  );

  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        opacity,
        boxShadow:
          `0 0 ${60 * glow}px ${18 * glow}px rgba(132, 117, 164, ${0.22 * glow}), ` +
          `0 ${28 * glow}px ${70 * glow}px rgba(7, 6, 15, 0.75), ` +
          `inset 0 0 0 1.5px rgba(239, 234, 255, 0.14)`,
        backgroundColor: T.colors.bgDeep,
      }}
    >
      {/* 旧屏往上退一点，新屏从下方浮上来 —— 和 iOS 推入的方向一致 */}
      {img(a, 1 - p, -p * 26)}
      {img(b, p, (1 - p) * 26)}
      {children}
    </div>
  );
};

/**
 * 屏幕上的高亮框：把视线钉在某个功能区域。
 * 坐标用**截图原图**的像素，内部换算成显示尺寸 —— 标注可以照着截图直接量。
 */
export interface HighlightProps {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 机身显示高度，用来算缩放比 */
  phoneH?: number;
  progress: number;
  color?: string;
  radius?: number;
}

export const ScreenHighlight: React.FC<HighlightProps> = ({
  x,
  y,
  w,
  h,
  phoneH = T.phone.displayH,
  progress,
  color = T.colors.rose,
  radius = 36,
}) => {
  const k = phoneH / T.phone.shotH;
  if (progress <= 0.001) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x * k,
        top: y * k,
        width: w * k,
        height: h * k,
        borderRadius: radius * k,
        border: `2px solid ${color}`,
        boxShadow: `0 0 ${26 * progress}px ${color}`,
        opacity: progress,
        transform: `scale(${1 + (1 - progress) * 0.05})`,
      }}
    />
  );
};
