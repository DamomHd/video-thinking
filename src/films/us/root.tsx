import React from 'react';
import { Composition } from 'remotion';
import type { FilmRoot } from '../../shared/film-root';
import { CueAudio } from '../../components/CueAudio';
import { FILM_PLAN } from './timeline';
import { UsFilm, US_TRUTH, US_TYPINGS } from './index';
import { UsTrailer, TRAILER_SECONDS } from './trailer/index';
import { buildTrailerCues, TRAILER_MUSIC_SPEC } from './trailer/audio';
import { UsShort, SHORT_SECONDS } from './short/index';
import { buildShortCues, SHORT_MUSIC_SPEC } from './short/audio';
import usManifest from './audio/manifest.json' with { type: 'json' };

/** 短片的只挂声音层合成 */
const ShortAudioOnly: React.FC = () => (
  <CueAudio
    cues={buildShortCues()}
    manifest={usManifest as never}
    music={SHORT_MUSIC_SPEC}
    layerDb={{ MUSIC: 0, BG: -3, TEX: -1, RISER: 0, IMPACT: 0, UI: -2 }}
  />
);

/** 预告片的只挂声音层合成（出音轨专用，与正片同一条三段式） */
const TrailerAudioOnly: React.FC = () => (
  <CueAudio
    cues={buildTrailerCues()}
    manifest={usManifest as never}
    music={TRAILER_MUSIC_SPEC}
    layerDb={{ MUSIC: 0, BG: -2, TEX: 0, RISER: 0, IMPACT: 0, UI: -1 }}
  />
);

export const filmRoot: FilmRoot = {
  timeline: FILM_PLAN,
  component: UsFilm,
  truth: US_TRUTH,
  typings: US_TYPINGS,
  extra: (
    <>
      {/* ── 衍生片：预告片走拍网格 + 手写 cue 表，不接平台，所以单独注册 ── */}
      <Composition id="us-trailer" component={UsTrailer} durationInFrames={Math.round(TRAILER_SECONDS * 30)} fps={30} width={1920} height={1080} defaultProps={{ includeAudio: false }} />
      <Composition id="us-trailer-60" component={UsTrailer} durationInFrames={Math.round(TRAILER_SECONDS * 60)} fps={60} width={1920} height={1080} defaultProps={{ includeAudio: false }} />
      <Composition id="us-trailer-Audio" component={TrailerAudioOnly} durationInFrames={Math.round(TRAILER_SECONDS * 30)} fps={30} width={1920} height={1080} />
      {/* ── 短片：单一 R3F 世界 + 自写着色器 + 后期链，按小节走 ── */}
      <Composition id="us-short" component={UsShort} durationInFrames={Math.round(SHORT_SECONDS * 30)} fps={30} width={1920} height={1080} defaultProps={{ includeAudio: false }} />
      <Composition id="us-short-60" component={UsShort} durationInFrames={Math.round(SHORT_SECONDS * 60)} fps={60} width={1920} height={1080} defaultProps={{ includeAudio: false }} />
      <Composition id="us-short-Audio" component={ShortAudioOnly} durationInFrames={Math.round(SHORT_SECONDS * 30)} fps={30} width={1920} height={1080} />
    </>
  ),
};
