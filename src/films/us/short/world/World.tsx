import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { CameraRig } from '../../../../components/three/CameraRig';
import { warpThreads, warpPoint, goldTrace, WARP_SEGMENTS } from '../rig';
import { cameraAt } from '../camera';
import { US_THEME } from '../../theme';
import { getInputProps } from 'remotion';

/** 诊断开关走 --props（Remotion 只把 REMOTION_* 前缀的环境变量透传进 bundle，普通 env 到不了浏览器） */
function debugFlag(name: string): boolean {
  try {
    return Boolean((getInputProps() as Record<string, unknown>)?.[name]);
  } catch {
    return false;
  }
}

/**
 * 短片的唯一 R3F 世界 (对标 §6.5「织机世界：只有一个 R3F 世界 world/World.tsx」)
 *
 * 三条确定性纪律：
 *   1. 不用 useFrame —— 时间 t 由外面当 prop 传进来，相机由 CameraRig 摆位
 *   2. 几何全部来自 rig.ts 的纯函数，同样的 (t) 永远长出同一副线
 *   3. 线的材质是自写着色器：顶点色 + 沿线的渐隐，避免用内置材质时每台机器的光照差异
 */

export interface WorldProps {
  /** 片内秒 */
  t: number;
  /** 织造进度 0..1 */
  weave: number;
}

const VERT = /* glsl */ `
  attribute float aU;
  attribute float aGold;
  varying float vU;
  varying float vGold;
  void main() {
    vU = aU;
    vGold = aGold;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uBase;
  uniform vec3 uGold;
  uniform float uWeave;
  uniform float uFront;
  varying float vU;
  varying float vGold;

  void main() {
    // 织造锋面：锋面之后的线淡出，锋面处最亮
    float edge = smoothstep(uFront + 0.02, uFront - 0.10, vU);
    float hot  = smoothstep(uFront - 0.06, uFront, vU) * (1.0 - step(uFront, vU));

    vec3 col = mix(uBase, uGold, clamp(vGold + hot * 0.8, 0.0, 1.0));
    // 448 根线走加法混合，单根稍微亮一点整幅就打爆成白团，所以单根压得很低，
    // 靠数量堆出织物的密度感，而不是靠单根的亮度。
    float a = edge * (0.018 + 0.055 * uWeave) + hot * 0.22;
    if (a < 0.002) discard;
    gl_FragColor = vec4(col, a);
  }
`;

export const World: React.FC<WorldProps> = ({ t, weave }) => {
  const { camera, size } = useThree();
  const pose = React.useMemo(() => cameraAt(t), [t]);

  // 几何逐帧重建（线数固定，采样点固定，所以是确定性的）
  const geometry = React.useMemo(() => {
    const threads = warpThreads();
    const positions = new Float32Array(threads.length * (WARP_SEGMENTS + 1) * 3);
    const us = new Float32Array(threads.length * (WARP_SEGMENTS + 1));
    const golds = new Float32Array(threads.length * (WARP_SEGMENTS + 1));
    const indices: number[] = [];

    let p = 0;
    let v = 0;
    threads.forEach((th, ti) => {
      const gold = goldTrace(th, weave);
      const base = ti * (WARP_SEGMENTS + 1);
      for (let s = 0; s <= WARP_SEGMENTS; s++) {
        const u = s / WARP_SEGMENTS;
        const [x, y, z] = warpPoint(th, u, weave);
        positions[p++] = x;
        positions[p++] = y;
        positions[p++] = z;
        us[v] = u;
        golds[v] = gold;
        v++;
        if (s < WARP_SEGMENTS) indices.push(base + s, base + s + 1);
      }
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aU', new THREE.BufferAttribute(us, 1));
    g.setAttribute('aGold', new THREE.BufferAttribute(golds, 1));
    g.setIndex(indices);
    return g;
  }, [weave]);

  React.useEffect(() => () => geometry.dispose(), [geometry]);

  const uniforms = React.useMemo(
    () => ({
      uBase: { value: new THREE.Color(US_THEME.colors.whiteCore) },
      uGold: { value: new THREE.Color(US_THEME.colors.goldCore) },
      uWeave: { value: weave },
      uFront: { value: Math.min(1, weave * 1.12) },
    }),
    [weave]
  );

  // 诊断用：VW_SHORT_DEBUG=1 时只画一个大亮球，用来确认 R3F 画布本身是否出图
  if (debugFlag('debugSphere')) {
    return (
      <>
        <CameraRig
          camera={camera as THREE.PerspectiveCamera}
          pose={pose}
          aspect={size.width / size.height}
        />
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[2.2, 32, 32]} />
          <meshBasicMaterial color="#FF00FF" />
        </mesh>
      </>
    );
  }

  return (
    <>
      <CameraRig
        camera={camera as THREE.PerspectiveCamera}
        pose={pose}
        aspect={size.width / size.height}
      />

      {/* 两颗核心星：缠绕中心的光源 */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.42 + weave * 0.3, 32, 32]} />
        <meshBasicMaterial
          color={US_THEME.colors.goldLight}
          transparent
          opacity={0.1 + weave * 0.22}
        />
      </mesh>

      {/* 经线 */}
      <lineSegments geometry={geometry}>
        <shaderMaterial
          vertexShader={VERT}
          fragmentShader={FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </>
  );
};
