import React from 'react';
import { Sequence, useCurrentFrame, useVideoConfig, AbsoluteFill } from 'remotion';
import { FilmChrome } from '../../../components/FilmChrome';
import { CueAudio } from '../../../components/CueAudio';
import { clamp01, easeOutCubic } from '../../../shared/anim';
import { US_THEME } from '../theme';
import manifestData from '../audio/manifest.json' with { type: 'json' };
import { TRAILER, TRAILER_LENGTH, SUPERS, localOf } from './timeline';
import type { ResolvedShot } from '../../../shared/beatgrid';
import type { TrailerShot } from './timeline';
import { ReuseShot } from './shots/Reuse';
import { StarVoid, WovenMark, EndCard } from './shots/NewShots';
import { buildTrailerCues, TRAILER_MUSIC_SPEC } from './audio';

/**
 * Us 预告片 (对标 architecture.html §6.5)
 * 预告片 = 新镜头 + 对正片幕的时间重映射 + 另一套字幕。
 *   · 时间轴走拍网格，不走幕表
 *   · 整体包在 <FilmChrome value={false}> 里，关掉正片自己的章节胶囊与排版字幕
 *   · 声音走手写 cue 表（CueAudio），复用镜头里的时刻由 outerOf 反解
 */

const NEW_SHOTS: Record<string, React.FC<{ t: number; dur: number }>> = {
  void: StarVoid,
  woven: WovenMark,
  endcard: EndCard,
};

interface UsTrailerProps {
  includeAudio?: boolean;
}

export const UsTrailer: React.FC<UsTrailerProps> = ({ includeAudio = true }) => {
  const { fps } = useVideoConfig();
  const cues = React.useMemo(() => buildTrailerCues(), []);

  return (
    <FilmChrome value={false}>
      <AbsoluteFill style={{ backgroundColor: US_THEME.colors.bg }}>
        {TRAILER.shots.map((shot) => {
          // 入场是「交叠浮现」：本镜头提前 enterSec 秒起，压在上一个镜头上面淡入，
          // 上一个镜头原样被盖住。否则每个切点都会黑一帧。
          const enter = shot.enterSec ?? 0;
          const from = Math.max(0, Math.round((localOf(shot.fromSec) - enter) * fps));
          const frames = Math.max(1, Math.round((shot.durSec + enter) * fps));
          return (
            <Sequence
              key={shot.id}
              from={from}
              durationInFrames={frames}
              name={shot.label}
              premountFor={fps}
            >
              <ShotHost shot={shot} enterSec={enter} />
            </Sequence>
          );
        })}

        {/* 预告片自己的一套字幕 */}
        {SUPERS.map((s, i) => (
          <Sequence
            key={`super-${i}`}
            from={Math.round(localOf(s.atSec) * fps)}
            durationInFrames={Math.round(s.durSec * fps)}
            name={`SUPER · ${s.text}`}
          >
            <SuperCard text={s.text} sub={s.sub} durSec={s.durSec} />
          </Sequence>
        ))}

        {includeAudio && (
          <CueAudio
            cues={cues}
            manifest={manifestData as any}
            music={TRAILER_MUSIC_SPEC}
            layerDb={{ MUSIC: 0, BG: -2, TEX: 0, RISER: 0, IMPACT: 0, UI: -1 }}
          />
        )}
      </AbsoluteFill>
    </FilmChrome>
  );
};

export const TRAILER_SECONDS = TRAILER_LENGTH;

const ShotHost: React.FC<{ shot: ResolvedShot<TrailerShot>; enterSec: number }> = ({
  shot,
  enterSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Sequence 提前了 enterSec 秒，镜头自己的时间要减回去；交叠期间停在第一帧
  const t = Math.max(0, frame / fps - enterSec);
  const enter = enterSec > 0 ? clamp01(frame / fps / enterSec) : 1;
  const content =
    shot.kind === 'reuse' ? (
      <ReuseShot shot={shot} t={t} />
    ) : (
      React.createElement(NEW_SHOTS[shot.id] ?? StarVoid, { t, dur: shot.durSec })
    );

  // 入场：模糊 + 轻微放大浮现，上一个镜头原样被盖住
  return (
    <AbsoluteFill
      style={{
        opacity: enter,
        filter: enter < 1 ? `blur(${((1 - enter) * 12).toFixed(2)}px)` : undefined,
        transform: enter < 1 ? `scale(${(1 + (1 - enter) * 0.025).toFixed(4)})` : undefined,
      }}
    >
      {content}
    </AbsoluteFill>
  );
};

const SuperCard: React.FC<{ text: string; sub?: string; durSec: number }> = ({
  text,
  sub,
  durSec,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const inP = easeOutCubic(clamp01(t / 0.45));
  const outP = clamp01((t - (durSec - 0.4)) / 0.4);
  const alpha = inP * (1 - outP);

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: 128,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          fontFamily: US_THEME.fonts.display,
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: '0.14em',
          color: US_THEME.colors.whiteCore,
          opacity: alpha,
          transform: `translateY(${((1 - inP) * 14).toFixed(2)}px)`,
          textShadow: '0 2px 30px rgba(0,0,0,0.85)',
        }}
      >
        {text}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 12,
            fontFamily: US_THEME.fonts.mono,
            fontSize: 13,
            letterSpacing: '0.38em',
            color: US_THEME.colors.goldCore,
            opacity: alpha * 0.9,
          }}
        >
          {sub}
        </div>
      )}
    </AbsoluteFill>
  );
};
