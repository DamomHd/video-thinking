/**
 * 确定性拟真纸张纤维贴图发生器 (Deterministic Paper Texture)
 * 严格遵循 LoomCare §7 规范：
 * 纯数学生成温润纸张纤维噪波，零外部静态图片依赖，确保并发渲染一致性
 */

import * as THREE from 'three';
import { createRng } from '../../shared/anim';

export function createPaperTexture(width = 1024, height = 1024, seed = 42): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // 1. 底色：LoomCare 经典暖米白
  ctx.fillStyle = '#F4F1EA';
  ctx.fillRect(0, 0, width, height);

  // 2. 确定性纤维噪波
  const rng = createRng(seed);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    const grain = (rng() - 0.5) * 14;
    data[i] = Math.max(0, Math.min(255, data[i] + grain));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}
