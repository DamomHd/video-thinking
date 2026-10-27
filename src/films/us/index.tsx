import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import {
  OpenScene,
  RecordScene,
  RiverScene,
  InsightsScene,
  PrivacyScene,
  FinaleScene,
} from './scenes/Scenes';
import planData from './audio/sfxPlan.json' with { type: 'json' };
import offsetsData from './audio/sfxOffsets.json' with { type: 'json' };
import gainsData from './audio/sfxGains.json' with { type: 'json' };
import fadesData from './audio/sfxFades.json' with { type: 'json' };
import ducksData from './audio/sfxDucks.json' with { type: 'json' };
import mixData from './audio/mix.json' with { type: 'json' };
import musicData from './audio/music.json' with { type: 'json' };
import typingData from './audio/sfxTyping.json' with { type: 'json' };
import syncData from './audio/sync.json' with { type: 'json' };
import {
  SfxPlanFile,
  SfxOffsetsFile,
  SfxGainsFile,
  SfxFadesFile,
  SfxDucksFile,
  MixFile,
  MusicFile,
  SfxTypingFile,
  SyncFile,
} from '../../shared/types';
import { US_THEME } from './theme';

/** 九张真值的唯一装配点，渲染端与工作台读同一批文件 */
export const US_TRUTH: FilmTruth = {
  plan: planData as SfxPlanFile,
  offsets: offsetsData as SfxOffsetsFile,
  gains: gainsData as SfxGainsFile,
  fades: fadesData as SfxFadesFile,
  ducks: ducksData as SfxDucksFile,
  mix: mixData as MixFile,
  music: musicData as MusicFile,
  typing: typingData as SfxTypingFile,
  sync: syncData as unknown as SyncFile,
};

export const US_TYPINGS: { id: string; fromSec: number; durSec: number; label: string }[] = [];

interface UsFilmProps {
  includeAudio?: boolean;
}

export const UsFilm: React.FC<UsFilmProps> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={US_TRUTH}
    typingsList={US_TYPINGS}
    includeAudio={includeAudio}
    background={US_THEME.colors.bg}
    renderScene={(sceneId, t, scene) => {
      switch (sceneId) {
        case 'open': return <OpenScene t={t} dur={scene.dur} />;
        case 'record': return <RecordScene t={t} dur={scene.dur} />;
        case 'river': return <RiverScene t={t} dur={scene.dur} />;
        case 'insights': return <InsightsScene t={t} dur={scene.dur} />;
        case 'privacy': return <PrivacyScene t={t} dur={scene.dur} />;
        case 'finale': return <FinaleScene t={t} dur={scene.dur} />;
        default: return <div style={{ color: '#fff', fontSize: 24, padding: 40 }}>Scene: {sceneId}</div>;
      }
    }}
  />
);
