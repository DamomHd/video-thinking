import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { focusIn, focusOut, rackFocus, charFocus, blurFilter, lift } from './lens.js';
import { morph, gridLayout, Rect } from './morph.js';
import { pulses, tide, tideCount, thousands } from './flow.js';
import { countUp } from './anim.js';
import { frameRect, shotRail, worldSec } from './shot.js';
import { evalCamera, camProject } from './camera.js';
import { MIN_ACTION_SEC } from './motion.js';

/**
 * 镜头感原语：拉焦 / 形变 / 流动 / 镜头轨
 *
 * 对照参考片（迁移汇报.mp4）拆出来的五个手法补的工程层。
 * 测试守三件事：确定性（同一 t 同一结果）、端点正确、动作不短于最短动作时长。
 */
describe('拉焦 (shared/lens)', () => {
  it('focusIn 起点全糊全透明，终点清晰不透明', () => {
    const a = focusIn(0, 0, 0.5);
    assert.equal(a.opacity, 0);
    assert.ok(a.blurPx > 10);
    const b = focusIn(1, 0, 0.5);
    assert.equal(b.opacity, 1);
    assert.equal(b.blurPx, 0);
    assert.equal(b.dy, 0);
  });

  it('focusOut 往上飘（dy 为负），与 focusIn 方向相反', () => {
    const mid = focusOut(0.2, 0, 0.4);
    assert.ok(mid.dy < 0 && mid.blurPx > 0 && mid.opacity < 1);
    assert.equal(focusOut(5, 0).opacity, 0);
  });

  it('拉焦时长不短于 MIN_ACTION_SEC', () => {
    assert.ok(focusIn(MIN_ACTION_SEC * 0.5, 0, 0.01).opacity < 0.999);
  });

  it('rackFocus：新的晚于旧的开始，切点那一刻新内容还看不见', () => {
    const r = rackFocus(1, 1, { gapSec: 0.2 });
    assert.equal(r.out.opacity, 1);
    assert.equal(r.in.opacity, 0);
  });

  it('逐字聚焦：前面的字先清晰，最后一个字最后到位', () => {
    const n = 8;
    const t = 0.3;
    const first = charFocus(0, n, t, 0);
    const last = charFocus(n - 1, n, t, 0);
    assert.ok(first.opacity > last.opacity);
    assert.equal(charFocus(n - 1, n, 5, 0).opacity, 1);
  });

  it('blurFilter 在可忽略时输出 none', () => {
    assert.equal(blurFilter(0.1), 'none');
    assert.match(blurFilter(4), /^blur\(4\.00px\)$/);
  });

  it('lift 浮起时往上、阴影变深', () => {
    assert.ok(lift(0).dy === 0 || Object.is(lift(0).dy, -0));
    assert.ok(lift(1).dy < 0);
    assert.notEqual(lift(0).boxShadow, lift(1).boxShadow);
  });
});

describe('形变 (shared/morph)', () => {
  const ids21 = Array.from({ length: 21 }, (_, i) => `api${i}`);
  const keep = ['api1', 'api4', 'api7', 'api10', 'api13', 'api16'];
  const A = gridLayout(ids21, { x: 0, y: 0, cols: 7, w: 200, h: 80 });
  const B = gridLayout(keep, { x: 0, y: 400, cols: 6, w: 240, h: 100 });

  it('p=0 等于布局 a，p=1 等于布局 b，退场元素消失', () => {
    const at0 = morph(A, B, 0);
    for (const it of at0) assert.deepEqual(it.rect, A[it.id]);
    const at1 = morph(A, B, 1).filter((it) => it.opacity > 0);
    assert.deepEqual(at1.map((it) => it.id).sort(), [...keep].sort());
    for (const it of at1) assert.deepEqual(it.rect, B[it.id]);
  });

  it('先走后挪：退场完成前，留下的元素还没开始挪', () => {
    const mid = morph(A, B, 0.15);
    const stay = mid.find((it) => it.id === 'api1')!;
    const exit = mid.find((it) => it.id === 'api0')!;
    assert.deepEqual(stay.rect, A.api1);
    assert.ok(exit.opacity < 1);
  });

  it('入场元素在后 40% 才出现', () => {
    const C: Record<string, Rect> = { ...B, extra: { x: 0, y: 0, w: 10, h: 10 } };
    assert.equal(morph(A, C, 0.5).find((it) => it.id === 'extra')!.opacity, 0);
    assert.equal(morph(A, C, 1).find((it) => it.id === 'extra')!.opacity, 1);
  });

  it('错峰：第一个留下的元素比最后一个先到', () => {
    const mid = morph(A, B, 0.6, { stagger: 0.4 });
    const first = mid.find((it) => it.id === keep[0])!;
    const last = mid.find((it) => it.id === keep[keep.length - 1])!;
    assert.ok(first.p > last.p);
  });
});

