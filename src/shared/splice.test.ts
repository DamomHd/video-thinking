import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spliceMask, spliceStyleAt, seamVerdict } from './splice.js';
import { compareFrames } from '../../scripts/hybrid/splice.js';

/**
 * 代码动画 × AI 视频拼接：遮罩过渡的端点与软边、片段出入场、接缝判定。
 */
describe('拼接过渡 (shared/splice)', () => {
  it('fade：0 全透明、1 全显', () => {
    assert.equal(spliceMask({ kind: 'fade', durSec: 1 }, 0).opacity, 0);
    assert.equal(spliceMask({ kind: 'fade', durSec: 1 }, 1).opacity, 1);
  });

  it('iris / wipe：两端不遮罩、中途是带软边的渐变遮罩', () => {
    for (const tr of [{ kind: 'iris' as const, durSec: 1, cx: 0.3, cy: 0.6 }, { kind: 'wipe' as const, durSec: 1, angleDeg: 90 }]) {
      assert.equal(spliceMask(tr, 0).visible, false);
      const end = spliceMask(tr, 1);
      assert.equal(end.maskImage, undefined);
      const mid = spliceMask(tr, 0.5);
      assert.match(mid.maskImage!, /gradient\(.*#000 [\d.]+%, transparent [\d.]+%\)/);
      const [inner, outer] = mid.maskImage!.match(/[\d.]+%/g)!.slice(-2).map(parseFloat);
      assert.ok(outer > inner, '应有软边');
    }
    assert.match(spliceMask({ kind: 'iris', durSec: 1, cx: 0.3, cy: 0.6 }, 0.5).maskImage!, /at 30\.00% 60\.00%/);
  });

  it('片段之外不可见；入场用入场过渡，出场是反向', () => {
    const tin = { kind: 'fade' as const, durSec: 0.5 };
    const tout = { kind: 'fade' as const, durSec: 0.5 };
    assert.equal(spliceStyleAt(-0.1, 4, tin, tout).visible, false);
    assert.equal(spliceStyleAt(4, 4, tin, tout).visible, false);
    assert.ok(spliceStyleAt(0.1, 4, tin, tout).opacity < 0.5);
    assert.equal(spliceStyleAt(2, 4, tin, tout).opacity, 1);
    assert.ok(spliceStyleAt(3.9, 4, tin, tout).opacity < 0.5);
    assert.equal(spliceStyleAt(0, 4).opacity, 1, '缺省硬切：第一帧就全显');
  });

  it('接缝判定分三档；亮度差大时提示调色', () => {
    assert.equal(seamVerdict(0.95, 0).level, 'ok');
    assert.equal(seamVerdict(0.8, 0).level, 'mask');
    assert.equal(seamVerdict(0.5, 0).level, 'mismatch');
    assert.match(seamVerdict(0.95, 30).note, /调色/);
  });
});

describe('接缝比对 (hybrid/compareFrames)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seam-'));
  const png = (name: string, src: string) => {
    const f = path.join(dir, name);
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', src, '-frames:v', '1', f]);
    return f;
  };
  const a = png('a.png', 'testsrc2=s=640x360:r=1');
  const same = png('same.png', 'testsrc2=s=640x360:r=1');
  // 噪点图和测试图结构毫无关系（分形图和彩条都有大片平坦区，SSIM 反而有 0.7）
  const other = png('other.png', 'nullsrc=s=640x360,geq=lum=random(1)*255:cb=128:cr=128');
  const dark = path.join(dir, 'dark.png');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a, '-vf', 'eq=brightness=-0.25', dark]);

  it('同一帧 SSIM≈1，换了画面 SSIM 很低', () => {
    assert.ok(compareFrames(a, same).ssim > 0.99);
    assert.ok(compareFrames(a, other).ssim < 0.3);
  });

  it('只调暗：亮度差为负且明显', () => {
    assert.ok(compareFrames(a, dark).lumaDelta < -20);
  });
});
