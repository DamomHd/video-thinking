import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { circleCircle, lineLine, lineCircle, dist, arcPath, extendSegment, Pt } from './geo.js';
import { renderTex } from '../components/math/katexKit.js';

describe('几何板书 (shared/geo)', () => {
  it('两圆交点：《几何原本》I.1 的 C 点与 A、B 等距（等边三角形）', () => {
    const A: Pt = [0, 0];
    const B: Pt = [10, 0];
    const pts = circleCircle(A, 10, B, 10);
    assert.equal(pts.length, 2);
    for (const C of pts) {
      assert.ok(Math.abs(dist(A, C) - 10) < 1e-9 && Math.abs(dist(B, C) - 10) < 1e-9);
    }
    assert.equal(circleCircle(A, 1, B, 1).length, 0, '相离无交点');
    assert.equal(circleCircle(A, 5, B, 5).length, 1, '外切一个交点');
  });

  it('直线交点、直线与圆交点；平行线返回 null', () => {
    assert.deepEqual(lineLine([0, 0], [10, 10], [0, 10], [10, 0]), [5, 5]);
    assert.equal(lineLine([0, 0], [1, 0], [0, 1], [1, 1]), null);
    const hits = lineCircle([-10, 0], [10, 0], [0, 0], 5);
    assert.deepEqual(hits.map((p) => Math.round(p[0])).sort((a, b) => a - b), [-5, 5]);
  });

  it('圆弧路径：整圈截到 2π 以内（SVG 画不了起止重合的弧）、延长线两端各加长', () => {
    assert.match(arcPath([0, 0], 10, 0, 2 * Math.PI), /A 10\.000 10\.000 0 1 1/);
    const [p, q] = extendSegment([0, 0], [10, 0], 5);
    assert.deepEqual([p, q], [[-5, 0], [15, 0]]);
  });
});

describe('公式渲染 (math/katexKit)', () => {
  it('KaTeX 出 HTML、出错不抛（throwOnError: false）', () => {
    assert.match(renderTex('a^2 + b^2 = c^2'), /katex-html/);
    assert.doesNotThrow(() => renderTex('\\frac{1}{'));
  });
});
