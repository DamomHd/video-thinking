/**
 * 工业级 3D 拟物展开纸张组件 (PaperSheet)
 * 严格遵循 LoomCare §7 Three.js 视觉层规范：
 * 纯几何顶点变换实现对角/中轴翻折与平滑展开，结合纸张漫反射材质呈现电影级纸张翻开质感
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { clamp01, easeOutCubic } from '../../shared/anim';

export interface PaperSheetProps {
  width?: number;
  height?: number;
  /**
   * 展开进度 0 (卷曲/折叠状态) -> 1 (完全展平)
   */
  unfoldProgress?: number;
  texture?: THREE.Texture | null;
  color?: string;
}

/**
 * 纯函数：根据展开进度更新网格顶点的折叠曲率
 */
export function bendPaperGeometry(
  geo: THREE.PlaneGeometry,
  unfoldProgress: number,
  maxCurlRad = Math.PI * 0.45
): void {
  const p = clamp01(unfoldProgress);
  const curl = (1 - easeOutCubic(p)) * maxCurlRad;

  const pos = geo.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 原始 X 坐标决定弯曲曲率
    if (curl > 0.001) {
      // 卷到半径 R 的圆柱面上：弧长 = 原始 x，所以 θ = x / R、x' = R·sinθ、z' = R·(1 − cosθ)。
      // （旧写法 z = sinθ·常数 与 x 近似成正比，整张纸只是被斜切成一个倾斜平面，看不出卷曲）
      const radius = (geo.parameters.width || 1) / curl;
      const angle = v.x / radius;
      v.x = Math.sin(angle) * radius;
      v.z = (1 - Math.cos(angle)) * radius;
    } else {
      v.z = 0;
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

/**
 * 纯函数：根据参数创建带有纸张折叠曲率的 Three.js Mesh
 */
export function createPaperMesh(
  width = 600,
  height = 800,
  unfoldProgress = 1.0,
  texture: THREE.Texture | null = null,
  color = '#F4F1EA'
): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, height, 32, 32);
  bendPaperGeometry(geo, unfoldProgress);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    map: texture,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export const PaperSheet: React.FC<PaperSheetProps> = ({
  width = 600,
  height = 800,
  unfoldProgress = 1.0,
  texture = null,
  color = '#F4F1EA',
}) => {
  const mesh = useMemo(() => {
    return createPaperMesh(width, height, unfoldProgress, texture, color);
  }, [width, height, unfoldProgress, texture, color]);

  // 使用 React.createElement 兼容不同 React/R3F 版本的 JSX 类型声明
  return React.createElement('primitive', { object: mesh });
};

export interface PaperCanvasProps {
  width?: number;
  height?: number;
  unfoldProgress?: number;
  rotation?: number;
  color?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * 确定性 3D 纸张画布组件：自闭环 WebGL 离线渲染，零 R3F 依赖，纯函数渲染
 */
export const PaperCanvas: React.FC<PaperCanvasProps> = ({
  width = 440,
  height = 440,
  unfoldProgress = 1.0,
  rotation = 0,
  color = '#F4F1EA',
  className,
  style,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(1);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.set(0, 0, 700);
    camera.lookAt(0, 0, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(150, 250, 400);
    scene.add(dirLight);

    const mesh = createPaperMesh(280, 360, unfoldProgress, null, color);
    mesh.rotation.y = rotation;
    mesh.rotation.x = 0.2;
    scene.add(mesh);

    renderer.render(scene, camera);

    return () => {
      renderer.dispose();
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    };
  }, [width, height, unfoldProgress, rotation, color]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ width, height, ...style }}
    />
  );
};
