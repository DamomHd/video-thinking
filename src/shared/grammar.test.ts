import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileShots, validateShots, Shot } from './grammar.js';
import { evalCamera } from './camera.js';
import { frameRect } from './shot.js';
import fs from 'node:fs';
import path from 'node:path';

// 真实片子的回归（只读，不改片子）：anlan-brief 是业务片，被 .gitignore 排除、只在作者本机，所以片子不在时跳过
const BRIEF_DIR = path.join(process.cwd(), 'src', 'films', 'anlan-brief');

describe('镜头清单编译器 (shared/grammar)', () => {
  it('用镜头清单逐个写出 anlan-brief 的镜头线，编译结果与片子里手写的逐帧一致', { skip: !fs.existsSync(BRIEF_DIR) && '本机没有 anlan-brief（业务片，不进仓库）' }, async () => {
    // 用变量路径动态引入：片子不在时类型检查也不会去解析它
    const layoutPath = '../films/anlan-brief/world/layout.js';
    const timelinePath = '../films/anlan-brief/timeline.js';
    const { RAIL, CAMERA_MOVES, REGION, W, H, SWITCH_X0, K } = await import(layoutPath);
    const { FILM_PLAN } = await import(timelinePath);
    const S = (id: string) => FILM_PLAN.sceneStart(id);
    const region = (id: keyof typeof REGION) => ({ x: REGION[id], y: 0, w: W, h: H });
    const push = { kind: 'push' as const, amount: 0.985 };
    const ids = ['open', 'why', 'scope', 'plan', 'window', 'gates'] as const;
    const shots: Shot[] = [
      { id: '道岔特写', frame: { x: SWITCH_X0 - 180, y: 560, w: 760, h: 428 }, at: 0, hold: push, out: { kind: 'glide', start: 0.9 } },
      ...ids.map((id, i): Shot => ({
        id,
        frame: region(id),
        at: i === 0 ? 2.8 : S(id) + 0.6,
        hold: push,
        out: i < ids.length - 1
          ? { kind: 'arc', start: S(ids[i + 1]) - 0.8, lift: 1.2 }
          : { kind: 'glide', start: K.overview - 0.2 },
      })),
      { id: '全景', frame: frameRect({ x: REGION.open - 300, y: -1600, w: REGION.gates + W + 600, h: 6200 }, { margin: 0.02 }), at: K.overview + 1.6 },
    ];
    const cam = compileShots(shots);
    for (let t = 0; t <= FILM_PLAN.totalSeconds; t += 1 / 30) {
      const a = evalCamera(RAIL, t);
      const b = evalCamera(cam.keys, t);
      assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-9, `t=${t.toFixed(3)}`);
    }
    assert.deepEqual(cam.moves.map((m) => [m.from, m.to]), CAMERA_MOVES);
    assert.deepEqual(cam.cuts, []);
  });

  const R = (x: number) => ({ x, y: 0, w: 1920, h: 1080 });

  it('四种过渡：glide 两头缓、arc 中途拉远、whip 中段一闪而过、cut 到点直接跳', () => {
    const at = (kind: 'glide' | 'arc' | 'whip' | 'cut') => {
      const shots: Shot[] = [
        { frame: R(0), at: 0, out: { kind, start: 1 } },
        { frame: R(3000), at: kind === 'cut' ? 1 : 2 },
      ];
      return compileShots(shots);
    };
    const glide = at('glide');
    assert.ok(evalCamera(glide.keys, 1.5).z === 1, 'glide 不拉远');
    assert.ok(evalCamera(at('arc').keys, 1.5).z > 1.2, 'arc 中途拉远');
    // whip：前 25% 时间几乎没动，中段跨过大半距离
    const w = at('whip');
    assert.ok(evalCamera(w.keys, 1.25).x < 100);
    assert.ok(evalCamera(w.keys, 1.6).x > 2000);
    const c = at('cut');
    assert.equal(Math.round(evalCamera(c.keys, 0.999).x), 0);
    assert.equal(Math.round(evalCamera(c.keys, 1.001).x), 3000);
    assert.deepEqual(c.cuts, [1]);
    assert.deepEqual(c.moves, []);
  });

  it('三种停留：still 不动、push 缓推、drift 慢漂', () => {
    const one = (hold: Shot['hold']) => compileShots([{ frame: R(0), at: 0, hold, out: { kind: 'cut', start: 4 } }, { frame: R(5000), at: 4 }]);
    assert.equal(evalCamera(one({ kind: 'still' }).keys, 3).z, 1);
    assert.ok(evalCamera(one({ kind: 'push', amount: 0.9 }).keys, 3).z < 1);
    assert.ok(evalCamera(one({ kind: 'drift', dx: 200, dy: 0 }).keys, 3).x > 100);
  });

  it('清单不自洽时报出具体问题，并拒绝编译', () => {
    const bad: Shot[] = [
      { id: 'a', frame: R(0), at: 2, out: { kind: 'glide', start: 1 } },
      { id: 'b', frame: R(3000), at: 0.5 },
    ];
    const errs = validateShots(bad);
    assert.ok(errs.some((e) => e.includes('早于到位')));
    assert.ok(errs.some((e) => e.includes('不晚于起步')));
    assert.throws(() => compileShots(bad), /不自洽/);
    assert.ok(validateShots([{ frame: R(0), at: 0 }, { frame: R(1), at: 1 }]).some((e) => e.includes('没写 out')));
  });
});
