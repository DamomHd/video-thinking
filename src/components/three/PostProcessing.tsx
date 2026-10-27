/**
 * 工业级三维色调映射与后期管线 (Three.js ACES Filmic ToneMapping Pipeline)
 * 严格遵循 LoomCare §7.2 踩坑记录：
 * "EffectComposer 挂载时会把 gl.toneMapping 设成 NoToneMapping；金色要用 ACES，AgX 会把亮金洗成死白"
 */

import React, { useEffect } from 'react';
import * as THREE from 'three';

export interface ToneMappingOptions {
  exposure?: number;
  toneMapping?: THREE.ToneMapping;
}

/**
 * 纯函数：配置 WebGLRenderer 的色调映射与曝光
 * 强制锁定为 ACESFilmicToneMapping，避免亮部洗成白片
 */
export function setupAcesToneMapping(
  renderer: THREE.WebGLRenderer,
  options: ToneMappingOptions = {}
): void {
  const { exposure = 1.0, toneMapping = THREE.ACESFilmicToneMapping } = options;
  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = exposure;
}

export interface ToneMappingConfigProps {
  renderer: THREE.WebGLRenderer | null;
  exposure?: number;
}

/**
 * React 声明式色调映射锁定组件
 */
export const ToneMappingConfig: React.FC<ToneMappingConfigProps> = ({
  renderer,
  exposure = 1.0,
}) => {
  useEffect(() => {
    if (!renderer) return;
    setupAcesToneMapping(renderer, { exposure });
  }, [renderer, exposure]);

  return null;
};
