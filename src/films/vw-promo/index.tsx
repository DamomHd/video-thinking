import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import {
  ScenePain,
  SceneWorkbench,
  SceneEngine,
  SceneDelivery,
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
import { VW_PROMO_THEME } from './theme';

/** 九张真值的唯一装配点，渲染端与工作台读同一批文件 */
export const VW_PROMO_TRUTH: FilmTruth = {
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

export const VW_PROMO_TYPINGS: { id: string; fromSec: number; durSec: number; label: string }[] = [];

interface VwPromoFilmProps {
  includeAudio?: boolean;
}

export const VwPromoFilm: React.FC<VwPromoFilmProps> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={VW_PROMO_TRUTH}
    typingsList={VW_PROMO_TYPINGS}
    includeAudio={includeAudio}
    background={VW_PROMO_THEME.colors.paper}
    renderScene={(sceneId, t, scene) => {
      switch (sceneId) {
        case 'pain': return <ScenePain t={t} dur={scene.dur} />;
        case 'workbench': return <SceneWorkbench t={t} dur={scene.dur} />;
        case 'engine': return <SceneEngine t={t} dur={scene.dur} />;
        case 'delivery': return <SceneDelivery t={t} dur={scene.dur} />;
        default: return <div style={{ color: '#111', fontSize: 24, padding: 40 }}>Scene: {sceneId}</div>;
      }
    }}
  />
);
