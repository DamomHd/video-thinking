import React from 'react';
import { FILM_PLAN } from './timeline';
import { FilmShell, FilmTruth } from '../../components/FilmShell';
import {
  PrologueScene, TitleScene, ConnectScene, DialogAScene, ChipScene, DialogBScene,
  UnderstandScene, HumanScene, CareScene, WeaveScene, LearnScene, FinaleScene,
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
  SfxPlanFile, SfxOffsetsFile, SfxGainsFile, SfxFadesFile, SfxDucksFile,
  MixFile, MusicFile, SfxTypingFile, SyncFile,
} from '../../shared/types';

/** 九张真值的唯一装配点 */
export const LOOMCARE_TRUTH: FilmTruth = {
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

/** 打字段：同一条真实键盘录音切不同起点 */
export const LOOMCARE_TYPINGS = [
  { id: 'typing1', fromSec: FILM_PLAN.sceneStart('dialogA') + 0.5, durSec: 2.8, label: '专员对话输入' },
];

interface LoomCareFilmProps {
  includeAudio?: boolean;
}

export const LoomCareFilm: React.FC<LoomCareFilmProps> = ({ includeAudio = true }) => (
  <FilmShell
    timeline={FILM_PLAN}
    truth={LOOMCARE_TRUTH}
    typingsList={LOOMCARE_TYPINGS}
    includeAudio={includeAudio}
    background="#F3F0E8"
    renderScene={(sceneId, t) => {
      switch (sceneId) {
        case 'prologue': return <PrologueScene t={t} />;
        case 'title': return <TitleScene t={t} />;
        case 'connect': return <ConnectScene t={t} />;
        case 'dialogA': return <DialogAScene t={t} />;
        case 'chip': return <ChipScene t={t} />;
        case 'dialogB': return <DialogBScene t={t} />;
        case 'understand': return <UnderstandScene t={t} />;
        case 'human': return <HumanScene t={t} />;
        case 'care': return <CareScene t={t} />;
        case 'weave': return <WeaveScene t={t} />;
        case 'learn': return <LearnScene t={t} />;
        case 'finale': return <FinaleScene t={t} />;
        default:
          return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 36, color: '#6B7A80' }}>
              幕 [{sceneId}]
            </div>
          );
      }
    }}
  />
);
