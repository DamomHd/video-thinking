import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { stepTime, stepIndex, stepJitter } from './stepped.js';
import { isoPose } from '../components/three/FilmCanvas.js';

describe('定格节奏 (shared/stepped)', () => {
  it('12 张/秒：同一张拍摄帧内时间不变，换帧才跳', () => {
    assert.equal(stepTime(0.05, 12), 0);
    assert.equal(stepTime(0.083, 12), 0);
    assert.ok(Math.abs(stepTime(1 / 12, 12) - 1 / 12) < 1e-12);
    assert.equal(stepTime(0.5, 0), 0.5, 'stepFps ≤ 0 不量化');
    assert.equal(stepIndex(1.01, 8), 8);
  });

  it('错位：同一张帧内恒定、换帧变化、按种子可复现、幅度受控', () => {
    const a = stepJitter(0.01, 12, 3);
    assert.deepEqual(a, stepJitter(0.07, 12, 3));
    assert.notDeepEqual(a, stepJitter(0.1, 12, 3));
    assert.notDeepEqual(a, stepJitter(0.01, 12, 4));
    for (let t = 0; t < 3; t += 0.05) {
      const j = stepJitter(t, 12, 9, { ampPx: 2, rotDeg: 0.5 });
      assert.ok(Math.abs(j.dx) <= 2 && Math.abs(j.dy) <= 2 && Math.abs(j.rot) <= 0.5);
    }
  });
});

describe('轴测机位 (FilmCanvas.isoPose)', () => {
  it('标准等距：x / y / z 三个单位轴投影到屏幕上的长度相等', () => {
    const pose = isoPose([0, 0, 0], 50);
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    cam.position.set(...pose.pos);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    const len = (v: THREE.Vector3) => {
      const o = new THREE.Vector3(0, 0, 0).project(cam);
      const p = v.clone().project(cam);
      return Math.hypot(p.x - o.x, p.y - o.y);
    };
    const lx = len(new THREE.Vector3(1, 0, 0));
    const ly = len(new THREE.Vector3(0, 1, 0));
    const lz = len(new THREE.Vector3(0, 0, 1));
    assert.ok(Math.abs(lx - ly) < 1e-6 && Math.abs(ly - lz) < 1e-6, `${lx} ${ly} ${lz}`);
  });
});
