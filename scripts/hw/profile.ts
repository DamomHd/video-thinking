import { execSync } from 'node:child_process';
import os from 'node:os';

/**
 * 硬件档位 (Hardware Profile)
 *
 * architecture.html 的数字都是在 M4 Pro 上量的（Blender 约 2.1s/帧、4K 超采样、并发 6）。
 * 同一套参数搬到 Intel Mac 上：Cycles 没有可用的 Metal GPU 只能 CPU 跑（实测 11–20s/帧），
 * 4K 截帧把核显显存吃满。所以默认值不能写死，按机器分档：
 *
 *   apple  Apple Silicon：Cycles 走 Metal GPU、高采样；成片 2× 超采样；机身默认用 Blender 帧序列
 *   intel  Intel Mac：Cycles 走 CPU、低采样 + 降噪；成片不开超采样；机身默认用 three.js 实时机身，
 *          Blender 长任务要显式确认
 *   other  其它平台：按 intel 的保守口径
 *
 * 档位只决定**缺省值**：命令行参数和环境变量（VW_SSAA_SCALE、BLENDER_SAMPLES、--concurrency）永远优先。
 * VW_HW_TIER=apple|intel 可以强制档位（在 Intel 上预演 M 系列的参数，或反过来）。
 */

export type HwTier = 'apple' | 'intel' | 'other';

export interface HwInfo {
  tier: HwTier;
  arch: string;
  cpus: number;
  memGB: number;
  gpu: string;
  /** 是否被 VW_HW_TIER 强制 */
  forced: boolean;
}

export interface HwProfile {
  info: HwInfo;
  label: string;
  render: {
    /** Remotion 并发标签页数 */
    concurrency: number;
    /** 成片超采样倍数（1 = 不开） */
    ssaa: number;
  };
  blender: {
    /** 期望的 Cycles 设备；phone.py 仍会实测，GPU 不可用时退回 CPU */
    device: 'GPU' | 'CPU';
    samples: number;
    /** 单帧估时（秒），用于开渲前报总时长 */
    secPerFrame: number;
    /** 超过这个总时长（分钟）的 Blender 任务要 --accept-slow 才开始 */
    confirmAboveMin: number;
  };
  /** 机身缺省走哪条：Blender 帧序列，还是 three.js 实时机身 */
  phoneBody: 'blender' | 'three';
}

function sh(cmd: string): string {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export function detectHardware(env: NodeJS.ProcessEnv = process.env): HwInfo {
  const forcedTier = env.VW_HW_TIER as HwTier | undefined;
  const arch = os.arch();
  const isMac = process.platform === 'darwin';
  // Rosetta 下 node 报 x64，但 hw.optional.arm64 仍为 1 —— 以硬件为准
  const armHw = isMac && sh('sysctl -n hw.optional.arm64') === '1';
  const gpu = isMac
    ? sh("system_profiler SPDisplaysDataType 2>/dev/null | awk -F': ' '/Chipset Model/{print $2; exit}'")
    : '';
  const detected: HwTier = isMac ? (armHw || arch === 'arm64' ? 'apple' : 'intel') : 'other';
  const tier = forcedTier === 'apple' || forcedTier === 'intel' || forcedTier === 'other' ? forcedTier : detected;
  return {
    tier,
    arch: armHw ? 'arm64' : arch,
    cpus: os.cpus().length,
    memGB: Math.round(os.totalmem() / 2 ** 30),
    gpu: gpu || 'unknown',
    forced: Boolean(forcedTier) && forcedTier === tier && forcedTier !== detected,
  };
}

/** 纯函数：硬件信息 → 缺省参数。单独导出便于测试 */
export function profileFor(info: HwInfo): HwProfile {
  if (info.tier === 'apple') {
    return {
      info,
      label: 'Apple Silicon（高档：GPU Cycles + 2× 超采样 + Blender 机身）',
      render: {
        concurrency: Math.max(4, Math.min(8, info.cpus - 2)),
        // 4K 截帧每个标签页要多吃约 4 倍显存；统一内存 16GB 以下保守一点
        ssaa: info.memGB >= 16 ? 2 : 1,
      },
      blender: { device: 'GPU', samples: 128, secPerFrame: 2.5, confirmAboveMin: 240 },
      phoneBody: 'blender',
    };
  }
  return {
    info,
    label: info.tier === 'intel' ? 'Intel Mac（降档：CPU Cycles + 不开超采样 + three.js 机身）' : '其它平台（按保守口径）',
    render: {
      concurrency: Math.max(2, Math.min(4, Math.floor(info.cpus / 2))),
      ssaa: 1,
    },
    blender: { device: 'CPU', samples: 32, secPerFrame: 14, confirmAboveMin: 30 },
    phoneBody: 'three',
  };
}

let cached: HwProfile | null = null;
export function hwProfile(): HwProfile {
  if (!cached) cached = profileFor(detectHardware());
  return cached;
}

export function formatProfile(p: HwProfile): string {
  const i = p.info;
  return [
    `档位      ${i.tier}${i.forced ? '（VW_HW_TIER 强制）' : ''} —— ${p.label}`,
    `硬件      ${i.arch} · ${i.cpus} 线程 · ${i.memGB}GB · ${i.gpu}`,
    `出片      并发 ${p.render.concurrency} · 成片超采样 ${p.render.ssaa}×`,
    `Blender   ${p.blender.device} · ${p.blender.samples} 采样 · 约 ${p.blender.secPerFrame}s/帧` +
      ` · 超过 ${p.blender.confirmAboveMin} 分钟的任务需 --accept-slow`,
    `机身      缺省 ${p.phoneBody === 'blender' ? 'Blender 帧序列（签名对不上自动退回 three.js）' : 'three.js 实时机身（Blender 帧齐全且签名对得上时仍会启用）'}`,
  ].join('\n');
}
