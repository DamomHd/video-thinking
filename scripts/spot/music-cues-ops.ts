import { MusicFile, MusicCue, TimeRef } from '../../src/shared/types.js';
import { DEFAULT_MUSIC_VOLUME } from '../../src/shared/audio-math.js';

export type CueJoinKind = 'butt' | 'gap' | 'crossfade' | 'bridge' | 'cut';

export interface JoinSpec {
  kind: CueJoinKind;
  gapSec?: number;
  overlapSec?: number;
}

export type CueOp =
  | { kind: 'upgrade' }
  | { kind: 'restore'; cues: MusicCue[] }
  | { kind: 'split'; cueId: string; atSec: number; newCueId?: string; label?: string }
  | { kind: 'merge'; cueIdA: string; cueIdB: string }
  | { kind: 'add'; cue: Partial<MusicCue> & { in: TimeRef; out: TimeRef; label: string } }
  | { kind: 'remove'; cueId: string }
  | { kind: 'move'; cueId: string; edge: 'in' | 'out'; newSec: number; newRef?: string }
  | { kind: 'join'; cueId: string; joinSpec: JoinSpec }
  | { kind: 'set'; cueId: string; patch: Partial<MusicCue> };

/**
 * 确保数据结构兼容 MusicFile v2
 */
export function ensureV2(data: any): MusicFile {
  if (data && data.version === 2 && Array.isArray(data.cues)) {
    return JSON.parse(JSON.stringify(data));
  }

  // 若为旧版单曲结构或无版本结构，自动升级为 v2 单段 (c1)
  const singleTrack = data?.track || undefined;
  const dur = singleTrack?.durationSec || 30.0;
  return {
    version: 2,
    cues: [
      {
        id: 'c1',
        label: '正片主配乐',
        in: { ref: 'SC.prologue', sec: 0 },
        out: { ref: 'SC.end', sec: dur },
        brief: '正片配乐底轨',
        startFromSec: data?.startFromSec || 0,
        volume: data?.volume ?? DEFAULT_MUSIC_VOLUME,
        fadeInSec: data?.fadeInSec ?? 1.0,
        fadeOutSec: data?.fadeOutSec ?? 1.5,
        track: singleTrack,
      },
    ],
  };
}

/**
 * 执行多段配乐操作状态机纯函数
 */
