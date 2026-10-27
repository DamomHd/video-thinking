import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  draw,
  stroke,
  stagger,
  drift,
  breathe,
  settle,
  polarityTransitionOk,
  MIN_ACTION_SEC,
  MIN_POLARITY_CROSSFADE_SEC,
} from './motion.js';
import { DEFAULT_THRESHOLDS } from '../../scripts/guard/motion-guard.js';

/**
 * 持续运动原语
 *
 * 这些函数存在的理由是实测出来的：本仓库出的片子动作段中位时长 0.03s
 * （不到两帧），而参考片是 0.26s —— 元素是「蹦」出来的不是「长」出来的。
 * 所以原语的核心职责是**强制铺够时长**，测试要守住这一点。
 */
describe('持续运动原语 (shared/motion)', () => {
  it('draw 强制不短于最短动作时长 —— 传 0.05s 也要铺满 MIN_ACTION_SEC', () => {
    // 传一个过短的时长
    const tooShort = 0.05;
    // 在 MIN_ACTION_SEC 的一半处，进度不该已经到顶
    const mid = draw(MIN_ACTION_SEC * 0.5, 0, tooShort);
    assert.ok(mid < 0.999, `半程进度 ${mid} 已经到顶 —— 时长没有被抬上来`);
    // 到了 MIN_ACTION_SEC 才到顶
    assert.ok(draw(MIN_ACTION_SEC, 0, tooShort) > 0.999);
  });

  it('draw 在起点前是 0，终点后是 1，且单调不减', () => {
    assert.equal(draw(-1, 0, 0.5), 0);
    assert.equal(draw(0, 0, 0.5), 0);
    assert.ok(draw(10, 0, 0.5) > 0.999);
    let prev = -1;
    for (let t = 0; t <= 0.6; t += 0.02) {
      const v = draw(t, 0, 0.5);
      assert.ok(v >= prev - 1e-9, `t=${t} 处回退了`);
      prev = v;
    }
  });

  it('stroke 两头都缓：中点附近斜率最大', () => {
    const d = 1.0;
    const slope = (t: number) => stroke(t + 0.01, 0, d) - stroke(t - 0.01, 0, d);
    assert.ok(slope(0.5) > slope(0.1), '中点应比起点陡');
    assert.ok(slope(0.5) > slope(0.9), '中点应比终点陡');
  });

  it('stagger 把元素铺开，但**单个元素的时长不随数量变化**', () => {
    const few = stagger(3, 1.0);
    const many = stagger(30, 1.0);
    assert.equal(few.durSec, many.durSec, '元素一多就压缩单个动作时长 —— 正是要避免的');
    assert.ok(few.durSec >= MIN_ACTION_SEC);
    // 最后一个元素的起点落在 span 末端
    assert.ok(Math.abs(many.at(29) - 1.0) < 1e-9);
    assert.equal(many.at(0), 0);
    // 总时长 = 铺开时长 + 单个动作时长
    assert.ok(Math.abs(many.totalSec - (1.0 + many.durSec)) < 1e-9);
  });

  it('drift 永不停止、有界、且逐帧确定', () => {
    for (const t of [0, 3.7, 50, 1234.5]) {
      const v = drift(t, 14, 8);
      assert.ok(Math.abs(v) <= 8 + 1e-9, `t=${t} 越界 ${v}`);
      assert.equal(v, drift(t, 14, 8), '同一时刻两次调用结果必须一致');
    }
    // 一个周期之后回到原处
    assert.ok(Math.abs(drift(0, 14, 8) - drift(14, 14, 8)) < 1e-6);
    // 相位能把元素错开
    assert.notEqual(drift(2, 14, 8, 0), drift(2, 14, 8, 0.5));
  });

  it('breathe 结果落在 [min, max] 内', () => {
    for (let t = 0; t < 30; t += 0.37) {
      const v = breathe(t, 11, 0.92, 1.0);
      assert.ok(v >= 0.92 - 1e-9 && v <= 1.0 + 1e-9, `t=${t} → ${v}`);
    }
  });

  it('settle 只在动作结束之后起作用，幅度收敛到 0', () => {
    const from = 0;
    const dur = 0.4;
    assert.equal(settle(0.2, from, dur), 0, '动作期间不该有沉降');
    assert.equal(settle(from + dur + 5, from, dur), 0, '沉降期之后要归零');
    const justAfter = Math.abs(settle(from + dur + 0.05, from, dur, { ampPx: 3 }));
    const later = Math.abs(settle(from + dur + 0.8, from, dur, { ampPx: 3 }));
    assert.ok(justAfter > later, '沉降幅度应随时间衰减');
  });

  it('亮暗之间：硬切放行、铺够放行、不上不下报错', () => {
    assert.ok(polarityTransitionOk(false, true, 0).ok, '硬切应放行');
    assert.ok(polarityTransitionOk(false, true, MIN_POLARITY_CROSSFADE_SEC).ok, '铺够应放行');
    const bad = polarityTransitionOk(false, true, 0.25);
    assert.ok(!bad.ok, '0.25s 的亮暗淡化必须报错 —— 实测会糊成灰浆');
    assert.match(bad.reason ?? '', /灰浆|硬切/);
    // 同极性之间随便
    assert.ok(polarityTransitionOk(false, false, 0.25).ok);
    assert.ok(polarityTransitionOk(true, true, 0.25).ok);
  });
});

