import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cameraFromStage, projectPoint, toWorld3, moveFrom, projectQuad, paperTransform } from './bridge.js';

/**
 * 2D ↔ 3D 镜头桥：交接那一帧，3D 相机看到的纸面必须和 2D 镜头逐像素一致。
 */
const stage2d = (cam: { x: number; y: number; z: number }, px: number, py: number): [number, number] => [
  960 + (px - (960 + cam.x)) / cam.z,
  540 + (py - (540 + cam.y)) / cam.z,
];

describe('2D ↔ 3D 镜头桥 (shared/bridge)', () => {
  it('交接机位：纸面上任意点在 3D 相机里的屏幕位置 = 2D 镜头下的位置（误差 < 0.01px）', () => {
    for (const cam of [{ x: 0, y: 0, z: 1 }, { x: 4800, y: -120, z: 0.6 }, { x: 12000, y: 300, z: 1.4 }]) {
      const pose = cameraFromStage(cam);
      for (const [px, py] of [[0, 0], [1920, 1080], [960 + cam.x + 300, 540 + cam.y - 200], [cam.x + 100, cam.y + 900]]) {
        const a = projectPoint(pose, toWorld3(px, py));
        const b = stage2d(cam, px, py);
        assert.ok(Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01, `cam=${JSON.stringify(cam)} p=${px},${py}: ${a} vs ${b}`);
      }
    }
  });

  it('压低镜头后：纸面近处（画面下方）比远处（画面上方）宽 —— 有透视', () => {
    const base = cameraFromStage({ x: 0, y: 0, z: 1 });
    const tilted = moveFrom(base, { tiltDeg: 45 });
    const q = projectQuad(tilted, [toWorld3(560, 340), toWorld3(1360, 340), toWorld3(1360, 740), toWorld3(560, 740)]);
    const topW = q[1][0] - q[0][0];
    const botW = q[2][0] - q[3][0];
    assert.ok(botW > topW * 1.1, `近宽 ${botW.toFixed(1)} vs 远宽 ${topW.toFixed(1)}`);
  });

  it('moveFrom 不动时等于交接机位；推近 dolly < 1 时画面里的纸面变大', () => {
    const base = cameraFromStage({ x: 100, y: 50, z: 1 });
    const same = moveFrom(base, {});
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(same.pos[i] - base.pos[i]) < 1e-6);
    const near = moveFrom(base, { dolly: 0.5 });
    const p = toWorld3(960 + 100 + 200, 540 + 50);
    const dx0 = projectPoint(base, p)[0] - 960;
    const dx1 = projectPoint(near, p)[0] - 960;
    assert.ok(Math.abs(dx1 / dx0 - 2) < 1e-6);
  });

  it('paperTransform：纸面上任意点经 CSS 矩阵落到 projectPoint 的位置 —— 相机远离纸面原点（原点在相机身后）也成立', () => {
    const apply = (css: string, x: number, y: number): [number, number] => {
      const m = css.slice(9, -1).split(',').map(Number); // 列主序
      const X = m[0] * x + m[4] * y + m[12];
      const Y = m[1] * x + m[5] * y + m[13];
      const w = m[3] * x + m[7] * y + m[15];
      return [X / w, Y / w];
    };
    const near = moveFrom(cameraFromStage({ x: 0, y: 0, z: 1 }), { tiltDeg: 50, orbitDeg: -15 });
    const far = moveFrom(cameraFromStage({ x: 12000, y: 0, z: 1 }), { tiltDeg: 52, dolly: 0.84, orbitDeg: -14, pan: [-120, -230] });
    for (const [pose, pts] of [[near, [[300, 200], [1500, 900]]], [far, [[12500, 900], [13800, 300], [12100, 600]]]] as const) {
      const css = paperTransform(pose);
      for (const [x, y] of pts) {
        const a = apply(css, x, y);
        const b = projectPoint(pose, toWorld3(x, y));
        assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01, `(${x}, ${y}) ${a} vs ${b}`);
      }
    }
  });
});
