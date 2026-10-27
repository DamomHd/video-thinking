import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { planFlight, flightPose, flightTrack, flightSig, trapezoid, FlightWaypoint } from './flight.js';

/**
 * 3D 漫游运镜：匀速（按弧长）、梯形加减速、停留、视线朝前、侧倾有上限、确定性。
 */
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 一条有疏有密的路线：前两个点很近、后面很远 —— 按曲线参数插值会在这里忽快忽慢
const WP: FlightWaypoint[] = [
  { pos: [0, 2, 0] },
  { pos: [1, 2, -2] },
  { pos: [20, 3, -10], hold: 1.5 },
  { pos: [40, 2, 10] },
  { pos: [45, 1, 30], fov: 25 },
];

describe('漫游运镜 (shared/flight)', () => {
  it('梯形速度：0→1 单调、两端为 0 和 1、中段匀速', () => {
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const v = trapezoid(p, 0.25);
      assert.ok(v >= prev - 1e-12);
      prev = v;
    }
    assert.equal(trapezoid(0), 0);
    assert.ok(Math.abs(trapezoid(1) - 1) < 1e-12);
    const d1 = trapezoid(0.45) - trapezoid(0.4);
    const d2 = trapezoid(0.65) - trapezoid(0.6);
    assert.ok(Math.abs(d1 - d2) < 1e-12);
  });

  it('按弧长匀速：巡航段里相等时间走相等距离（控制点疏密不影响速度）', () => {
    const plan = planFlight([WP[0], WP[1], WP[3], WP[4]], { moveSec: 10 });
    const steps: number[] = [];
    for (let t = 3; t < 7; t += 0.25) steps.push(dist(flightPose(plan, t).pos, flightPose(plan, t + 0.25).pos));
    const max = Math.max(...steps);
    const min = Math.min(...steps);
    assert.ok((max - min) / max < 0.03, `巡航段步长 ${min.toFixed(3)}–${max.toFixed(3)}`);
  });

  it('起止点准确；停留点那段时间位置几乎不动（只有缓推）', () => {
    const plan = planFlight(WP, { moveSec: 12, start: 1 });
    assert.ok(dist(flightPose(plan, 1).pos, WP[0].pos) < 1e-6);
    assert.ok(dist(flightPose(plan, 1 + plan.totalSec).pos, WP[4].pos) < 1e-6);
    const hold = plan.spans.find((s) => s.kind === 'hold')!;
    assert.ok(Math.abs(hold.t1 - hold.t0 - 1.5) < 1e-9);
    const a = flightPose(plan, hold.t0);
    const b = flightPose(plan, hold.t1);
    assert.ok(dist(a.pos, WP[2].pos) < 1e-6, '到站时在途经点上');
    assert.ok(dist(a.pos, b.pos) < dist(WP[1].pos, WP[2].pos) * 0.05, '停留期间只缓推一点点');
  });

  it('到站前减速、离站后加速（不是匀速撞进停留点）', () => {
    const plan = planFlight(WP, { moveSec: 12 });
    const hold = plan.spans.find((s) => s.kind === 'hold')!;
    const near = dist(flightPose(plan, hold.t0 - 0.1).pos, flightPose(plan, hold.t0).pos);
    const mid = plan.spans.find((s) => s.kind === 'move' && s.t1 <= hold.t0)!;
    const tm = (mid.t0 + mid.t1) / 2;
    const cruise = dist(flightPose(plan, tm).pos, flightPose(plan, tm + 0.1).pos);
    assert.ok(near < cruise * 0.5, `到站前 ${near.toFixed(3)} vs 巡航 ${cruise.toFixed(3)}`);
  });

  it('视线朝前：视线点在前进方向上', () => {
    const plan = planFlight(WP, { moveSec: 12 });
    const a = flightPose(plan, 2);
    const b = flightPose(plan, 2.1);
    const fwd = [b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]];
    const look = [a.look[0] - a.pos[0], a.look[1] - a.pos[1], a.look[2] - a.pos[2]];
    assert.ok(fwd[0] * look[0] + fwd[1] * look[1] + fwd[2] * look[2] > 0);
  });

  it('侧倾有上限，停住时不侧倾；fov 在途经点之间过渡到 25', () => {
    const plan = planFlight(WP, { moveSec: 8, bank: 200, maxBankDeg: 10 });
    for (let t = 0; t <= plan.totalSec; t += 0.1) assert.ok(Math.abs(flightPose(plan, t).roll) <= (10 * Math.PI) / 180 + 1e-9);
    const hold = plan.spans.find((s) => s.kind === 'hold')!;
    assert.equal(flightPose(plan, (hold.t0 + hold.t1) / 2).roll, 0);
    assert.ok(Math.abs(flightPose(plan, plan.totalSec).fov - 25) < 1e-9);
    assert.equal(flightPose(plan, 0).fov, 35);
  });

  it('确定性 + 签名：同一路线签名相同，改一个点签名就变', () => {
    const t1 = flightTrack(planFlight(WP, { moveSec: 6 }), 30);
    const t2 = flightTrack(planFlight(WP, { moveSec: 6 }), 30);
    assert.equal(flightSig(t1), flightSig(t2));
    const moved = WP.map((w, i) => (i === 3 ? { ...w, pos: [40, 2.5, 10] as [number, number, number] } : w));
    assert.notEqual(flightSig(t1), flightSig(flightTrack(planFlight(moved, { moveSec: 6 }), 30)));
  });
});
