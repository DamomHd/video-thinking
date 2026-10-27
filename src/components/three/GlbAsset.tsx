/**
 * Blender 导出的 glb 资产（architecture.html §8「出资产给 three」的消费端）
 *
 * - 加载挂 delayRender：模型没到位不出帧（§7 第 4 条）
 * - 同一个 url 全局只解析一次；每个实例 clone 一份场景图，多处摆放互不影响
 * - 尺寸不手抄：配套的 src/assets/models/<名>.json（vw blender glb 写出）给包围盒，按它布局
 */

import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { useThree } from '@react-three/fiber';
import { continueRender, delayRender, staticFile } from 'remotion';

const cache = new Map<string, Promise<THREE.Group>>();

function loadGlb(url: string): Promise<THREE.Group> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => g.scene);
    cache.set(url, p);
  }
  return p;
}

export interface GlbAssetProps {
  /** 相对 public/ 的路径，如 'models/phone.glb' */
  src: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  /** 拿到 clone 出来的场景图后改材质 / 藏子物体等（只在加载完成时调用一次） */
  onLoad?: (scene: THREE.Group) => void;
}

export const GlbAsset: React.FC<GlbAssetProps> = ({ src, position, rotation, scale, onLoad }) => {
  const url = staticFile(src);
  const [handle] = useState(() => delayRender(`glb ${src}`));
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    loadGlb(url)
      .then((g) => {
        if (!alive) return;
        const c = g.clone(true);
        onLoad?.(c);
        setScene(c);
      })
      .catch((e) => {
        console.error(`[GlbAsset] 加载失败 ${src}:`, e);
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // onLoad 只在首次加载时生效，不随渲染变化重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, handle]);

  // ThreeCanvas 不自己跑帧循环：模型挂进场景后要手动画一帧再放锁，
  // 否则截到的是「加载完、还没画」的空画面。放锁只有这一个出口（加载失败也走这里，不会死锁）；
  // 时间戳给常数：帧画面不能依赖墙钟
  const advance = useThree((st) => st.advance);
  useEffect(() => {
    if (!scene && !failed) return;
    if (scene) advance(0);
    continueRender(handle);
  }, [scene, failed, advance, handle]);

  const s = useMemo<[number, number, number] | undefined>(
    () => (scale === undefined ? undefined : typeof scale === 'number' ? [scale, scale, scale] : scale),
    [scale]
  );

  if (!scene) return null;
  return <primitive object={scene} position={position} rotation={rotation} scale={s} />;
};
