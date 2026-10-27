/**
 * 工业级 2.5D 按钮与光标吸附门道 (ButtonPortal)
 * 严格遵循 LoomCare §7 DOM 2.5D 规范：
 * 自动结合摄影机姿态 (camera)，利用 camProject 将 2.5D 世界中的按钮几何中心投射到屏幕像素坐标，
 * 供 Cursor 实现平滑自动磁吸对齐。
 */

import React, { useMemo } from 'react';
import { CameraState, DEFAULT_CAMERA, camProject } from '../../shared/camera';

export interface ButtonPortalProps {
  worldX: number;
  worldY: number;
  camera?: CameraState;
  stageSize?: [number, number];
  label?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  onScreenPositionChange?: (screenPos: [number, number]) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ButtonPortal: React.FC<ButtonPortalProps> = ({
  worldX,
  worldY,
  camera = DEFAULT_CAMERA,
  stageSize = [1920, 1080],
  label,
  onClick,
  children,
  onScreenPositionChange,
  className,
  style,
}) => {
  // 纯函数计算投射在视口的绝对像素点
  const screenPos = useMemo(() => {
    const pos = camProject(camera, [worldX, worldY], stageSize);
    if (onScreenPositionChange) {
      onScreenPositionChange(pos);
    }
    return pos;
  }, [worldX, worldY, camera, stageSize, onScreenPositionChange]);

  return (
    <div
      className={className}
      data-screen-x={screenPos[0]}
      data-screen-y={screenPos[1]}
      onClick={onClick}
      style={{
        // 按投影点定位：按钮中心落在世界点在屏幕上的位置（父级须是与 stageSize 同尺寸的定位容器）
        position: 'absolute',
        left: screenPos[0],
        top: screenPos[1],
        transform: 'translate(-50%, -50%)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 20px',
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: 600,
        backdropFilter: 'blur(12px)',
        cursor: 'pointer',
        userSelect: 'none',
        ...style,
      }}
    >
      {children || label}
    </div>
  );
};
