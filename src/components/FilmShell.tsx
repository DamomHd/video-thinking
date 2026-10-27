import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { EnterWrapper } from './EnterWrapper';
import { FilmAudio } from './FilmAudio';
import {
  FilmTimelinePlan,
  ScenePlanResolved,
  MixFile,
  MusicFile,
  SfxDucksFile,
  SfxFadesFile,
  SfxGainsFile,
  SfxOffsetsFile,
  SfxPlanFile,
  SfxTypingFile,
  SyncFile, VoiceFile } from '../shared/types';
import { buildTimeWarp, IDENTITY_WARP, TimeWarp } from '../shared/timewarp';
import { getInputProps } from 'remotion';
import { ReadProbe } from './ReadProbe';
import { Subtitles, SubtitleCue, SubtitleStyle } from './Subtitles';
import { voiceSubtitles } from '../shared/voice';

/**
 * --props '{"noWarp":true}'：按**乐谱时间**渲，不做时间映射。
 * 对标附录 B 的 REMOTION_NO_WARP。
 *
 * 用处：母片渲成乐谱时间之后，工作台播放时自己按 toScore 驱动画面、
 * 用 playbackRate = 1/斜率 模拟变速 —— 这样改对拍参数不用重渲母片，
 * 拖一下就能听到新的对法。代价是母片和成片的时间轴不同，所以只给母片用。
 * （工作台会按母片时长自动判断它是哪条轴，见 tools/studio/app.js 的 detectVideoClock）
 */
/** 读字检查（vw readcheck）：渲染时传 inputProps.readcheck，挂上采集端；出片时不传，不存在 */
function readcheckRequested(): boolean {
  try {
    return Boolean((getInputProps() as Record<string, unknown>)?.readcheck);
  } catch {
    return false;
  }
}

function noWarpRequested(): boolean {
  try {
    return Boolean((getInputProps() as Record<string, unknown>)?.noWarp);
  } catch {
    return false;
  }
}

/**
 * 单幕合成（§4 的 LC-Title … LC-Finale）。
 *
 * Root 给每一幕注册一个 `<片>-S-<幕>` 合成，外面包这个 Context；
 * FilmShell 看到它就只渲这一幕、从第 0 帧开始、不挂声音。
 * 用 Context 而不是给每部片的组件加 prop：三部片的组件签名都不用动。
 */
export const SoloSceneContext = React.createContext<string | null>(null);

/** 某一幕在放映时间轴上的起止（秒），单幕合成按它定时长 */
export function sceneFilmSpan(
  timeline: FilmTimelinePlan,
  sceneId: string,
  sync?: SyncFile
): { start: number; end: number } {
  const scene = timeline.scenes.find((s) => s.id === sceneId);
  if (!scene) return { start: 0, end: 0 };
  const warp = sync ? buildTimeWarp(sync) : IDENTITY_WARP;
  return warp.IS_IDENTITY
    ? { start: scene.start, end: scene.end }
    : { start: warp.toFilm(scene.start), end: warp.toFilm(scene.end) };
}

/**
 * 幕内能拿到的放映时钟。幕内编舞用乐谱秒（renderScene 的 localSec），
 * 但外部视频片段必须按**放映时间**原速播放 —— 对拍拉伸过的段落里两者不同。
 * VideoInsert 用它把「乐谱里第几秒插入」换算成「放映里第几帧开始播」。
 */
export interface FilmClock {
  /** 本幕在放映时间轴上的起点（秒） */
  sceneFilmStart: number;
  /** 本幕在乐谱时间轴上的起点（秒） */
  sceneScoreStart: number;
  toFilm: (scoreSec: number) => number;
}

export const FilmClockContext = React.createContext<FilmClock | null>(null);

export interface FilmTruth {
  plan: SfxPlanFile;
  gains: SfxGainsFile;
  fades: SfxFadesFile;
  ducks: SfxDucksFile;
  mix: MixFile;
  music: MusicFile;
  offsets?: SfxOffsetsFile;
  typing?: SfxTypingFile;
  sync?: SyncFile;
  /** 口播（可选：只有需要口播的片子才有 audio/voice.json） */
  voice?: VoiceFile;
}

export interface FilmShellProps {
  timeline: FilmTimelinePlan;
  truth: FilmTruth;
  renderScene: (sceneId: string, scoreLocalSec: number, scene: ScenePlanResolved) => React.ReactNode;
  typingsList?: { id: string; fromSec: number; durSec: number; label: string }[];
  includeAudio?: boolean;
  background?: string;
  /**
   * 口播字幕烧进画面（只在真值有 voice 时有效）：true 用缺省样式，或传部分样式；不传就不烧（只导出 .srt）。
   * 风格要求的字幕设计由片子传 style 或在自己的世界里画
   */
  subtitles?: boolean | Partial<SubtitleStyle>;
}

/**
 * 放映时长（秒）：恒等映射时就是幕表总长；弹性对拍时按 knots 拉伸或压缩。
 * 注意这里不能取 max —— 总位移为负时成片本来就比乐谱短，取 max 会在片尾多出空帧。
 * noWarp 时返回乐谱总长（母片按乐谱时间渲）。
 */
