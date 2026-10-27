/**
 * 弹性区与时间映射守门
 * 对标 architecture.html §19 的 check.mts 规则：
 *   zones 首尾相接、盖满全片；
 *   非恒等映射时：每区位移不超上限、刚性区位移为 0、节点单调。
 */

import { ElasticZone, SyncFile } from '../../src/shared/types.js';
import { ZONE_SPECS, validateZones } from '../sync/zones.js';

export interface ZoneGuardReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  zoneCount: number;
  identity: boolean;
  maxRatio: number;
}

export function checkZonesAndWarp(
  zones: ElasticZone[],
  totalSec: number,
  sync: SyncFile | undefined
): ZoneGuardReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. 连续性
  const cont = validateZones(zones, totalSec);
  errors.push(...cont.errors);

  const knots = sync?.knots ?? [];
  const identity =
    knots.length < 2 || knots.every(([score, film]) => Math.abs(score - film) < 1e-4);

  let maxRatio = 0;

  if (!identity) {
    // 2. 节点单调（两个方向都必须严格不减）
    for (let i = 1; i < knots.length; i++) {
      if (knots[i][0] < knots[i - 1][0] - 1e-6) {
        errors.push(`sync.knots 乐谱时间不单调: ${knots[i - 1][0]} → ${knots[i][0]}`);
      }
      if (knots[i][1] < knots[i - 1][1] - 1e-6) {
        errors.push(`sync.knots 放映时间不单调: ${knots[i - 1][1]} → ${knots[i][1]}`);
      }
    }

    // 3. 逐区位移：刚性区必须为 0，弹性区不超上限
    const sorted = [...zones].sort((a, b) => a.fromSec - b.fromSec);
    for (const z of sorted) {
      const spec = ZONE_SPECS[z.kind];
      const d1 = shiftAt(knots, z.fromSec);
      const d2 = shiftAt(knots, z.toSec);
      const delta = d2 - d1;
      const len = Math.max(1e-6, z.toSec - z.fromSec);
      const ratio = Math.abs(delta) / len;
      maxRatio = Math.max(maxRatio, ratio);

      if (spec.elasticity <= 0) {
        if (Math.abs(delta) > 1 / 60) {
          errors.push(
            `刚性区 '${z.name}' (${z.kind}) 出现位移 ${(delta * 1000).toFixed(0)}ms —— 刚性区必须一帧不动`
          );
        }
      } else {
        if (ratio > spec.ratioCap + 1e-6) {
          errors.push(
            `弹性区 '${z.name}' 形变比率 ${(ratio * 100).toFixed(2)}% 超过 ${z.kind} 档上限 ${(spec.ratioCap * 100).toFixed(0)}%`
          );
        }
        const cap = delta > 0 ? spec.maxPlusSec : spec.maxMinusSec;
        if (Math.abs(delta) > cap + 1e-6) {
          warnings.push(
            `弹性区 '${z.name}' 位移 ${delta.toFixed(3)}s 超过 ${z.kind} 档绝对上限 ${cap}s（可能是子区份额折算后的累计）`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    zoneCount: zones.length,
    identity,
    maxRatio: Math.round(maxRatio * 10000) / 10000,
  };
}

/** 在某个乐谱时刻的累计位移（放映时间 − 乐谱时间），按 knots 线性插值 */
export function shiftAt(knots: [number, number][], scoreSec: number): number {
  if (knots.length === 0) return 0;
  const sorted = [...knots].sort((a, b) => a[0] - b[0]);
  if (scoreSec <= sorted[0][0]) return sorted[0][1] - sorted[0][0];
  const last = sorted[sorted.length - 1];
  if (scoreSec >= last[0]) return last[1] - last[0];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [s0, f0] = sorted[i];
    const [s1, f1] = sorted[i + 1];
    if (scoreSec >= s0 && scoreSec <= s1) {
      const p = s1 - s0 > 1e-9 ? (scoreSec - s0) / (s1 - s0) : 0;
      const film = f0 + (f1 - f0) * p;
      return film - scoreSec;
    }
  }
  return 0;
}
