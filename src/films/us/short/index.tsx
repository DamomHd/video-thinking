import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, getInputProps } from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { FilmChrome } from '../../../components/FilmChrome';
import { CueAudio } from '../../../components/CueAudio';
import { US_THEME } from '../theme';
import manifestData from '../audio/manifest.json' with { type: 'json' };
import { SHORT_LENGTH, weaveAt } from './timeline';
import { World } from './world/World';
import { Post, ComposerKick } from './world/Post';
import { Overlays } from './Overlays';
import { buildShortCues, SHORT_MUSIC_SPEC } from './audio';

/**
 * Us 短片 (对标 architecture.html §6.5 的短片)
 * 画面全部新做：只有一个 R3F 世界 + 自写着色器 + 完整后期链。
 * 只借基础设施（anim / ssaa / CameraRig / theme），不复用正片的幕。
 * 时间按小节走；声音是手写 cue 表 + 离线剪过的配乐。
 */

interface UsShortProps {
  includeAudio?: boolean;
}

export const UsShort: React.FC<UsShortProps> = ({ includeAudio = true }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  const weave = weaveAt(t);
  const noPost = Boolean((getInputProps() as Record<string, unknown>)?.noPost);
  const cues = React.useMemo(() => buildShortCues(), []);

  return (
    <FilmChrome value={false}>
      <AbsoluteFill style={{ backgroundColor: US_THEME.colors.bg }}>
        {/*
          dpr 固定为 1：中途切 dpr 会让 EffectComposer 重建并丢失 WebGL 上下文（§7）。
          超采样靠出片时的 --scale，不靠这里。
        */}
        <ThreeCanvas
          width={width}
          height={height}
          gl={{ antialias: false }}
          camera={{ fov: 34, near: 0.1, far: 200, position: [0, 4.2, 16.5] }}
        >
          <color attach="background" args={[US_THEME.colors.bg]} />
          <World t={t} weave={weave} />
          {!noPost && <Post weave={weave} />}
          {/* 必须排在后期链之后：等 composer 的 pass 建好再补一次推进 */}
          {!noPost && <ComposerKick timeMs={t * 1000} />}
        </ThreeCanvas>

        <Overlays t={t} weave={weave} totalSec={SHORT_LENGTH} />

        {includeAudio && (
          <CueAudio
            cues={cues}
            manifest={manifestData as never}
            music={SHORT_MUSIC_SPEC}
            layerDb={{ MUSIC: 0, BG: -3, TEX: -1, RISER: 0, IMPACT: 0, UI: -2 }}
          />
        )}
      </AbsoluteFill>
    </FilmChrome>
  );
};

export const SHORT_SECONDS = SHORT_LENGTH;
