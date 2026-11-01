import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import { S1Question } from './scenes/S1Question';
import { S2Record } from './scenes/S2Record';
import { S3Frequency } from './scenes/S3Frequency';
import { S4Duration } from './scenes/S4Duration';
import { S5Privacy } from './scenes/S5Privacy';
import { S6Cta } from './scenes/S6Cta';
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
import { IDO_PROMO_THEME } from './theme';

/** 九张真值的唯一装配点，渲染端与工作台读同一批文件 */
export const IDO_PROMO_TRUTH: FilmTruth = {
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

export const IDO_PROMO_TYPINGS: { id: string; fromSec: number; durSec: number; label: string }[] = [];

interface IdoPromoFilmProps {
  includeAudio?: boolean;
}

export const IdoPromoFilm: React.FC<IdoPromoFilmProps> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={IDO_PROMO_TRUTH}
    typingsList={IDO_PROMO_TYPINGS}
    includeAudio={includeAudio}
    background={IDO_PROMO_THEME.colors.bg}
    renderScene={(sceneId, t, scene) => {
      switch (sceneId) {
        case 'question': return <S1Question t={t} dur={scene.dur} />;
        case 'record': return <S2Record t={t} dur={scene.dur} />;
        case 'frequency': return <S3Frequency t={t} dur={scene.dur} />;
        case 'duration': return <S4Duration t={t} dur={scene.dur} />;
        case 'privacy': return <S5Privacy t={t} dur={scene.dur} />;
        case 'cta': return <S6Cta t={t} dur={scene.dur} />;
        default: return <div style={{ color: '#fff', fontSize: 24, padding: 40 }}>Scene: {sceneId}</div>;
      }
    }}
  />
);
