/**
 * 外部视频片段插入（AI 视频 / 实拍 / 外部渲染的 mp4）
 *
 *   <VideoInsert src="inserts/<片>/<标签>.mp4" at={6.2} durSec={4.0}
 *     transitionIn={{ kind: 'iris', durSec: 0.6, cx: 0.5, cy: 0.45 }} transitionOut={{ kind: 'fade', durSec: 0.4 }} />
 *
 * 时间口径：
 *   · at 用幕内**乐谱秒**写（和这一幕的其它编舞同一个口径）
 *   · 片段本身按**放映时间**原速播放：从 FilmShell 的放映时钟里把 at 换算成放映帧
 *     —— 对拍拉伸过的段落里两者不同。片段所在区间建议在适配器里划成 'video'（刚性）弹性区，
 *     这样对拍不会拉伸它周围的编舞，片段和画面不会错开
 *   · 不在 FilmShell 里用（探针 / 衍生片）时，按当前 Sequence 的帧时间计算
 *
 * 帧取用 OffthreadVideo（逐帧精确，不按播放器时钟取）。
 */

import React, { useContext } from 'react';
import { AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { FilmClockContext } from './FilmShell';
import { SpliceTransition, spliceStyleAt } from '../shared/splice';

export interface VideoInsertProps {
  src: string;
  /** 幕内乐谱秒：片段第一帧出现的时刻 */
  at: number;
  /** 片段播放时长（秒，放映时间） */
  durSec: number;
  /** 从片段的第几秒开始取 */
  trimStartSec?: number;
  transitionIn?: SpliceTransition;
  transitionOut?: SpliceTransition;
  fit?: 'cover' | 'contain';
  muted?: boolean;
  /** 片段音量（不静音时）；成片的声音建议仍走 FilmAudio，这里缺省静音 */
  volume?: number;
}

export const VideoInsert: React.FC<VideoInsertProps> = ({
  src,
  at,
  durSec,
  trimStartSec = 0,
  transitionIn,
  transitionOut,
  fit = 'cover',
  muted = true,
  volume = 1,
}) => {
  const clock = useContext(FilmClockContext);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 片段起点（相对本幕 Sequence 的放映秒）
  const startFilmLocal = clock ? clock.toFilm(clock.sceneScoreStart + at) - clock.sceneFilmStart : at;
  const fromFrame = Math.round(startFilmLocal * fps);
  const durFrames = Math.max(1, Math.round(durSec * fps));
  const u = (frame - fromFrame) / fps;
  const st = spliceStyleAt(u, durSec, transitionIn, transitionOut);

  return (
    <Sequence from={fromFrame} durationInFrames={durFrames} layout="none">
      <AbsoluteFill
        style={{
          opacity: st.opacity,
          visibility: st.visible ? 'visible' : 'hidden',
          maskImage: st.maskImage,
          WebkitMaskImage: st.maskImage,
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={Math.round(trimStartSec * fps)}
          muted={muted}
          volume={volume}
          style={{ width: '100%', height: '100%', objectFit: fit }}
        />
      </AbsoluteFill>
    </Sequence>
  );
};
