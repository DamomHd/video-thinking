/**
 * 体积光叠加层（architecture.html §8「Remotion → Blender → Remotion」的出口）
 *
 * vw blender rays 把剪影合成渲成序列、交给 Blender 合成器出光束，写清单 rays-<合成>.json。
 * 这里按当前帧号取 NNNN.png，用 screen 叠在画面上 —— 黑的地方不影响底图，亮的地方加光。
 *
 * 降级：清单 complete=false 或帧号越界时什么都不画（没有光，但画面不会坏）。
 * 帧号和剪影合成逐帧对应：叠加处的 Sequence 起点要和剪影合成的第 0 帧对齐。
 */

import React from 'react';
import { Img, staticFile, useCurrentFrame } from 'remotion';

export interface RaysManifestLike {
  complete: boolean;
  frames: number;
  dir: string;
}

export const RaysOverlay: React.FC<{
  manifest: RaysManifestLike;
  opacity?: number;
  /** 帧号偏移（剪影合成比叠加处早开始时用） */
  offset?: number;
}> = ({ manifest, opacity = 1, offset = 0 }) => {
  const frame = useCurrentFrame() + offset;
  if (!manifest.complete || frame < 0 || frame >= manifest.frames || opacity <= 0) return null;
  return (
    <Img
      src={staticFile(`${manifest.dir}/${String(frame).padStart(4, '0')}.png`)}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        mixBlendMode: 'screen',
        opacity,
        pointerEvents: 'none',
      }}
    />
  );
};