export function applyCueOp(manifestInput: any, op: CueOp): MusicFile {
  const manifest = ensureV2(manifestInput);
  const cues = manifest.cues;

  switch (op.kind) {
    case 'upgrade': {
      return manifest;
    }

    case 'restore': {
      if (!Array.isArray(op.cues) || op.cues.length === 0) {
        throw new Error('[music-cues-ops] restore 失败: cues 列表不能为空');
      }
      manifest.cues = JSON.parse(JSON.stringify(op.cues));
      return manifest;
    }

    case 'split': {
      const idx = cues.findIndex(c => c.id === op.cueId);
      if (idx === -1) {
        throw new Error(`[music-cues-ops] split 失败: 未找到配乐段 ${op.cueId}`);
      }
      const target = cues[idx];
      if (op.atSec <= target.in.sec + 0.1 || op.atSec >= target.out.sec - 0.1) {
        throw new Error(
          `[music-cues-ops] split 失败: 切割点 ${op.atSec.toFixed(2)}s 必须在 (${target.in.sec.toFixed(2)}s, ${target.out.sec.toFixed(2)}s) 区间内`
        );
      }

      const origOut = { ...target.out };
      const origFadeOut = target.fadeOutSec;
      const atSec = op.atSec;

      // 生成新 id
      let newId = op.newCueId;
      if (!newId) {
        let n = cues.length + 1;
        while (cues.some(c => c.id === `c${n}`)) {
          n++;
        }
        newId = `c${n}`;
      }

      // 调整前半段出点
      target.out = { ref: `split@${atSec.toFixed(2)}s`, sec: atSec };
      target.fadeOutSec = Math.min(0.5, (atSec - target.in.sec) / 2);

      // 构建后半段
      const elapsed = atSec - target.in.sec;
      const newCue: MusicCue = {
        id: newId,
        label: op.label || `${target.label} (后半段)`,
        in: { ref: `split@${atSec.toFixed(2)}s`, sec: atSec },
        out: origOut,
        brief: target.brief,
        startFromSec: (target.startFromSec || 0) + elapsed,
        volume: target.volume,
        fadeInSec: Math.min(0.5, (origOut.sec - atSec) / 2),
        fadeOutSec: origFadeOut,
        track: target.track ? { ...target.track } : undefined,
        join: { kind: 'cut' },
      };

      cues.splice(idx + 1, 0, newCue);
      return manifest;
    }

    case 'merge': {
      const idxA = cues.findIndex(c => c.id === op.cueIdA);
      const idxB = cues.findIndex(c => c.id === op.cueIdB);
      if (idxA === -1 || idxB === -1) {
        throw new Error(`[music-cues-ops] merge 失败: 找不到指定的配乐段 ${op.cueIdA} 或 ${op.cueIdB}`);
      }
      const cueA = cues[idxA];
      const cueB = cues[idxB];
      
      // 合并为 A，覆盖 A 的出点为 B 的出点
      cueA.out = { ...cueB.out };
      cueA.fadeOutSec = cueB.fadeOutSec;
      
      // 移除 B
      cues.splice(idxB, 1);
      return manifest;
    }

    case 'add': {
      let id = op.cue.id;
      if (!id) {
        let n = cues.length + 1;
        while (cues.some(c => c.id === `c${n}`)) {
          n++;
        }
        id = `c${n}`;
      }

      const newCue: MusicCue = {
        id,
        label: op.cue.label || `配乐段 ${id}`,
        in: op.cue.in,
        out: op.cue.out,
        brief: op.cue.brief || '新增配乐段',
        startFromSec: op.cue.startFromSec || 0,
        volume: op.cue.volume ?? DEFAULT_MUSIC_VOLUME,
        fadeInSec: op.cue.fadeInSec ?? 1.0,
        fadeOutSec: op.cue.fadeOutSec ?? 1.0,
        track: op.cue.track,
        join: op.cue.join || { kind: 'cut' },
      };

      cues.push(newCue);
      cues.sort((a, b) => a.in.sec - b.in.sec);
      return manifest;
    }

    case 'remove': {
      if (cues.length <= 1) {
        throw new Error('[music-cues-ops] remove 失败: 全片至少必须保留一个配乐段');
      }
      const idx = cues.findIndex(c => c.id === op.cueId);
      if (idx === -1) {
        throw new Error(`[music-cues-ops] remove 失败: 未找到配乐段 ${op.cueId}`);
      }
      cues.splice(idx, 1);
      return manifest;
    }

    case 'move': {
      const idx = cues.findIndex(c => c.id === op.cueId);
      if (idx === -1) {
        throw new Error(`[music-cues-ops] move 失败: 未找到配乐段 ${op.cueId}`);
      }
      const cue = cues[idx];
      const prev = idx > 0 ? cues[idx - 1] : null;
      const next = idx < cues.length - 1 ? cues[idx + 1] : null;

      if (op.edge === 'in') {
        if (op.newSec >= cue.out.sec - 0.2) {
          throw new Error(`[music-cues-ops] move 失败: 入点必须小于出点至少 0.2s`);
        }
        if (prev && prev.join?.kind !== 'crossfade' && op.newSec < prev.in.sec) {
          throw new Error(`[music-cues-ops] move 失败: 入点越界，不能早于前一段入点`);
        }
        cue.in = { ref: op.newRef || `manual@${op.newSec.toFixed(2)}s`, sec: op.newSec };
      } else {
        if (op.newSec <= cue.in.sec + 0.2) {
          throw new Error(`[music-cues-ops] move 失败: 出点必须大于入点至少 0.2s`);
        }
        if (next && next.join?.kind !== 'crossfade' && op.newSec > next.out.sec) {
          throw new Error(`[music-cues-ops] move 失败: 出点越界，不能晚于后一段出点`);
        }
        cue.out = { ref: op.newRef || `manual@${op.newSec.toFixed(2)}s`, sec: op.newSec };
      }
      return manifest;
    }

    case 'join': {
      const idx = cues.findIndex(c => c.id === op.cueId);
      if (idx === -1) {
        throw new Error(`[music-cues-ops] join 失败: 未找到配乐段 ${op.cueId}`);
      }
      if (idx === 0) {
        throw new Error(`[music-cues-ops] join 失败: 第一段无需配置向前衔接`);
      }
      const prev = cues[idx - 1];
      const curr = cues[idx];
      const spec = op.joinSpec;

      if (spec.kind === 'butt' || spec.kind === 'cut') {
        // 紧贴平接
        prev.out = { ref: curr.in.ref, sec: curr.in.sec };
        prev.fadeOutSec = 0.05;
        curr.fadeInSec = 0.05;
        curr.join = { kind: 'cut' };
      } else if (spec.kind === 'gap') {
        // 留白
        const gap = spec.gapSec ?? 1.0;
        const newPrevOut = Math.max(prev.in.sec + 0.2, curr.in.sec - gap);
        prev.out = { ref: `gap@${newPrevOut.toFixed(2)}s`, sec: newPrevOut };
        prev.fadeOutSec = Math.min(1.0, gap / 2);
        curr.fadeInSec = Math.min(1.0, gap / 2);
        curr.join = { kind: 'gap', overlapSec: -gap };
      } else if (spec.kind === 'crossfade') {
        // 交叉淡化重叠
        const overlap = spec.overlapSec ?? 2.0;
        prev.out = { ref: `xfade@${(curr.in.sec + overlap).toFixed(2)}s`, sec: curr.in.sec + overlap };
        prev.fadeOutSec = overlap;
        curr.fadeInSec = overlap;
        curr.join = { kind: 'crossfade', overlapSec: overlap };
      } else if (spec.kind === 'bridge') {
        // 音效桥
        curr.join = { kind: 'bridge' };
      }
      return manifest;
    }

    case 'set': {
      const idx = cues.findIndex(c => c.id === op.cueId);
      if (idx === -1) {
        throw new Error(`[music-cues-ops] set 失败: 未找到配乐段 ${op.cueId}`);
      }
      const cue = cues[idx];
      Object.assign(cue, op.patch);
      return manifest;
    }

    default:
      throw new Error(`[music-cues-ops] 不支持的操作: ${(op as any).kind}`);
  }
}