export function filmDurationSeconds(
  timeline: FilmTimelinePlan,
  sync?: SyncFile,
  options: { noWarp?: boolean } = {}
): number {
  if (options.noWarp) return timeline.totalSeconds;
  const warp = sync ? buildTimeWarp(sync) : IDENTITY_WARP;
  if (warp.IS_IDENTITY) return timeline.totalSeconds;
  return Math.max(0.001, warp.toFilm(timeline.totalSeconds));
}

/**
 * 影片装配外壳（第二代「秒 + 幕表」+ 双时钟）
 * 1. 每幕一个 Sequence，起止按 toFilm 映射到放映时间；
 *    幕内交给场景组件的仍然是乐谱秒，所以编舞代码一行都不用动
 * 2. Enter 在交叠的那几秒里让本幕浮现，上一幕原样被盖住
 * 3. 成片所有 <Audio> 都在 FilmAudio 里（出音轨合成才能单独渲染）
 */
export const FilmShell: React.FC<FilmShellProps> = ({
  timeline,
  truth,
  renderScene,
  typingsList = [],
  includeAudio = true,
  background = '#000',
  subtitles,
}) => {
  const { fps } = useVideoConfig();
  const noWarp = noWarpRequested();
  const solo = React.useContext(SoloSceneContext);
  const warp: TimeWarp = React.useMemo(
    () => (noWarp || !truth.sync ? IDENTITY_WARP : buildTimeWarp(truth.sync)),
    [truth.sync, noWarp]
  );

  if (solo) {
    const scene = timeline.scenes.find((s) => s.id === solo);
    if (!scene) return null;
    const filmStart = warp.IS_IDENTITY ? scene.start : warp.toFilm(scene.start);
    // 单幕从第 0 帧开始：SceneHost 内部按「filmStart + 本地帧」还原放映秒，所以编舞完全一致
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: background }}>
        <SceneHost scene={scene} filmStartSec={filmStart} warp={warp} renderScene={renderScene} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', backgroundColor: background }}>
      {timeline.scenes.map((scene) => {
        const filmStart = warp.IS_IDENTITY ? scene.start : warp.toFilm(scene.start);
        const filmEnd = warp.IS_IDENTITY ? scene.end : warp.toFilm(scene.end);
        const fromFrame = Math.round(filmStart * fps);
        const durationInFrames = Math.max(1, Math.round((filmEnd - filmStart) * fps));

        return (
          <Sequence
            key={scene.id}
            from={fromFrame}
            durationInFrames={durationInFrames}
            name={scene.label}
            premountFor={fps}
          >
            <SceneHost
              scene={scene}
              filmStartSec={filmStart}
              warp={warp}
              renderScene={renderScene}
            />
          </Sequence>
        );
      })}

      {includeAudio && (
        <FilmAudio
          plan={truth.plan}
          gains={truth.gains}
          fades={truth.fades}
          ducks={truth.ducks}
          mix={truth.mix}
          music={truth.music}
          offsets={truth.offsets}
          typing={truth.typing}
          typingsList={typingsList}
          sync={noWarp ? undefined : truth.sync}
          voice={truth.voice}
        />
      )}
      {subtitles && truth.voice && (
        <BurnedSubtitles
          cues={voiceSubtitles(truth.voice, (s) => (warp.IS_IDENTITY ? s : warp.toFilm(s)))}
          style={subtitles === true ? undefined : subtitles}
        />
      )}
      {readcheckRequested() && <ReadProbe />}
    </div>
  );
};

const SceneHost: React.FC<{
  scene: ScenePlanResolved;
  filmStartSec: number;
  warp: TimeWarp;
  renderScene: FilmShellProps['renderScene'];
}> = ({ scene, filmStartSec, warp, renderScene }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 幕内时间一律是乐谱秒：放映秒 → toScore → 减去本幕起点
  const filmSec = filmStartSec + frame / fps;
  const scoreSec = warp.IS_IDENTITY ? filmSec : warp.toScore(filmSec);
  const localSec = Math.max(0, scoreSec - scene.start);

  const clock = React.useMemo<FilmClock>(
    () => ({
      sceneFilmStart: filmStartSec,
      sceneScoreStart: scene.start,
      toFilm: (s: number) => (warp.IS_IDENTITY ? s : warp.toFilm(s)),
    }),
    [filmStartSec, scene.start, warp]
  );

  return (
    <FilmClockContext.Provider value={clock}>
      <EnterWrapper type={scene.enter} overlapSec={scene.overlap} localSec={localSec}>
        {renderScene(scene.id, localSec, scene)}
      </EnterWrapper>
    </FilmClockContext.Provider>
  );
};

/** 放映时间轴上的字幕层（在所有幕之上） */
const BurnedSubtitles: React.FC<{ cues: SubtitleCue[]; style?: Partial<SubtitleStyle> }> = ({ cues, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <Subtitles cues={cues} t={frame / fps} style={style} />
    </div>
  );
};
