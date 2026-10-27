/**
 * 口播层验收探针（内容中性）：VoiceProbe —— 一段铺满的配乐 + 几句口播，看口播播没播、配乐让没让位。
 * 配乐和口播表都从 --props 传入（{ musicFile, voice }），探针本身不带任何片子的素材。
 */
import React from 'react';
import { FilmAudio } from '../components/FilmAudio';
import { MixFile, MusicFile, VoiceFile } from '../shared/types';

export const VOICE_PROBE_SEC = 12;

const MIX: MixFile = { layers: { MUSIC: 0, BG: 0, TEX: 0, RISER: 0, WHOOSH: 0, IMPACT: 0, UI: 0 }, muted: [], master: 0 };

export const VoiceProbe: React.FC<{ musicFile?: string; voice?: VoiceFile; musicVolume?: number }> = ({ musicFile, voice, musicVolume = 0.8 }) => {
  const music: MusicFile = {
    version: 2,
    cues: musicFile
      ? [{ id: 'c1', label: '探针配乐', in: { sec: 0 }, out: { sec: VOICE_PROBE_SEC }, brief: '', startFromSec: 0, volume: musicVolume, fadeInSec: 0.2, fadeOutSec: 0.5, track: { id: 'probe', title: 'probe', artist: '', bpm: 120, file: musicFile, durationSec: VOICE_PROBE_SEC, adapted: false } }]
      : [],
  } as unknown as MusicFile;
  return <FilmAudio plan={[]} gains={{}} fades={{ in: {}, out: {} }} ducks={{}} mix={MIX} music={music} voice={voice} includeMusic includeSfx />;
};
