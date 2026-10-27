import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evalCamera,
  camTransform,
  camProject,
  CamKey,
} from './camera';

test('evalCamera performs smooth logarithmic interpolation on z-axis', () => {
  const keys: CamKey[] = [
    { t: 0, x: 0, y: 0, z: 1.0 },
    { t: 1.0, x: 100, y: 200, z: 0.1 }, // 放大 10 倍
  ];

  // 中间点 t = 0.5 (不考虑缓动时，对数中点应该约为 sqrt(1 * 0.1) = 0.316)
  const camHalf = evalCamera(keys, 0.5);
  assert.ok(camHalf.z < 1.0 && camHalf.z > 0.1, `camHalf.z=${camHalf.z}`);
  assert.ok(camHalf.x > 0 && camHalf.x < 100, `camHalf.x=${camHalf.x}`);
  assert.ok(camHalf.y > 0 && camHalf.y < 200, `camHalf.y=${camHalf.y}`);

  // 边界保护
  const before = evalCamera(keys, -1.0);
  assert.equal(before.z, 1.0);
  assert.equal(before.x, 0);

  const after = evalCamera(keys, 2.0);
  assert.equal(after.z, 0.1);
  assert.equal(after.x, 100);
});

test('camTransform outputs pure 2D transform when there is no 3D tilt', () => {
  const cam2D = { x: 50.4, y: 30.6, z: 2.0, rx: 0, ry: 0, rz: 0 };
  const str = camTransform(cam2D, { integerPixels: true });

  // scale = 1 / 2.0 = 0.5; tx = -50.4 * 0.5 = -25.2 -> 取整 -25px
  // ty = -30.6 * 0.5 = -15.3 -> 取整 -15px
  assert.ok(!str.includes('translate3d'), 'Should not use 3D translate when untilted');
  assert.ok(!str.includes('rotateX'), 'Should not output 3D rotations');
  assert.ok(str.includes('translate(-25px, -15px)'), `Actual: ${str}`);
  assert.ok(str.includes('scale(0.5)'), `Actual: ${str}`);
});

test('camTransform outputs full 3D transform when camera is tilted', () => {
  const cam3D = { x: 10, y: 20, z: 1.0, rx: 15, ry: -10, rz: 5 };
  const str = camTransform(cam3D);

  assert.ok(str.includes('translate3d'), 'Should output 3D transform when tilted');
  assert.ok(str.includes('rotateX(15.000deg)'), `Actual: ${str}`);
  assert.ok(str.includes('rotateY(-10.000deg)'), `Actual: ${str}`);
  assert.ok(str.includes('rotateZ(5.000deg)'), `Actual: ${str}`);
});

test('camProject accurately maps world point to stage viewport pixel coordinates', () => {
  const stageSize: [number, number] = [1920, 1080];
  // 视距 1.0，相机正对世界原点 (0, 0)
  const cam = { x: 0, y: 0, z: 1.0, rx: 0, ry: 0, rz: 0 };

  // 世界原点应该正好落在画布正中心 (960, 540)
  const screenOrigin = camProject(cam, [0, 0], stageSize);
  assert.equal(screenOrigin[0], 960);
  assert.equal(screenOrigin[1], 540);

  // 世界坐标点 (100, -50)
  const screenPt = camProject(cam, [100, -50], stageSize);
  assert.equal(screenPt[0], 1060);
  assert.equal(screenPt[1], 490);
});
