import fs from 'node:fs';
import path from 'node:path';
import {
  careTrackFrames,
  careTrackSig,
  CARE_TRACK_FPS,
  CARE_TRACK_FRAMES,
} from '../../src/films/loomcare-demo/scenes/careRig.js';

/**
 * 导出第五幕机位轨迹 (对标 §8 第 2 步)
 * 采样全部来自 careRig 这一个单源，track.sig 等于当前机位签名。
 * 只改了一段机位时，比对新旧 track.json 可以只重渲变了的 k 区间。
 */
export async function exportPhoneTrack(filmId = 'loomcare-demo'): Promise<string> {
  if (filmId !== 'loomcare-demo') {
    throw new Error(
      `[blender] 影片 '${filmId}' 没有 3D 机身幕；目前只有 loomcare-demo 的第五幕走 Blender 管线`
    );
  }

  const projectRoot = process.cwd();
  const outDir = path.join(projectRoot, 'out', filmId, 'blender');
  fs.mkdirSync(outDir, { recursive: true });

  const frames = careTrackFrames();
  const sig = careTrackSig();
  const trackFile = path.join(outDir, 'track.json');

  // 比对旧轨迹，算出需要重渲的 k 区间
  let changedRanges: [number, number][] = [];
  if (fs.existsSync(trackFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(trackFile, 'utf-8'));
      changedRanges = diffTrackRanges(prev.frames ?? [], frames);
    } catch {
      changedRanges = [[0, CARE_TRACK_FRAMES]];
    }
  }

  const output = {
    filmId,
    scene: 'care',
    fps: CARE_TRACK_FPS,
    totalFrames: CARE_TRACK_FRAMES,
    sig,
    changedRanges,
    frames,
  };

  const tmp = `${trackFile}.tmp.${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(output, null, 2));
  fs.renameSync(tmp, trackFile);

  console.log(
    `[vw blender] 轨迹导出成功: ${trackFile} (帧数 ${frames.length}, 签名 ${sig}` +
      (changedRanges.length ? `, 变动区间 ${JSON.stringify(changedRanges)}` : '') +
      ')'
  );

  return trackFile;
}

/** 找出姿态有实质变化的 k 区间（精度 1e-6，与签名口径一致） */
export function diffTrackRanges(prev: any[], cur: any[]): [number, number][] {
  const ranges: [number, number][] = [];
  let start: number | null = null;
  const same = (a: any, b: any) =>
    a &&
    b &&
    JSON.stringify(round6(a.phone)) === JSON.stringify(round6(b.phone)) &&
    JSON.stringify(round6(a.camera)) === JSON.stringify(round6(b.camera)) &&
    JSON.stringify(round6(a.screenQuad)) === JSON.stringify(round6(b.screenQuad));

  for (let k = 0; k < cur.length; k++) {
    const changed = !same(prev[k], cur[k]);
    if (changed && start === null) start = k;
    if (!changed && start !== null) {
      ranges.push([start, k - 1]);
      start = null;
    }
  }
  if (start !== null) ranges.push([start, cur.length - 1]);
  return ranges;
}

function round6(v: any): any {
  if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(round6);
  if (v && typeof v === 'object') {
    const out: any = {};
    for (const k of Object.keys(v).sort()) out[k] = round6(v[k]);
    return out;
  }
  return v;
}
