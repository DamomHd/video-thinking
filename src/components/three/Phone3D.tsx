/**
 * three.js 机身（architecture.html §8「出口」的降级路径）
 *
 * Blender 帧序列签名对不上时，PhoneShot 退回到这里：机身按同一组 PhonePose / CameraPose 在 three 里实时渲，
 * DOM 屏幕仍按 projectScreenCorners 的四角贴合 —— 机身和屏幕用的是同一台相机、同一份几何，永不错位。
 *
 * 几何按机身规格（mm）建：圆角矩形挤出 + 倒角边框，前面板黑玻璃，屏幕区是哑黑（被 DOM 屏幕盖住）。
 * 规格从外面传进来（各片的 three/phoneGeo.ts），组件本身不绑定某部片。
 */

import React, { useMemo } from 'react';
import * as THREE from 'three';

export interface PhoneSpecs {
  width: number;
  height: number;
  depth: number;
  radius: number;
  screenWidth: number;
  screenHeight: number;
  screenOffsetZ: number;
}

export interface Phone3DPose {
  pos: [number, number, number];
  rot: [number, number, number];
  scale: [number, number, number];
}

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export const Phone3D: React.FC<{
  specs: PhoneSpecs;
  pose: Phone3DPose;
  /** 机身金属色 */
  color?: string;
}> = ({ specs, pose, color = '#8C9198' }) => {
  const geo = useMemo(() => {
    const bevel = 1.2;
    const core = specs.depth - bevel * 2;
    const body = new THREE.ExtrudeGeometry(roundedRect(specs.width - bevel * 2, specs.height - bevel * 2, specs.radius - bevel), {
      depth: core,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 6,
      curveSegments: 24,
    });
    body.translate(0, 0, -core / 2);
    const glass = new THREE.ShapeGeometry(roundedRect(specs.width - 2.2, specs.height - 2.2, specs.radius - 1.1), 24);
    // 屏幕圆角取宽的 10%，和 PhoneShot 的 DOM 屏幕（borderRadius = 宽 × 0.1）一致
    const screen = new THREE.ShapeGeometry(roundedRect(specs.screenWidth, specs.screenHeight, specs.screenWidth * 0.1), 24);
    return { body, glass, screen };
  }, [specs]);

  return (
    <group position={pose.pos} rotation={pose.rot} scale={pose.scale}>
      <mesh geometry={geo.body}>
        <meshStandardMaterial color={color} metalness={1} roughness={0.3} />
      </mesh>
      <mesh geometry={geo.glass} position={[0, 0, specs.depth / 2 + 0.01]}>
        <meshPhysicalMaterial color="#050506" roughness={0.05} clearcoat={1} clearcoatRoughness={0.03} />
      </mesh>
      <mesh geometry={geo.screen} position={[0, 0, specs.screenOffsetZ + 0.02]}>
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
};