/**
 * 运动守门的标定
 *
 * 这一组测试守的是**判据本身**，不是某条片子：
 * 参考片是已知「丝滑」的样本，它必须通过；阈值被人调松或调紧到
 * 让参考片判红，就说明标定坏了。
 */
describe('运动守门的标定 (guard/motion-guard)', () => {
  /**
   * 两个标杆都是 LoomCare 出品，但节奏完全不同：
   *   迁移汇报  27fps · 静止 82% · 3 次硬切    —— 会动的图纸
   *   loomcare  60fps · 静止 38% · 112 次硬切  —— 真正的影片
   * 判据必须同时放行这两种，不能把一种节奏强加给另一种。
   */
  const refs = [
    { name: '迁移汇报.mp4', file: path.join(process.cwd(), '迁移汇报.mp4') },
    { name: 'loomcare.mp4', file: path.join(process.cwd(), 'loomcare.mp4') },
  ];
  const ref = refs[0].file;

  it('阈值取自参考片实测，不能被随手改松', () => {
    // 参考片实测：动作段中位 0.26s、细微运动 15%
    // 下限定在 0.15s / 8%，留了余量但不能形同虚设
    assert.ok(DEFAULT_THRESHOLDS.minMedianActionSec >= 0.1, '动作时长下限不能低于 0.1s，否则两帧的突变也算过');
    assert.ok(DEFAULT_THRESHOLDS.minMedianActionSec <= 0.26, '下限不能高于参考片的实测中位数');
    assert.ok(DEFAULT_THRESHOLDS.minSubtleRatio >= 0.05, '细微运动占比下限不能低于 5%');
    assert.ok(DEFAULT_THRESHOLDS.minSubtleRatio <= 0.15, '不能高于参考片的实测值 15%');
  });

  for (const { name, file } of [
    { name: '迁移汇报.mp4', file: path.join(process.cwd(), '迁移汇报.mp4') },
    { name: 'loomcare.mp4', file: path.join(process.cwd(), 'loomcare.mp4') },
  ]) {
    it(`已知「丝滑」的 ${name} 必须通过`, async () => {
      if (!fs.existsSync(file)) return; // 样本不在就跳过，不伪造结论
      const { checkMotion } = await import('../../scripts/guard/motion-guard.js');
      const r = checkMotion(file, { limitSec: 70 });
      assert.ok(r.ok, `${name} 被判不通过，说明标定坏了:\n${r.errors.join('\n')}`);
      // 顺带守住实测特征，防止分析口径被改坏
      assert.ok(
        r.bands.subtle > 0.08,
        `${name} 细微运动只测出 ${(r.bands.subtle * 100).toFixed(1)}%，分析分辨率或取样频率可能被改坏了`
      );
      assert.ok(r.medianActionSec > 0.15, `${name} 动作中位测出 ${r.medianActionSec}s`);
    });
  }

  it('取样归一化到 30Hz —— 不同帧率的片子必须可比', async () => {
    if (!fs.existsSync(refs[1].file)) return;
    const { checkMotion } = await import('../../scripts/guard/motion-guard.js');
    // 60fps 的片子如果按逐帧比，变化量天然只有 30fps 的一半，会被系统性判得更死
    const r = checkMotion(refs[1].file, { limitSec: 70 });
    assert.ok(
      r.bands.subtle > 0.08,
      `60fps 的标杆细微运动只有 ${(r.bands.subtle * 100).toFixed(1)}% —— 取样归一化可能失效了`
    );
  });
});

import { landOn, landingFraction, springImpactSec, drawLanding } from './motion.js';
import { spring, easeInOutCubic } from './anim.js';

describe('落点对齐 (shared/motion · landOn)', () => {
  it('easeOutCubic 在约 73% 处到达 0.98，所以要提前约 0.73 个动作时长开始', () => {
    const f = landingFraction((p) => 1 - Math.pow(1 - p, 3));
    assert.ok(Math.abs(f - 0.7286) < 0.002, `f=${f}`);
    assert.ok(Math.abs(landOn(10, 0.4) - (10 - 0.4 * f)) < 1e-9);
  });

  it('drawLanding 在拍点那一刻已到位（≥0.98），拍点之前还没到位', () => {
    assert.ok(drawLanding(10, 10, 0.5) >= 0.98);
    assert.ok(drawLanding(10 - 0.05, 10, 0.5) < 0.98);
  });

  it('线性缓动的落点就是终点；两头缓的缓动落点更靠后', () => {
    assert.equal(landingFraction((p) => p, 1), 1);
    assert.ok(landingFraction(easeInOutCubic) > landingFraction((p) => 1 - Math.pow(1 - p, 3)));
  });

  it('弹簧的冲击点是第一次越过 1 的时刻，早于完全稳定', () => {
    const s = (t: number) => spring(t, { stiffness: 170, damping: 12 });
    const hit = springImpactSec(s);
    assert.ok(hit > 0.05 && hit < 0.5, `hit=${hit}`);
    assert.ok(s(hit) >= 1 && s(hit - 0.01) < 1);
  });

  it('时长同样不短于 MIN_ACTION_SEC', () => {
    assert.ok(Math.abs(landOn(5, 0.01) - (5 - MIN_ACTION_SEC * landingFraction((p) => 1 - Math.pow(1 - p, 3)))) < 1e-9);
  });
});
