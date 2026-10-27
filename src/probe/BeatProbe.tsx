import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CueAudio, Cue } from '../components/CueAudio';
import { beatGrid, onBeats, scaleSemis } from '../shared/beats';
import { drawLanding } from '../shared/motion';
import { lift } from '../shared/lens';
import { MusicFile } from '../shared/types';
import { BLUEPRINT } from '../styles';

/**
 * 节拍音效对比探针（内容中性：几何卡片与图标）——同一段配乐（100 BPM，C 大调），前后两种做法：
 *   A 0–7s   现状：卡片按固定间隔入场，每张同一声「咔哒」
 *   B 8–16s  新做法：卡片落点踩拍，每张一声马林巴、音高按 C 大调五声逐个上行；
 *            接着 8 个图标按半拍逐个亮起，音高上行再回落
 * 素材在 public/_probe/（临时，渲完删除）
 */
const C = BLUEPRINT.colors;
const F = BLUEPRINT.fonts;
const MUSIC = { version: 2, cues: [{ id: 'c1', label: 'probe', in: { ref: 'SC.a', sec: 0 }, out: { ref: 'SC.end', sec: 16 }, startFromSec: 0, volume: 1, fadeInSec: 0, fadeOutSec: 0, track: { id: 'p', title: 'p', bpm: 100, key: '8B', file: '_probe/music.wav', durationSec: 16 } }] } as unknown as MusicFile;
const GRID = beatGrid(MUSIC);
const KEY = '8B';

const A_TIMES = Array.from({ length: 6 }, (_, i) => 1.2 + i * 0.55);
const B_TIMES = onBeats(8.6, 6, GRID);
const ICON_TIMES = onBeats(B_TIMES[5] + 0.2, 8, GRID, { sub: 2 });

const CUES: Cue[] = [
  ...A_TIMES.map((at): Cue => ({ slot: 'probeClick', at, vol: 0.6, layer: 'UI' })),
  ...B_TIMES.map((at, i): Cue => ({ slot: 'probePluck', at, vol: 0.55, layer: 'UI', semis: scaleSemis(i, 6, { key: KEY }) })),
  ...ICON_TIMES.map((at, i): Cue => ({ slot: 'probePluck', at, vol: 0.4, layer: 'UI', semis: scaleSemis(i, 8, { key: KEY, contour: 'updown', degree0: 2 }) })),
];
const MANIFEST = { probePluck: [{ file: '_probe/pluck.wav' }], probeClick: [{ file: '_probe/click.wav' }] };

const Cards: React.FC<{ t: number; times: number[]; y: number }> = ({ t, times, y }) => (
  <>
    {times.map((land, i) => {
      const p = drawLanding(t, land, 0.35);
      const l = lift(p);
      return (
        <div key={i} style={{
          position: 'absolute', left: 160 + i * 270, top: y, width: 230, height: 150, borderRadius: 12, background: C.paper,
          border: `1.5px solid ${C.lineMid}`, boxShadow: l.boxShadow, opacity: p,
          transform: `translateY(${(l.dy + (1 - p) * 40).toFixed(2)}px)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 40px ${F.display}`, color: C.text,
        }}>
          0{i + 1}
        </div>
      );
    })}
  </>
);

/** 探针用到的全部变调（生成素材时用） */
export const BEAT_PROBE_SEMIS = [...new Set(CUES.map((c) => c.semis ?? 0).filter(Boolean))];

export const BeatProbe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const inB = t >= 7.6;
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <div style={{ position: 'absolute', left: 160, top: 120, font: `700 52px ${F.display}`, color: C.text }}>
        {inB ? '新做法：落点踩拍 + 调内琶音' : '现状：固定间隔 + 同一声'}
      </div>
      <div style={{ position: 'absolute', left: 160, top: 196, font: `400 26px ${F.mono}`, color: C.textMid }}>
        {inB ? `100 BPM · C 大调五声 · 卡片每拍一张，图标每半拍一个` : '间隔 0.55s · 与配乐无关'}
      </div>
      {!inB && <Cards t={t} times={A_TIMES} y={360} />}
      {inB && <Cards t={t} times={B_TIMES} y={360} />}
      {inB && ICON_TIMES.map((land, i) => {
        const p = drawLanding(t, land, 0.2);
        return (
          <div key={i} style={{
            position: 'absolute', left: 200 + i * 200, top: 640, width: 90, height: 90, borderRadius: 45,
            background: p > 0.5 ? C.accent : 'transparent', border: `3px solid ${C.accent}`, opacity: 0.25 + 0.75 * p,
            transform: `scale(${(0.7 + 0.3 * p + Math.sin(Math.PI * p) * 0.18).toFixed(3)})`,
          }} />
        );
      })}
      <CueAudio cues={CUES} manifest={MANIFEST} music={{ file: '_probe/music.wav', vol: 0.55, fadeOutSec: 1 }} />
    </AbsoluteFill>
  );
};
