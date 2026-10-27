import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bendPaperGeometry } from '../components/three/PaperSheet.js';

/**
 * PaperSheet 的卷曲几何：纸要卷到圆柱面上（两边翘起、中间贴平），而不是斜成一个平面。
 * 旧写法 z ∝ sin(x) 时左右两边一高一低 —— 这条测试守的就是「左右对称翘起」。
 */
describe('纸张卷曲 (PaperSheet.bendPaperGeometry)', () => {
  const zAt = (geo: THREE.PlaneGeometry, x: number): number => {
    const pos = geo.attributes.position;
    let best = Infinity;
    let z = 0;
    const orig = new THREE.PlaneGeometry(600, 800, 32, 32).attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const d = Math.abs(orig.getX(i) - x) + Math.abs(orig.getY(i));
      if (d < best) {
        best = d;
        z = pos.getZ(i);
      }
    }
    return z;
  };

  it('卷着的时候：两边同向翘起、左右对称，中间最低', () => {
    const geo = new THREE.PlaneGeometry(600, 800, 32, 32);
    bendPaperGeometry(geo, 0);
    const l = zAt(geo, -300);
    const r = zAt(geo, 300);
    const c = zAt(geo, 0);
    assert.ok(l > 10 && r > 10, `两边应翘起: ${l}, ${r}`);
    assert.ok(Math.abs(l - r) < 1e-6, `左右应对称: ${l} vs ${r}`);
    assert.ok(Math.abs(c) < 1e-6);
  });

  it('弧长守恒：卷起后横向投影变窄，但不会比原宽更宽', () => {
    const geo = new THREE.PlaneGeometry(600, 800, 32, 32);
    bendPaperGeometry(geo, 0);
    const xs = Array.from({ length: geo.attributes.position.count }, (_, i) => geo.attributes.position.getX(i));
    const span = Math.max(...xs) - Math.min(...xs);
    assert.ok(span < 600 && span > 500, `投影宽 ${span}`);
  });

  it('完全展开时是平的', () => {
    const geo = new THREE.PlaneGeometry(600, 800, 32, 32);
    bendPaperGeometry(geo, 1);
    const zs = Array.from({ length: geo.attributes.position.count }, (_, i) => geo.attributes.position.getZ(i));
    assert.ok(zs.every((z) => z === 0));
  });
});
