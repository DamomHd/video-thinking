import React from 'react';
import {
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  getInputProps,
} from 'remotion';
import { AudioLayer } from '../shared/types';
import { pitchedRel } from '../shared/pitch';
import { dbToLinear, equalPowerCrossfade, frameFadeAt } from '../shared/audio-math';

/**
 * 手写 cue 表（对标 architecture.html §17.4 的 TrailerAudio / ShortAudio）
 *
 * 平台路径（FilmAudio + 九张真值）适合长片、要反复调；
 * 手写 cue 表适合几十秒、节奏完全由镜头常量决定的短片：时刻直接写镜头导出的秒数，
 * 调参写死在代码里，迭代更快，代价是每次改都要重渲、没有工作台和守门。
 *
 * 两条路都用同一套音量 / 淡化公式（shared/audio-math），所以听感口径一致。
 */

export interface Cue {
  /** 槽名：直接复用已采购的 public/sfx-lib/epidemic/<槽>.wav */
  slot: string;
  /** 落点（秒，放映时间） */
  at: number;
  /** 线性音量 */
  vol: number;
  layer?: AudioLayer;
  /** 只放素材的这一段 [起秒, 止秒] */
  take?: [number, number];
  /** 变速：playbackRate（渲染端走 atempo，只改速度、不改音高） */
  rate?: number;
  /**
   * 变调（半音）：取离线变调好的文件（src/shared/pitch.ts 的命名约定，scripts/spot/pitch.ts 的 ensurePitched 生成）。
   * 不要用 rate 变调：渲染出来音高不会变。
   */
  semis?: number;
  fadeIn?: number;
  fadeOut?: number;
  /**
   * peak = 让素材峰落在 at 这一刻（起点 = at − 峰位）；
   * onset = 让可听起点落在 at 这一刻（缺省）。
   */
  align?: 'peak' | 'onset';
  /** 显式时长；不给就放完整条 */
  durSec?: number;
  loop?: boolean;
  note?: string;
}

/** 槽 → 实测包络，来自 src/films/<片>/audio/manifest.json */
export type SlotEnvelopes = Record<
  string,
  { file: string; durSec?: number; onsetSec?: number; peakAtSec?: number }[]
>;

export interface CueAudioProps {
  cues: Cue[];
  /** manifest.json（槽 → 已采购素材 + 实测包络） */
  manifest: SlotEnvelopes;
  /** 固定配乐：预告片是原曲整首，短片是离线剪过的版本 */
  music?: {
    file: string;
    vol: number;
    startFromSec?: number;
    fadeInSec?: number;
    fadeOutSec?: number;
    /** 片长（秒）；不给就铺满整个合成 */
    durSec?: number;
  };
  /** 层推子（dB），缺省全 0 */
  layerDb?: Partial<Record<AudioLayer, number>>;
  masterDb?: number;
  /** 显式关掉配乐 / 音效；不给时跟随 --props 的 music / sfx 开关 */
  includeMusic?: boolean;
  includeSfx?: boolean;
}

/** 同 FilmAudio：--props '{"music":false}' / '{"sfx":false}'（附录 B） */
function audioSwitch(name: 'music' | 'sfx'): boolean {
  try {
    const v = (getInputProps() as Record<string, unknown>)?.[name];
    return v === undefined ? true : Boolean(v);
  } catch {
    return true;
  }
}

const DEFAULT_FADE = 0.02;

