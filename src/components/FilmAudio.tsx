import React from 'react';
import {
  Audio,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
  getInputProps,
} from 'remotion';
import {
  SfxPlanFile,
  SfxPlanItem,
  SfxOffsetsFile,
  SfxGainsFile,
  SfxFadesFile,
  SfxDucksFile,
  MixFile,
  MusicFile,
  MusicCue,
  SfxTypingFile,
  SyncFile,
  VoiceFile,
} from '../shared/types';
import { voiceDuckTriggers } from '../shared/voice';
import {
  gainOf,
  ActiveDuckTrigger,
  fadeAt,
  frameFadeAt,
  duckAt,
  equalPowerCrossfade,
} from '../shared/audio-math';
import { buildTimeWarp, IDENTITY_WARP, TimeWarp } from '../shared/timewarp';

interface FilmAudioProps {
  plan: SfxPlanFile;
  gains: SfxGainsFile;
  fades: SfxFadesFile;
  ducks: SfxDucksFile;
  mix: MixFile;
  music: MusicFile;
  /** 片段起点微调（秒）。start = plan.fromSec + offsets[key] —— 工作台与 swap 的调参全靠这张表落地 */
  offsets?: SfxOffsetsFile;
  typing?: SfxTypingFile;
  typingsList?: { id: string; fromSec: number; durSec: number; label: string }[];
  /** 对拍结果。音效在乐谱时间轴上，经 toFilm 映射到放映时间；配乐本身就在放映时间轴上 */
  sync?: SyncFile;
  /** 口播（可选 VO 层，只有带 audio/voice.json 的片子才有）：每句一段，配乐在口播时让位 */
  voice?: VoiceFile;
  /** 显式关掉配乐 / 音效；不给时跟随 --props 的 music / sfx 开关 */
  includeMusic?: boolean;
  includeSfx?: boolean;
}

/**
 * 读 --props 里的 music / sfx 开关（对标 architecture.html 附录 B）。
 *   --props '{"music":false}'  只出音效
 *   --props '{"sfx":false}'    只出配乐
 * 用来单独出一条轨做对账、或者给客户两版选。
 */
function audioSwitch(name: 'music' | 'sfx' | 'vo'): boolean {
  try {
    const v = (getInputProps() as Record<string, unknown>)?.[name];
    return v === undefined ? true : Boolean(v);
  } catch {
    return true;
  }
}

/**
 * 通用音频挂载层（消费九张真值 JSON）
 * 1. 三级增益 × 淡化 × 让位，公式与工作台共用 shared/audio-math
 * 2. 音效起点 = fromSec + offsets[key]，再经双时钟 toFilm 映射
 * 3. 相邻配乐段重叠时走等功率交叉淡化（cos² + sin² = 1）
 * 无论 30fps 还是 60fps，一律以秒换算到当前帧
 */
