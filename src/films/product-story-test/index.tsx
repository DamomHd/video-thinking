import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import { World } from './world/World';
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
  SfxPlanFile, SfxOffsetsFile, SfxGainsFile, SfxFadesFile, SfxDucksFile, MixFile, MusicFile, SfxTypingFile, SyncFile,
} from '../../shared/types';
import { PS } from './theme';

/** 九张真值的唯一装配点，渲染端与工作台读同一批文件 */
export const PRODUCT_STORY_TEST_TRUTH: FilmTruth = {
  plan: planData as unknown as SfxPlanFile,
  offsets: offsetsData as SfxOffsetsFile,
  gains: gainsData as SfxGainsFile,
  fades: fadesData as SfxFadesFile,
  ducks: ducksData as SfxDucksFile,
  mix: mixData as MixFile,
  music: musicData as unknown as MusicFile,
  typing: typingData as SfxTypingFile,
  sync: syncData as unknown as SyncFile,
};

export const PRODUCT_STORY_TEST_TYPINGS: { id: string; fromSec: number; durSec: number; label: string }[] = [];

/** 四幕渲同一个世界（worldSec 还原成全片乐谱秒） */
export const ProductStoryTestFilm: React.FC<{ includeAudio?: boolean }> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={PRODUCT_STORY_TEST_TRUTH}
    typingsList={PRODUCT_STORY_TEST_TYPINGS}
    includeAudio={includeAudio}
    background={PS.colors.paper}
    renderScene={(_id, t, scene) => <World t={worldSec(scene, t)} />}
  />
);