export const CueAudio: React.FC<CueAudioProps> = ({
  cues,
  manifest,
  music,
  layerDb = {},
  masterDb = 0,
  includeMusic,
  includeSfx,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const wantMusic = includeMusic ?? audioSwitch('music');
  const wantSfx = includeSfx ?? audioSwitch('sfx');

  const resolve = (cue: Cue) => {
    const entry = manifest[cue.slot]?.[0];
    const base = entry?.file ?? `sfx-lib/epidemic/${cue.slot}.wav`;
    const file = pitchedRel(base, cue.semis ?? 0);
    const onset = entry?.onsetSec ?? 0;
    const peakAt = entry?.peakAtSec ?? 0;
    const total = entry?.durSec ?? 0;

    let startSec = cue.at;
    let startFromSec = 0;
    let durSec = cue.durSec ?? Math.max(0.05, total - onset);

    if (cue.take) {
      startFromSec = Math.max(0, cue.take[0]);
      durSec = cue.durSec ?? Math.max(0.05, cue.take[1] - cue.take[0]);
    } else if (cue.align === 'peak') {
      // 素材峰落在 at 这一刻
      startSec = cue.at - peakAt;
      startFromSec = 0;
      durSec = cue.durSec ?? Math.max(0.05, total);
    } else {
      // 可听起点落在 at 这一刻
      startFromSec = onset;
    }

    // 起点为负时把差值吃进素材内偏移，绝不出现负起点
    if (startSec < 0) {
      const deficit = -startSec;
      startFromSec += deficit;
      durSec = Math.max(0.05, durSec - deficit);
      startSec = 0;
    }

    return { file, startSec, startFromSec, durSec };
  };

  return (
    <>
      {wantMusic && music && music.file && (
        <Sequence
          from={0}
          durationInFrames={music.durSec ? Math.round(music.durSec * fps) : durationInFrames}
          name="MUSIC · 固定配乐"
        >
          <MusicTrack
            file={music.file}
            vol={music.vol * dbToLinear((layerDb.MUSIC ?? 0) + masterDb)}
            startFromSec={music.startFromSec ?? 0}
            fadeInSec={music.fadeInSec ?? 0}
            fadeOutSec={music.fadeOutSec ?? 0}
            durSec={music.durSec ?? durationInFrames / fps}
          />
        </Sequence>
      )}

      {wantSfx && cues.map((cue, i) => {
        const { file, startSec, startFromSec, durSec } = resolve(cue);
        const frames = Math.round(durSec * fps);
        if (frames <= 0) return null;
        const layer = cue.layer ?? 'UI';
        const gain = dbToLinear((layerDb[layer] ?? 0) + masterDb);

        return (
          <Sequence
            key={`${cue.slot}-${i}`}
            from={Math.max(0, Math.round(startSec * fps))}
            durationInFrames={frames}
            name={`${layer} · ${cue.slot}${cue.note ? ` (${cue.note})` : ''}`}
          >
            <CueClip
              file={file}
              startFromSec={startFromSec}
              durSec={durSec}
              vol={cue.vol * gain}
              rate={cue.rate ?? 1}
              fadeIn={cue.fadeIn ?? DEFAULT_FADE}
              fadeOut={cue.fadeOut ?? DEFAULT_FADE}
              loop={cue.loop}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const resolveSrc = (file: string) => {
  let clean = file.startsWith('/') ? file.slice(1) : file;
  if (clean.startsWith('public/')) clean = clean.slice('public/'.length);
  return staticFile(clean);
};

const CueClip: React.FC<{
  file: string;
  startFromSec: number;
  durSec: number;
  vol: number;
  rate: number;
  fadeIn: number;
  fadeOut: number;
  loop?: boolean;
}> = ({ file, startFromSec, durSec, vol, rate, fadeIn, fadeOut, loop }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // 按帧取（淡入用帧末、淡出用帧首）：按帧起点算时第 0 帧系数为 0，起音那一整帧会被静音
  const fade = frameFadeAt(frame, fps, durSec, fadeIn, fadeOut);
  return (
    <Audio
      src={resolveSrc(file)}
      startFrom={Math.round(startFromSec * fps)}
      volume={Math.max(0, vol * fade)}
      playbackRate={rate}
      loop={loop}
    />
  );
};

const MusicTrack: React.FC<{
  file: string;
  vol: number;
  startFromSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  durSec: number;
}> = ({ file, vol, startFromSec, fadeInSec, fadeOutSec, durSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  // 配乐首尾用等功率淡化，避免线性淡化在长尾上听起来"中间塌一块"
  let fade = 1;
  if (fadeInSec > 0 && t < fadeInSec) fade = equalPowerCrossfade((frame + 1) / fps / fadeInSec).inGain;
  else if (fadeOutSec > 0 && t > durSec - fadeOutSec) {
    fade = equalPowerCrossfade((t - (durSec - fadeOutSec)) / fadeOutSec).outGain;
  }
  return (
    <Audio
      src={resolveSrc(file)}
      startFrom={Math.round(startFromSec * fps)}
      volume={Math.max(0, vol * fade)}
    />
  );
};
