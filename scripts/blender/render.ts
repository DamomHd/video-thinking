import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exportPhoneTrack } from './phone-track.js';
import { careTrackSig } from '../../src/films/loomcare-demo/scenes/careRig.js';
import { hwProfile } from '../hw/profile.js';

export interface BlenderRenderOptions {
  filmId: string;
  force?: boolean;
  /** 预计时长超过硬件档位上限时，必须显式确认才开渲 */
  acceptSlow?: boolean;
}

export interface BlenderRenderResult {
  success: boolean;
  /** 清单里写的 complete：只有帧齐全且签名对得上才为真 */
  complete: boolean;
  sig: string;
  expectedFrames: number;
  renderedFrames: number;
  blenderFound: boolean;
  manifestPath: string;
}

/**
 * 驱动 Blender 后台 Cycles 预渲染 (对标 §8 第 3、4 步)
 * 关键不变量：phoneBody.json 的 complete 由「盘上真实帧数 == 期望帧数」决定，
 * 不是无条件写 true —— 否则渲染端会去加载不存在的帧，而降级路径永远不会触发。
 */
export async function runBlenderRender(options: BlenderRenderOptions): Promise<BlenderRenderResult> {
  const { filmId, force = false } = options;
  const projectRoot = process.cwd();

  const trackPath = await exportPhoneTrack(filmId);
  const trackData = JSON.parse(fs.readFileSync(trackPath, 'utf-8'));
  const sig: string = trackData.sig;
  const expectedFrames: number = trackData.totalFrames + 1;

  const framesDir = path.join(projectRoot, 'public', 'blender', filmId, 'phone');
  fs.mkdirSync(framesDir, { recursive: true });

  const manifestPath = path.join(projectRoot, 'src', 'films', filmId, 'three', 'phoneBody.json');
  const pyScript = path.join(projectRoot, 'blender', 'loomcare', 'phone.py');

  console.log(`\n========================================`);
  console.log(`[vw blender render] 机身预渲染: 影片=${filmId}`);
  console.log(`  - 轨迹签名: ${sig}`);
  console.log(`  - 期望帧数: ${expectedFrames}`);
  console.log(`========================================\n`);

  let blenderFound = false;
  const candidates = [
    process.env.BLENDER_BIN,
    '/Applications/Blender.app/Contents/MacOS/Blender',
    'blender',
  ].filter(Boolean) as string[];
  let blenderBin = '';
  for (const bin of candidates) {
    try {
      execSync(`${bin.includes('/') ? `test -x "${bin}"` : `which ${bin}`}`, { stdio: 'ignore' });
      blenderBin = bin;
      blenderFound = true;
      break;
    } catch {
      /* 继续找下一个候选 */
    }
  }

  // 按硬件档位定采样数，并在开渲前报预计时长（Intel 上一条机身序列是几个小时的事）
  const hw = hwProfile();
  const samples = Number(process.env.BLENDER_SAMPLES ?? hw.blender.samples);
  const todo = force ? expectedFrames : expectedFrames - countFrames(framesDir, expectedFrames);
  const etaMin = Math.round((todo * hw.blender.secPerFrame * (samples / hw.blender.samples)) / 60);
  console.log(
    `[vw blender] 硬件档位 ${hw.info.tier}：${hw.blender.device} · ${samples} 采样 · 待渲 ${todo} 帧 · 预计约 ${etaMin} 分钟`
  );
  const slowSkipped = blenderFound && todo > 0 && etaMin > hw.blender.confirmAboveMin && !options.acceptSlow;
  if (slowSkipped) {
    console.log(
      `[vw blender] 预计 ${etaMin} 分钟，超过本档位上限 ${hw.blender.confirmAboveMin} 分钟，未开渲。` +
        `\n            确认要渲就加 --accept-slow（已渲的帧会跳过，可随时中断续渲）；` +
        `\n            不渲也没关系：清单不齐时 PhoneShot 用 three.js 实时机身（body3d），屏幕照样对齐。`
    );
  }

  if (blenderFound && !slowSkipped) {
    console.log(`[vw blender] 使用 Blender: ${blenderBin}`);
    // 没有机身场景就按 PHONE_SPECS 程序化建一个（尺寸单源、无外部模型许可问题）
    const sceneBlend = path.join(projectRoot, 'public', 'models', 'phone.blend');
    if (!process.env.BLENDER_PHONE_BLEND && !fs.existsSync(sceneBlend)) {
      console.log(`[vw blender] 未找到机身场景，程序化建模 → ${path.relative(projectRoot, sceneBlend)}`);
      execSync(
        `"${blenderBin}" -b -Y --factory-startup -P "${path.join(projectRoot, 'blender', 'loomcare', 'build_phone.py')}"`,
        { stdio: 'inherit' }
      );
    }
    try {
      // -Y 不执行 .blend 内嵌脚本；--factory-startup 忽略用户配置
      execSync(
        `"${blenderBin}" -b -Y --factory-startup -P "${pyScript}" -- "${filmId}"${force ? ' --force' : ''}`,
        { stdio: 'inherit', env: { ...process.env, BLENDER_SAMPLES: String(samples) } }
      );
    } catch (e: any) {
      console.warn(`[vw blender] Blender 执行失败: ${e.message}`);
    }
  } else {
    console.log(`[vw blender] 未检测到 Blender 可执行程序（可用 BLENDER_BIN 指定）。`);
  }

  // 真实清点盘上的帧
  const renderedFrames = countFrames(framesDir, expectedFrames);
  // 清单校验（§8 第 4 步）：帧齐全，而且轨迹签名等于**此刻**机位单源算出的签名
  const currentSig = careTrackSig();
  if (currentSig !== sig) {
    console.log(`[vw blender] ⚠ 轨迹签名 ${sig} ≠ 当前机位签名 ${currentSig}：机位在导出后改过，先重跑 vw blender track`);
  }
  const complete = renderedFrames >= expectedFrames && currentSig === sig;
  const mb = Math.round(dirBytes(framesDir) / 1e5) / 10;

  const manifest = {
    filmId,
    complete,
    sig,
    frames: renderedFrames,
    expectedFrames,
    fps: trackData.fps,
    mb,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  if (complete) {
    console.log(`[vw blender] ✓ 帧序列齐全 (${renderedFrames}/${expectedFrames})，签名 ${sig}，渲染端将启用 Blender 机身。`);
  } else {
    console.log(
      `[vw blender] ⚠ 帧序列不齐 (${renderedFrames}/${expectedFrames})，清单 complete=false。` +
        `\n            渲染端会按「签名兜底」降级为程序化机身，屏幕和机身不会错位。`
    );
  }

  return {
    success: true,
    complete,
    sig,
    expectedFrames,
    renderedFrames,
    blenderFound,
    manifestPath,
  };
}

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0);
}

/** 数 0000.webp … 的连续帧数（只认连续，缺一帧就算不齐） */
export function countFrames(dir: string, expected: number): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (let k = 0; k < expected; k++) {
    const f = path.join(dir, `${String(k).padStart(4, '0')}.webp`);
    if (!fs.existsSync(f) || fs.statSync(f).size === 0) break;
    n++;
  }
  return n;
}
