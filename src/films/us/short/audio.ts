/**
 * 短片声音 (对标 §17.4 的 ShortAudio)
 * 手写 cue 表，时刻一律来自小节网格；有音高的素材用 playbackRate 调进配乐的调性。
 * 配乐用离线剪过的版本（scripts/music/cut.ts），不走 Remotion 的 startFrom ——
 * startFrom 按帧量化，接缝会错 16–33ms。
 */

import { Cue } from '../../../components/CueAudio';
import { SHORT_MUSIC, SHORT_LENGTH, SHORT_START, bar, localOf } from './timeline';

/** 配乐调性（估出来的 Camelot 码对应的主音），有音高的素材按它调 */
export const SHORT_KEY_SEMIS = -3; // 素材基准 → 配乐主音的半音差

const semis = (n: number) => Math.pow(2, n / 12);

export function buildShortCues(): Cue[] {
  const cues: Cue[] = [
    {
      slot: 'usAtmosphere',
      at: 0,
      vol: 0.3,
      layer: 'BG',
      loop: true,
      durSec: SHORT_LENGTH,
      fadeIn: 1.0,
      fadeOut: 2.2,
      note: '底噪',
    },
  ];

  // 每小节头一枚晶莹点，调进配乐调性
  for (let m = -4; m <= 4; m++) {
    cues.push({
      slot: 'usGalaxyChime',
      at: localOf(bar(m)),
      vol: m === 0 ? 0.6 : 0.3,
      layer: 'TEX',
      rate: semis(SHORT_KEY_SEMIS + (m % 2 === 0 ? 0 : 5)),
      note: `小节 ${m} 的织点`,
    });
  }

  // 高潮：起势峰对 bar(0)，冲击落在 bar(0)
  cues.push({
    slot: 'usRiserSweep',
    at: localOf(bar(0)),
    vol: 0.72,
    layer: 'RISER',
    align: 'peak',
    note: '起势峰对 DROP',
  });
  cues.push({
    slot: 'usLogoHit',
    at: localOf(bar(0)),
    vol: 0.86,
    layer: 'IMPACT',
    rate: semis(SHORT_KEY_SEMIS),
    note: 'DROP 冲击（已调进配乐调性）',
  });

  // 落版轻点
  cues.push({
    slot: 'usLockClick',
    at: localOf(bar(4)),
    vol: 0.38,
    layer: 'UI',
    rate: 1.12,
    note: '落版落位',
  });

  return cues.filter((c) => c.at >= 0 && c.at <= SHORT_LENGTH).sort((a, b) => a.at - b.at);
}

export const SHORT_MUSIC_SPEC = {
  file: SHORT_MUSIC,
  vol: 0.62,
  startFromSec: 0,
  fadeInSec: 0.8,
  fadeOutSec: 2.2,
  durSec: SHORT_LENGTH,
};

export { SHORT_START };
