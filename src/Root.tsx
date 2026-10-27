import React from 'react';
import { Composition, Folder, registerRoot } from 'remotion';
import { FilmAudio } from './components/FilmAudio';
import { filmDurationSeconds, SoloSceneContext, sceneFilmSpan } from './components/FilmShell';
import type { FilmMeta, FilmRoot } from './shared/film-root';
import archiveIndex from './archive/index.json' with { type: 'json' };
import { ArchiveCompare, ArchivePlayer } from './components/ArchiveView';
import type { ArchiveIndex } from '../scripts/render/archive';

/** 登记表为空时 JSON 推断成 never[]，这里给上类型 */
const ARCHIVES = (archiveIndex as ArchiveIndex).entries;

/**
 * 合成总注册。每部片固定三个合成：
 *   <id>        30fps 母片（工作台监听底片 / 审片）
 *   <id>-60     60fps 成片（交付目标）
 *   <id>-Audio  只挂声音层（出音轨专用：不碰 WebGL，几十秒出 WAV）
 * 时长统一由 filmDurationSeconds 算：恒等映射取幕表总长，弹性对拍按 sync.json 的 knots 拉伸。
 */
/**
 * 按目录发现每部片（目录约定见 shared/film-root.ts）：
 *   src/films/<片>/film.json  → id、宽高（合成尺寸用片子自己的，竖屏片也一样）
 *   src/films/<片>/root.tsx   → 幕表、画面、真值、额外合成
 * 目录在就出现、不在就没有，所以被 .gitignore 排除的片子不会让这里编不过。
 */
type FilmEntry = FilmRoot & FilmMeta;

const metaCtx = import.meta.webpackContext('./films', { recursive: true, regExp: /^\.\/[^/]+\/film\.json$/ });
const rootCtx = import.meta.webpackContext('./films', { recursive: true, regExp: /^\.\/[^/]+\/root\.tsx$/ });
const unwrap = <T,>(m: unknown): T => ((m as { default?: T }).default ?? (m as T));

const FILMS: FilmEntry[] = rootCtx
  .keys()
  .sort()
  .map((key) => {
    const id = key.split('/')[1];
    const meta = unwrap<FilmMeta>(metaCtx(`./${id}/film.json`));
    const { filmRoot } = rootCtx(key) as { filmRoot: FilmRoot };
    return { ...meta, ...filmRoot };
  });

export const RemotionRoot: React.FC = () => (
  <>
    {FILMS.map((film) => {
      /**
       * 合成时长**随 props 变**：用 calculateMetadata，不要取两种模式的较大者。
       * 取 max 会让常规（已 warp）的成片在片尾多出几帧空帧 ——
       * 总位移为负时放映总长本来就比乐谱总长短，这是同一个坑的另一种形式。
       */
      const warpedSec = filmDurationSeconds(film.timeline, film.truth.sync);
      const scoreSec = filmDurationSeconds(film.timeline, film.truth.sync, { noWarp: true });
      const durationFor = (fps: number, props: Record<string, unknown>) =>
        Math.round((props?.noWarp ? scoreSec : warpedSec) * fps);
      const Film = film.component;
      const AudioOnly: React.FC = () => (
        <FilmAudio
          plan={film.truth.plan}
          gains={film.truth.gains}
          fades={film.truth.fades}
          ducks={film.truth.ducks}
          mix={film.truth.mix}
          music={film.truth.music}
          offsets={film.truth.offsets}
          typing={film.truth.typing}
          typingsList={film.typings}
          sync={film.truth.sync}
          voice={film.truth.voice}
        />
      );

      return (
        <React.Fragment key={film.id}>
          {/* 30fps 母片：静音渲染给工作台当底片 */}
          <Composition
            id={film.id}
            component={Film}
            durationInFrames={Math.round(warpedSec * 30)}
            fps={30}
            width={film.width}
            height={film.height}
            defaultProps={{ includeAudio: false }}
            calculateMetadata={({ props }) => ({
              durationInFrames: durationFor(30, props as Record<string, unknown>),
            })}
          />

          {/* 60fps 成片：同一个组件换 fps */}
          <Composition
            id={`${film.id}-60`}
            component={Film}
            durationInFrames={Math.round(warpedSec * 60)}
            fps={60}
            width={film.width}
            height={film.height}
            defaultProps={{ includeAudio: false }}
            calculateMetadata={({ props }) => ({
              durationInFrames: durationFor(60, props as Record<string, unknown>),
            })}
          />

          {/*
            单幕合成（§4）：每一幕一个 <片>-S-<幕>，30fps、静音、从幕起点开始。
            审片和改单幕时不用渲整片，也给 vw bake 提供可烘焙的目标。
          */}
          <Folder name={`${film.id}-scenes`}>
            {film.timeline.scenes.map((scene) => {
              const span = sceneFilmSpan(film.timeline, scene.id, film.truth.sync);
              const Solo: React.FC = () => (
                <SoloSceneContext.Provider value={scene.id}>
                  <Film includeAudio={false} />
                </SoloSceneContext.Provider>
              );
              return (
                <Composition
                  key={scene.id}
                  id={`${film.id}-S-${scene.id}`}
                  component={Solo}
                  durationInFrames={Math.max(1, Math.round((span.end - span.start) * 30))}
                  fps={30}
                  width={film.width}
                  height={film.height}
                />
              );
            })}
          </Folder>

          {/*
            封存版本（§4「备份（只读对比）」）：vw archive save 登记的每份封存注册两个合成，
            <片>-Archive-<标签> 回放旧版，<片>-Compare-<标签> 旧版与当前代码并排（--props '{"mode":"wipe"}' 换擦除对比）。
          */}
          {ARCHIVES.some((e) => e.film === film.id) && (
            <Folder name={`${film.id}-archive`}>
              {ARCHIVES
                .filter((e) => e.film === film.id)
                .map((e) => {
                  const Player: React.FC = () => <ArchivePlayer file={e.file} />;
                  const Compare: React.FC<{ mode?: 'split' | 'wipe' }> = ({ mode }) => (
                    <ArchiveCompare file={e.file} label={e.label} mode={mode} current={<Film includeAudio={false} />} />
                  );
                  return (
                    <React.Fragment key={e.label}>
                      <Composition
                        id={`${film.id}-Archive-${e.label}`}
                        component={Player}
                        durationInFrames={Math.max(1, Math.round(e.durationSec * 30))}
                        fps={30}
                        width={film.width}
                        height={film.height}
                      />
                      <Composition
                        id={`${film.id}-Compare-${e.label}`}
                        component={Compare}
                        durationInFrames={Math.max(1, Math.round(Math.max(e.durationSec, warpedSec) * 30))}
                        fps={30}
                        width={film.width}
                        height={film.height}
                        defaultProps={{ mode: 'split' as const }}
                      />
                    </React.Fragment>
                  );
                })}
            </Folder>
          )}

          {/* 只有声音层：出音轨专用 */}
          <Composition
            id={`${film.id}-Audio`}
            component={AudioOnly}
            durationInFrames={Math.round(warpedSec * 30)}
            fps={30}
            width={film.width}
            height={film.height}
            calculateMetadata={({ props }) => ({
              durationInFrames: durationFor(30, props as Record<string, unknown>),
            })}
          />
        </React.Fragment>
      );
    })}

    {/* 每部片专有的额外合成（预告片、方向关键帧…）来自各自的 root.tsx 的 extra */}
    {FILMS.map((film) => (film.extra ? <React.Fragment key={`${film.id}-extra`}>{film.extra}</React.Fragment> : null))}
  </>
);

registerRoot(RemotionRoot);
