import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

/**
 * blender/loomcare/phone.py 的坐标换基
 *
 * 机身姿态来自 three（欧拉 'XYZ'，矩阵 Rx·Ry·Rz），Blender 侧摆位用的是
 *   rotation_euler = (rx, −rz, ry)，rotation_mode = 'YZX'（矩阵 Rx·Rz·Ry）
 * 这条测试用 three 的矩阵把它算一遍：P·M·P⁻¹ 必须等于 Blender 那组欧拉角的矩阵。
 * 之前写的是 'XYZ'，单轴旋转时碰巧对，偏航 + 翻滚同时存在就错位。
 */
describe('three → Blender 欧拉角换基 (phone.py)', () => {
  // P: three (x, y, z) → blender (x, −z, y)
  const P = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  const Pinv = P.clone().invert();

  const cases: [number, number, number][] = [
    [0, 0.15, 0.05],
    [0.3, -0.4, 0.2],
    [-0.7, 0.25, -0.9],
  ];
  for (const [a, b, c] of cases) {
    it(`rot = (${a}, ${b}, ${c})`, () => {
      const M = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, b, c, 'XYZ'));
      const expected = P.clone().multiply(M).multiply(Pinv);
      // Blender 'YZX' 的矩阵是 Rx·Rz·Ry，对应 three 的欧拉顺序 'XZY'
      const blender = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, -c, b, 'XZY'));
      expected.elements.forEach((v, i) => assert.ok(Math.abs(v - blender.elements[i]) < 1e-9, `元素 ${i}: ${v} vs ${blender.elements[i]}`));
    });
  }

  it("旧写法 'XYZ' 在多轴旋转时确实不对（防止改回去）", () => {
    const [a, b, c] = [0.3, -0.4, 0.2];
    const M = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, b, c, 'XYZ'));
    const expected = P.clone().multiply(M).multiply(Pinv);
    // Blender 'XYZ' 的矩阵是 Rz·Ry·Rx，对应 three 的 'ZYX'
    const old = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(a, -c, b, 'ZYX'));
    const maxErr = Math.max(...expected.elements.map((v, i) => Math.abs(v - old.elements[i])));
    assert.ok(maxErr > 1e-3);
  });
});
