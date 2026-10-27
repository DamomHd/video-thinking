import * as THREE from 'three';

/**
 * 手机机身几何与屏幕四角顶点定义（纯函数，Node 与浏览器双端同源）
 * 手机尺寸按 iPhone 规格：宽 71.5mm, 高 146.7mm, 厚 7.65mm
 */
export const PHONE_SPECS = {
  width: 71.5,
  height: 146.7,
  depth: 7.65,
  radius: 10.0,
  screenWidth: 68.0,
  screenHeight: 143.0,
  screenOffsetZ: 3.83, // 屏幕紧贴机身前表面
};

/**
 * 屏幕在机身局部坐标系下的四个角（单位 mm）
 * 顺序：[左上, 右上, 右下, 左下]
 */
export const SCREEN_CORNERS_LOCAL: [number, number, number][] = [
  [-PHONE_SPECS.screenWidth / 2,  PHONE_SPECS.screenHeight / 2, PHONE_SPECS.screenOffsetZ],
  [ PHONE_SPECS.screenWidth / 2,  PHONE_SPECS.screenHeight / 2, PHONE_SPECS.screenOffsetZ],
  [ PHONE_SPECS.screenWidth / 2, -PHONE_SPECS.screenHeight / 2, PHONE_SPECS.screenOffsetZ],
  [-PHONE_SPECS.screenWidth / 2, -PHONE_SPECS.screenHeight / 2, PHONE_SPECS.screenOffsetZ],
];

/**
 * 机身外轮廓四个角（单位 mm），顺序同屏幕：[左上, 右上, 右下, 左下]
 * 程序化降级机身按这四个角贴合，所以和屏幕永远共用同一台相机、不会错位。
 */
export const BODY_CORNERS_LOCAL: [number, number, number][] = [
  [-PHONE_SPECS.width / 2,  PHONE_SPECS.height / 2, PHONE_SPECS.screenOffsetZ],
  [ PHONE_SPECS.width / 2,  PHONE_SPECS.height / 2, PHONE_SPECS.screenOffsetZ],
  [ PHONE_SPECS.width / 2, -PHONE_SPECS.height / 2, PHONE_SPECS.screenOffsetZ],
  [-PHONE_SPECS.width / 2, -PHONE_SPECS.height / 2, PHONE_SPECS.screenOffsetZ],
];

export interface PhonePose {
  pos: [number, number, number];
  rot: [number, number, number]; // 欧拉角 (rad)
  scale: [number, number, number];
}

export interface CameraPose {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number; // 竖直视场角 (deg)
}

/**
 * 计算给定机身姿态和相机参数下，屏幕四角在视口画布 (W x H) 上的精确像素坐标
 */
export function projectCorners(
  corners: [number, number, number][],
  phone: PhonePose,
  camera: CameraPose,
  viewWidth = 1920,
  viewHeight = 1080
): [number, number][] {
  const cam = new THREE.PerspectiveCamera(camera.fov, viewWidth / viewHeight, 0.1, 1000);
  cam.position.set(...camera.pos);
  cam.lookAt(new THREE.Vector3(...camera.look));
  cam.updateMatrixWorld();

  const phoneMat = new THREE.Matrix4();
  phoneMat.compose(
    new THREE.Vector3(...phone.pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...phone.rot)),
    new THREE.Vector3(...phone.scale)
  );

  return corners.map(([lx, ly, lz]) => {
    const v = new THREE.Vector3(lx, ly, lz).applyMatrix4(phoneMat);
    v.project(cam);
    // NDC (-1~1) 映射到像素坐标 (0~W, 0~H)
    const px = Math.round(((v.x + 1) / 2) * viewWidth * 100) / 100;
    const py = Math.round(((1 - v.y) / 2) * viewHeight * 100) / 100;
    return [px, py];
  });
}

/** 屏幕四角在视口上的像素坐标 */
export function projectScreenCorners(
  phone: PhonePose,
  camera: CameraPose,
  viewWidth = 1920,
  viewHeight = 1080
): [number, number][] {
  return projectCorners(SCREEN_CORNERS_LOCAL, phone, camera, viewWidth, viewHeight);
}

/** 机身外轮廓四角在视口上的像素坐标 */
export function projectBodyCorners(
  phone: PhonePose,
  camera: CameraPose,
  viewWidth = 1920,
  viewHeight = 1080
): [number, number][] {
  return projectCorners(BODY_CORNERS_LOCAL, phone, camera, viewWidth, viewHeight);
}

/**
 * FNV-1a 字符串哈希，生成机位轨迹签名
 */
export function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
