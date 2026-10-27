import React from 'react';
import { Img, staticFile } from 'remotion';
import { quadMatrix3d, Quad } from '../shared/homography';
import { FilmCanvas, PoseCamera } from './three/FilmCanvas';
import { Phone3D, Phone3DPose, PhoneSpecs } from './three/Phone3D';
import { StudioEnv } from './three/StudioEnv';
import { CameraPose } from './three/CameraRig';

export interface PhoneBodyManifest {
  complete: boolean;
  sig: string;
  frames: number;
  expectedFrames?: number;
  fps?: number;
}

interface PhoneShotProps {
  /** 幕内秒数 */
  t: number;
  /** 屏幕四角像素坐标（来自机位单源 rig） */
  screenQuad: [number, number][];
  /** 机身外轮廓四角像素坐标；缺省时用屏幕四角按边框比例外扩 */
  bodyQuad?: [number, number][];
  phoneBodyManifest?: PhoneBodyManifest;
  /** 当前机位签名（rig 算出来的） */
  currentSig: string;
  /** Blender 帧序列目录，相对 public/ */
  framesDir?: string;
  /** 屏幕设计尺寸 (pt) */
  screenSize?: [number, number];
  /**
   * 降级用的 three.js 机身（§8「对不上就退回 three.js 机身」）。
   * 传入和 screenQuad 同源的机身姿态 / 相机 / 规格；不传则退回 CSS 程序化机身。
   */
  body3d?: { specs: PhoneSpecs; phone: Phone3DPose; camera: CameraPose };
  children: React.ReactNode;
}

/**
 * 手机机身复合渲染 (对标 §8 的「出口」)
 * 签名对得上：Img 垫 Blender Cycles 机身，DOM 屏幕按投影四角用 matrix3d 贴合，玻璃反光叠回；
 * 签名对不上：console.warn 并降级为程序化机身 —— 机身和屏幕共用同一组投影角，永不错位。
 */
export const PhoneShot: React.FC<PhoneShotProps> = ({
  t,
  screenQuad,
  bodyQuad,
  phoneBodyManifest,
  currentSig,
  framesDir = 'blender/loomcare-demo/phone',
  screenSize = [390, 844],
  body3d,
  children,
}) => {
  const trackFps = phoneBodyManifest?.fps ?? 60;
  const k = Math.round(t * trackFps);
  const sigMatch = phoneBodyManifest?.sig === currentSig;
  const isBlenderReady = Boolean(phoneBodyManifest?.complete) && sigMatch;

  // 签名不符时明确告警一次：这正是「机位改了而序列没重渲」的信号
  if (phoneBodyManifest && !isBlenderReady) {
    warnOnce(
      `[PhoneShot] Blender 机身未启用（complete=${phoneBodyManifest.complete}, ` +
        `清单签名=${phoneBodyManifest.sig} 当前签名=${currentSig}）→ 已降级为程序化机身`
    );
  }

  const quad: Quad = [
    screenQuad[0] as [number, number],
    screenQuad[1] as [number, number],
    screenQuad[2] as [number, number],
    screenQuad[3] as [number, number],
  ];
  const [screenW, screenH] = screenSize;
  const screenMatrix = quadMatrix3d(screenW, screenH, quad);
  const screenClip = `inset(0 round ${Math.round(screenW * 0.1)}px)`;

  // 机身四角：没给就按屏幕四角相对质心等比外扩（iPhone 边框比例 ≈ 5.1% / 2.6%）
  const body = (bodyQuad ?? inflateQuad(quad, 1.0515, 1.0259)) as Quad;
  const bodyW = Math.round(screenW * 1.0515);
  const bodyH = Math.round(screenH * 1.0259);
  const bodyMatrix = quadMatrix3d(bodyW, bodyH, body);

  const frameStr = String(k).padStart(4, '0');

  return (
    <div style={{ width: 1920, height: 1080, position: 'relative', overflow: 'hidden' }}>
      {/* A. 机身底层 */}
      {isBlenderReady ? (
        <Img
          src={staticFile(`${framesDir}/${frameStr}.webp`)}
          style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
          alt="Blender phone body"
        />
      ) : body3d ? (
        <FilmCanvas width={1920} height={1080} camera={{ fov: body3d.camera.fov, near: 1, far: 5000 }} style={{ position: 'absolute', top: 0, left: 0 }}>
          <PoseCamera pose={body3d.camera} />
          <StudioEnv />
          <directionalLight position={[-200, 300, 400]} intensity={1.2} />
          <Phone3D specs={body3d.specs} pose={body3d.phone} />
        </FilmCanvas>
      ) : (
        <div
          style={{
            width: bodyW,
            height: bodyH,
            position: 'absolute',
            top: 0,
            left: 0,
            transformOrigin: '0 0',
            transform: bodyMatrix,
            borderRadius: Math.round(bodyW * 0.14),
            // 钛金属机身：竖向冷暖交替的掠射高光
            background:
              'linear-gradient(100deg,#2A2F33 0%,#6E7781 14%,#3A4046 32%,#9AA3AC 50%,#343A40 68%,#5C646C 86%,#23272B 100%)',
            boxShadow:
              '0 40px 90px -30px rgba(0,0,0,0.65), inset 0 0 0 2px rgba(255,255,255,0.14), inset 0 0 22px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* B. 核心 DOM 屏幕层：射影贴合 */}
      <div
        style={{
          width: screenW,
          height: screenH,
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: screenMatrix,
          backgroundColor: '#FFFFFF',
          // 矢量 clip-path 裁屏幕（§7）：borderRadius + overflow 在透视层里边缘不抗锯齿，Studio 里一圈锯齿
          clipPath: screenClip,
        }}
      >
        {children}
      </div>

      {/* C. 玻璃反光层：逆映射回屏幕四角后用 screen 叠加 */}
      <div
        style={{
          width: screenW,
          height: screenH,
          position: 'absolute',
          top: 0,
          left: 0,
          transformOrigin: '0 0',
          transform: screenMatrix,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          clipPath: screenClip,
          // 掠过屏幕的一道斜向反光，随机位推进时四角变化自然带动
          background:
            'linear-gradient(118deg, rgba(255,255,255,0) 32%, rgba(255,255,255,0.22) 46%, rgba(255,255,255,0.05) 54%, rgba(255,255,255,0) 68%)',
          opacity: isBlenderReady ? 0.5 : 0.32,
        }}
      />
    </div>
  );
};

/** 以质心为中心等比外扩四边形（用于没有机身投影角时的兜底） */
export function inflateQuad(quad: Quad, sx: number, sy: number): Quad {
  const cx = quad.reduce((a, p) => a + p[0], 0) / 4;
  const cy = quad.reduce((a, p) => a + p[1], 0) / 4;
  return quad.map(([x, y]) => [cx + (x - cx) * sx, cy + (y - cy) * sy]) as Quad;
}

const warned = new Set<string>();
function warnOnce(msg: string) {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(msg);
}