export const FilmAudio: React.FC<FilmAudioProps> = ({
  plan,
  gains,
  fades,
  ducks,
  mix,
  music,
  offsets = {},
  typing,
  typingsList = [],
  sync,
  voice,
  includeMusic,
  includeSfx,
}) => {
  const { fps } = useVideoConfig();
  const wantMusic = includeMusic ?? audioSwitch('music');
  const wantSfx = includeSfx ?? audioSwitch('sfx');
  const warp: TimeWarp = React.useMemo(
    () => (sync ? buildTimeWarp(sync) : IDENTITY_WARP),
    [sync]
  );

  // 片段真实起点（放映时间）：fromSec + offset 在乐谱轴上，再映射到放映轴
  const startOf = (item: SfxPlanItem): number => {
    const scoreStart = item.fromSec + (offsets[item.key] ?? 0);
    return warp.IS_IDENTITY ? scoreStart : warp.toFilm(scoreStart);
  };

  // 让位触发源一律用放映时间，才能和配乐对齐
  const activeTriggers: ActiveDuckTrigger[] = [];
  for (const item of plan) {
    const duckSpec = ducks[item.key];
    if (duckSpec) {
      activeTriggers.push({ triggerStartSec: startOf(item), spec: duckSpec });
    }
  }
  // 口播：配乐让位（开口前压下去、说完回来）；口播关掉（--props '{"vo":false}'）时不让位
  const wantVo = audioSwitch('vo');
  const toFilm = (s: number) => (warp.IS_IDENTITY ? s : warp.toFilm(s));
  if (wantVo) activeTriggers.push(...voiceDuckTriggers(voice, toFilm));

  // 配乐段交叠信息（只有交叉淡化允许重叠）
  const cues = [...music.cues].sort((a, b) => a.in.sec - b.in.sec);
  const overlapWithNext: Record<string, number> = {};
  const overlapWithPrev: Record<string, number> = {};
  for (let i = 0; i < cues.length - 1; i++) {
    const a = cues[i];
    const b = cues[i + 1];
    const ov = a.out.sec - b.in.sec;
    if (ov > 1e-4) {
      overlapWithNext[a.id] = ov;
      overlapWithPrev[b.id] = ov;
    }
  }

  return (
    <>
      {/* A. 配乐层 (MusicBed) */}
      {wantMusic && cues.map((cue) => {
        const fromFrame = Math.round(cue.in.sec * fps);
        const durationInFrames = Math.round((cue.out.sec - cue.in.sec) * fps);
        if (durationInFrames <= 0 || !cue.track?.file) return null;

        return (
          <Sequence
            key={cue.id}
            from={fromFrame}
            durationInFrames={durationInFrames}
            name={`MUSIC · ${cue.label}`}
          >
            <MusicCuePlayer
              cue={cue}
              gains={gains}
              mix={mix}
              activeTriggers={activeTriggers}
              xfadeOutSec={overlapWithNext[cue.id] ?? 0}
              xfadeInSec={overlapWithPrev[cue.id] ?? 0}
            />
          </Sequence>
        );
      })}

      {/* B. 音效层 (SfxPlan，含动作、环境及 UI 挂载) */}
      {wantSfx && plan.map((item) => {
        const startSec = startOf(item);
        const fromFrame = Math.round(startSec * fps);
        const durationInFrames = Math.round(item.durSec * fps);
        if (durationInFrames <= 0 || !item.file) return null;

        const fadeInSec = fades.in[item.key] ?? item.fadeSec;
        const fadeOutSec = fades.out[item.key] ?? item.fadeSec;
        const g = gainOf(item.key, item.layer, gains, mix);
        if (g <= 0) return null;

        return (
          <Sequence
            key={item.key}
            from={Math.max(0, fromFrame)}
            durationInFrames={durationInFrames}
            name={`${item.layer} · ${item.what}`}
          >
            <SfxItemPlayer
              item={item}
              startSec={startSec}
              fadeInSec={fadeInSec}
              fadeOutSec={fadeOutSec}
              baseGain={g}
              activeTriggers={activeTriggers}
            />
          </Sequence>
        );
      })}

      {/* D. 口播 (VO，可选层) */}
      {wantVo && voice?.lines.map((line) => {
        if (!line.file || !line.durSec) return null;
        const startSec = toFilm(line.sec);
        const durationInFrames = Math.round((line.durSec + 0.2) * fps);
        const g = gainOf(`vo:${line.id}`, 'VO', gains, mix);
        if (g <= 0) return null;
        return (
          <Sequence key={`vo:${line.id}`} from={Math.max(0, Math.round(startSec * fps))} durationInFrames={durationInFrames} name={`VO · ${line.text.slice(0, 16)}`}>
            <Audio src={resolveSrc(line.file)} volume={g} />
          </Sequence>
        );
      })}

      {/* C. 真实键盘打字音效 (TypingAudio) */}
      {wantSfx && typing && typing.file && typingsList.map((t) => {
        const startSec = warp.IS_IDENTITY ? t.fromSec : warp.toFilm(t.fromSec);
        const fromFrame = Math.round(startSec * fps);
        const durationInFrames = Math.round(t.durSec * fps);
        if (durationInFrames <= 0) return null;

        const key = `typing:${t.id}`;
        const offsetSec = typing.offsets?.[t.id] ?? 0;
        const g = gainOf(key, 'UI', gains, mix);
        if (g <= 0) return null;

        return (
          <Sequence
            key={key}
            from={Math.max(0, fromFrame)}
            durationInFrames={durationInFrames}
            name={`UI · 打字: ${t.label}`}
          >
            <TypingItemPlayer
              file={typing.file}
              startSec={startSec}
              durSec={t.durSec}
              offsetSec={offsetSec}
              baseGain={g}
              activeTriggers={activeTriggers}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const resolveSrc = (file: string) => {
  if (file.startsWith('http://') || file.startsWith('https://')) return file;
  let clean = file.startsWith('/') ? file.slice(1) : file;
  // 容错：真值里偶尔写成 public/ 前缀，staticFile 的根本身就是 public/
  if (clean.startsWith('public/')) clean = clean.slice('public/'.length);
  return staticFile(clean);
};

const MusicCuePlayer: React.FC<{
  cue: MusicCue;
  gains: SfxGainsFile;
  mix: MixFile;
  activeTriggers: ActiveDuckTrigger[];
  xfadeOutSec: number;
  xfadeInSec: number;
}> = ({ cue, gains, mix, activeTriggers, xfadeOutSec, xfadeInSec }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localSec = frame / fps;
  const filmSec = cue.in.sec + localSec;
  const durSec = cue.out.sec - cue.in.sec;

  const key = `music:${cue.id}`;
  const g = gainOf(key, 'MUSIC', gains, mix);
  const duckMultiplier = duckAt(filmSec, 'MUSIC', activeTriggers);

  // 段内淡化（按帧取：淡入用帧末、淡出用帧首，见 audio-math.frameFadeAt）
  let fade = frameFadeAt(frame, fps, durSec, cue.fadeInSec, cue.fadeOutSec);

  // 与相邻段重叠的那一端改走等功率交叉淡化，避免叠音抬高总能量
  if (xfadeInSec > 0 && localSec < xfadeInSec) {
    fade = equalPowerCrossfade((frame + 1) / fps / xfadeInSec).inGain;
  } else if (xfadeOutSec > 0 && localSec > durSec - xfadeOutSec) {
    const p = (localSec - (durSec - xfadeOutSec)) / xfadeOutSec;
    fade = equalPowerCrossfade(p).outGain;
  }

  const finalVolume = cue.volume * g * duckMultiplier * fade;

  return (
    <Audio
      src={resolveSrc(cue.track!.file)}
      startFrom={Math.round(cue.startFromSec * fps)}
      volume={Math.max(0, finalVolume)}
    />
  );
};

const SfxItemPlayer: React.FC<{
  item: SfxPlanItem;
  startSec: number;
  fadeInSec: number;
  fadeOutSec: number;
  baseGain: number;
  activeTriggers: ActiveDuckTrigger[];
}> = ({ item, startSec, fadeInSec, fadeOutSec, baseGain, activeTriggers }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localSec = frame / fps;
  const filmSec = startSec + localSec;

  const fade = frameFadeAt(frame, fps, item.durSec, fadeInSec, fadeOutSec);
  const duckMultiplier = duckAt(filmSec, item.layer, activeTriggers);
  const finalVolume = item.volume * baseGain * fade * duckMultiplier;

  return (
    <Audio
      src={resolveSrc(item.file)}
      startFrom={Math.round(item.startFromSec * fps)}
      volume={Math.max(0, finalVolume)}
      loop={item.loop}
    />
  );
};

const TypingItemPlayer: React.FC<{
  file: string;
  startSec: number;
  durSec: number;
  offsetSec: number;
  baseGain: number;
  activeTriggers: ActiveDuckTrigger[];
}> = ({ file, startSec, durSec, offsetSec, baseGain, activeTriggers }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const localSec = frame / fps;
  const fade8FramesSec = 8 / fps;

  // 架构标准: 0.5 基础音量 × 8 帧淡入淡出 × g(UI) × duck
  const fade = frameFadeAt(frame, fps, durSec, fade8FramesSec, fade8FramesSec);
  const duckMultiplier = duckAt(startSec + localSec, 'UI', activeTriggers);
  const finalVolume = 0.5 * baseGain * fade * duckMultiplier;

  return (
    <Audio
      src={resolveSrc(file)}
      startFrom={Math.round(offsetSec * fps)}
      volume={Math.max(0, finalVolume)}
      loop
    />
  );
};
