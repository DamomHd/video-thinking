import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import { World } from './scenes/Scenes';
import { worldSec } from '../../shared/shot';
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
import { INVOICE_AUDIT_THEME } from './theme';

/** 九张真值的唯一装配点，渲染端与工作台读同一批文件 */
export const INVOICE_AUDIT_TRUTH: FilmTruth = {
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

export const INVOICE_AUDIT_TYPINGS: { id: string; fromSec: number; durSec: number; label: string }[] = [];

interface InvoiceAuditFilmProps {
  includeAudio?: boolean;
}

export const InvoiceAuditFilm: React.FC<InvoiceAuditFilmProps> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={INVOICE_AUDIT_TRUTH}
    typingsList={INVOICE_AUDIT_TYPINGS}
    includeAudio={includeAudio}
    background={INVOICE_AUDIT_THEME.colors.paper}
    renderScene={(_id, t, scene) => <World t={worldSec(scene, t)} />}
  />
);