describe('流动 (shared/flow)', () => {
  it('光点从起点依次发出，startSec 前一个都没有', () => {
    assert.equal(pulses(0.5, { startSec: 1 }).length, 0);
    assert.equal(pulses(1.1, { count: 3, periodSec: 3, startSec: 1 }).length, 1);
    assert.equal(pulses(10, { count: 3, periodSec: 3, startSec: 1 }).length, 3);
  });

  it('光点在路径两端淡出，不会凭空出现', () => {
    const [p] = pulses(1e-3, { count: 1, periodSec: 4 });
    assert.ok(p.alpha < 0.05);
  });

  it('光点是 t 的纯函数，周期循环', () => {
    const a = pulses(2.3, { count: 2, periodSec: 4 });
    const b = pulses(6.3, { count: 2, periodSec: 4 });
    assert.deepEqual(a.map((p) => p.u.toFixed(6)), b.map((p) => p.u.toFixed(6)));
  });

  it('潮水：前面的先满，前沿是虚的（中间值存在），结束后全满', () => {
    const n = 100;
    const mid = Array.from({ length: n }, (_, i) => tide(i, n, 1, 0, 2));
    assert.equal(mid[0], 1);
    assert.equal(mid[n - 1], 0);
    assert.ok(mid.some((v) => v > 0.05 && v < 0.95), '前沿应当有半亮的点');
    assert.ok(Array.from({ length: n }, (_, i) => tide(i, n, 3, 0, 2)).every((v) => v === 1));
  });

  it('计数器和潮水一致：开始是 0，结束是 n，中途单调不减', () => {
    const n = 3557;
    assert.equal(tideCount(n, -1, 0, 3), 0);
    assert.equal(tideCount(n, 4, 0, 3), n);
    let prev = 0;
    for (let t = 0; t <= 3; t += 1 / 30) {
      const c = tideCount(n, t, 0, 3);
      assert.ok(c >= prev);
      prev = c;
    }
  });

  it('countUp 落到目标值；千分位格式', () => {
    // anim.countUp(t − 起点, 起始值, 目标值, 时长)
    assert.equal(countUp(10, 0, 652445, 1), 652445);
    assert.equal(countUp(0, 626544, 652445, 1), 626544);
    assert.equal(thousands(652445), '652,445');
    assert.equal(thousands(3.356, 2), '3.36');
  });
});

describe('镜头轨 (shared/shot)', () => {
  it('frameRect 把矩形中心放到画面中心，并按较紧的一边装下', () => {
    const r = { x: 2000, y: 1200, w: 960, h: 270 };
    const f = frameRect(r, { margin: 0 });
    assert.equal(f.z, 0.5);
    // camProject 的世界坐标以画面中心为原点（和 Stage 世界层 transform-origin 50% 50% 一致）
    const [cx, cy] = camProject(f, [r.x + r.w / 2 - 960, r.y + r.h / 2 - 540]);
    assert.equal(cx, 960);
    assert.equal(cy, 540);
    // 矩形左边缘恰好贴着画面左边
    assert.equal(camProject(f, [r.x - 960, r.y + r.h / 2 - 540])[0], 0);
  });

  it('shotRail：到位时刻机位准确，停留期间缓推', () => {
    const a = { x: 0, y: 0, z: 1 };
    const b = { x: 600, y: 300, z: 0.6 };
    const keys = shotRail([{ frame: a, arrive: 0 }, { frame: b, arrive: 5 }]);
    const at5 = evalCamera(keys, 5);
    assert.deepEqual([at5.x, at5.y, at5.z], [600, 300, 0.6]);
    const held = evalCamera(keys, 2);
    assert.equal(held.x, 0);
    assert.ok(held.z < 1, '停留期间应当在缓推');
  });

  it('远距离移动走弧线：中途拉远到比两端都大的 z', () => {
    const keys = shotRail(
      [{ frame: { x: 0, y: 0, z: 1 }, arrive: 0, leave: 1 }, { frame: { x: 3000, y: 0, z: 1 }, arrive: 3 }],
      { arc: 1.3 }
    );
    const mid = evalCamera(keys, 2);
    assert.ok(mid.z > 1.2);
    assert.ok(Math.abs(mid.x - 1500) < 1);
  });

  it('弧线的两半在中点速度连续（没有顿挫）', () => {
    const keys = shotRail(
      [{ frame: { x: 0, y: 0, z: 1 }, arrive: 0, leave: 1 }, { frame: { x: 3000, y: 0, z: 1 }, arrive: 3 }]
    );
    const h = 1e-3;
    const v1 = (evalCamera(keys, 2).x - evalCamera(keys, 2 - h).x) / h;
    const v2 = (evalCamera(keys, 2 + h).x - evalCamera(keys, 2).x) / h;
    assert.ok(Math.abs(v1 - v2) / v1 < 0.01, `中点速度 ${v1.toFixed(1)} vs ${v2.toFixed(1)}`);
  });

  it('近距离移动不走弧线；arc=1 关掉弧线', () => {
    const near = shotRail([{ frame: { x: 0, y: 0, z: 1 }, arrive: 0 }, { frame: { x: 300, y: 0, z: 1 }, arrive: 3 }]);
    assert.equal(near.length, 3);
    const off = shotRail(
      [{ frame: { x: 0, y: 0, z: 1 }, arrive: 0 }, { frame: { x: 3000, y: 0, z: 1 }, arrive: 3 }],
      { arc: 1 }
    );
    assert.equal(off.length, 3);
  });

  it('worldSec 把幕内秒还原成全片秒', () => {
    assert.equal(worldSec({ start: 6.25 }, 1.5), 7.75);
  });
});
