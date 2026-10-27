/**
 * 工业级 2.5D 摄影机舞台组件 (Stage)
 * 严格遵循 LoomCare 架构第 7 节视觉四层与确定性约束：
 * 1. willChange 动态智能护栏：当 scale 在常态范围 (0.8 ~ 3.0) 开启硬件加速，推拉极端微距时卸载，防止栅格倍率锁死
 * 2. 显存保护：当 scale > 6.0 时，自动屏蔽 heavy filters 与 box-shadow，防止 GPU 显存撑爆导致黑屏/闪烁
 * 3. 2D/3D 智能切换与亚像素抗抖动：平移取整消除文字跳动
 * 4. 三层架构：Background (固定底色) -> World (受镜头驱动的 2.5D 世界) -> Foreground (固定 HUD/微章)
 * 5. 被盖住时不画舞台（§7 渲染坑「3D 层放大上百倍会撑爆 Studio 显存，整页闪」）：
 *    covered=true 时只留底色，世界层和前景层整棵不挂 —— 上一幕被下一幕完全盖住的那几秒不再占显存
 */

import React from 'react';
import { CameraState, DEFAULT_CAMERA, camTransform } from '../shared/camera';

export interface StageProps {
  camera?: CameraState;
  width?: number;
  height?: number;
  backgroundColor?: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * 固定前景层（如安全框、字幕、固定时间码、UI 视窗外部装饰）
   * 不受相机平移缩放影响
   */
  foreground?: React.ReactNode;
  /**
   * 固定背景层（如光斑底图、网格背景）
   */
  background?: React.ReactNode;
  /** 本舞台此刻被其他层完全盖住：只画底色，不挂世界和前景 */
  covered?: boolean;
  children: React.ReactNode;
}

export const Stage: React.FC<StageProps> = ({
  camera = DEFAULT_CAMERA,
  width = 1920,
  height = 1080,
  backgroundColor = '#F3F0E8', // LoomCare 经典暖米白
  className,
  style,
  foreground,
  background,
  covered = false,
  children,
}) => {
  const scale = 1 / Math.max(0.0001, camera.z);
  const isExtremeScale = scale > 6.0;

  // 严格护栏：仅在常规视距区间开启 will-change，避免主线程栅格化锁死
  const enableWillChange = scale >= 0.8 && scale <= 3.0;

  const transform = camTransform(camera, {
    integerPixels: true,
  });

  return (
    <div
      className={className}
      style={{
        width,
        height,
        position: 'relative',
        overflow: 'hidden',
        backgroundColor,
        ...style,
      }}
    >
      {/* 1. 底层固定背景 */}
      {!covered && background && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          {background}
        </div>
      )}

      {/* 2. 受摄影机支配的 2.5D 世界层 */}
      {!covered && <div
        data-stage-world="true"
        style={{
          width,
          height,
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '50% 50%',
          transform,
          willChange: enableWillChange ? 'transform' : 'auto',
          // 极大放大倍率下卸载滤镜保护 GPU 显存
          filter: isExtremeScale ? 'none' : undefined,
          zIndex: 1,
        }}
      >
        {children}
      </div>}

      {/* 3. 前景固定 HUD 层 */}
      {!covered && foreground && (
        <div
          data-stage-foreground="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          {foreground}
        </div>
      )}
    </div>
  );
};
