/**
 * 通用后期链（architecture.html §6.5 / §7）
 *
 * 顺序固定：DOF → Bloom → ToneMapping → 调色 Grade → Vignette → Noise，EffectComposer multisampling 4。
 * 由 us 短片的 world/Post.tsx 提炼而来（那份是片内专用的，参数跟剧情绑定；这里参数全部外露）。
 *
 * 三条踩坑记录：
 *   · EffectComposer 挂载时把 gl.toneMapping 设成 NoToneMapping，所以链里必须显式有 <ToneMapping/>；
 *   · 金色要用 ACES，AgX 会把亮金洗成白 —— 缺省 ACES，--props '{"tone":"agx"}' 只在看样比对时切；
 *   · ThreeCanvas 是手动单帧：composer 的 pass 在它自己的 effect 里才建好，
 *     得在它之后再推进一帧并挂 delayRender，否则截到全黑（内置的 ComposerKick 负责）；
 *   · 效果时间（Noise 的颗粒等）由 EffectMaterial.time 累加 R3F 的帧间增量，
 *     而 @remotion/three 的 ThreeCanvas 用墙钟（performance 计时器）推进 —— 同一帧渲两次颗粒不同。
 *     这里接管 composer.render：每次渲之前把效果时间直接设成影片时间 t、增量给 0（useFilmTime）。
 *
 * 预览降档：Studio 交互时（useRenderQuality() === 'preview'）去掉景深、多重采样降到 0；出片恒走全量。
 * 降档不碰 dpr。
 */

import React from 'react';
import { useThree } from '@react-three/fiber';
import {
  EffectComposer,
  DepthOfField,
  Bloom,
  ToneMapping,
  HueSaturation,
  BrightnessContrast,
  Vignette,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction, EffectComposer as PPComposer } from 'postprocessing';
import { continueRender, delayRender, getInputProps } from 'remotion';
import { useRenderQuality } from './FilmCanvas';

export interface FilmPostProps {
  /** 影片时间（秒）：推进时用它做时间戳，不用墙钟 */
  t: number;
  /**
   * 景深。target 给定时按这个世界点对焦（每帧跟着相机算焦距，focusDistance 被忽略），
   * worldFocusRange 是焦内的景深厚度（世界单位）；不给 target 时用归一化的 focusDistance。
   */
  dof?: { focusDistance: number; focalLength?: number; bokehScale?: number; target?: [number, number, number]; worldFocusRange?: number } | false;
  bloom?: { intensity: number; threshold?: number; smoothing?: number } | false;
  /** 缺省 ACES；--props '{"tone":"agx"}' 可在出片时整体切 AgX */
  tone?: 'aces' | 'agx';
  grade?: { saturation?: number; brightness?: number; contrast?: number } | false;
  vignette?: { offset?: number; darkness?: number } | false;
  noise?: { opacity?: number } | false;
  exposure?: number;
  multisampling?: number;
  /** 色差（镜头边缘的红蓝分离），offset 是像素比例，如 0.002；缺省关 */
  chroma?: { offset: number } | false;
}

function toneFromProps(fallback: 'aces' | 'agx'): ToneMappingMode {
  let tone = '';
  try {
    tone = String((getInputProps() as Record<string, unknown>)?.tone ?? '');
  } catch {
    tone = '';
  }
  const pick = (tone || fallback).toLowerCase();
  return pick === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;
}

/** 必须排在 <EffectComposer> 之后：effect 子先父后、同级按顺序，这样它一定晚于 composer 建好 */
const ComposerKick: React.FC<{ timeMs: number }> = ({ timeMs }) => {
  const advance = useThree((s) => s.advance);
  const [handle] = React.useState(() => delayRender('等 EffectComposer 渲出第一帧'));
  React.useEffect(() => {
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
    const raf = requestAnimationFrame(() => {
      advance(timeMs);
      release();
    });
    return () => {
      cancelAnimationFrame(raf);
      release();
    };
  }, [advance, handle, timeMs]);
  return null;
};

/**
 * 把 composer 的效果时间钉在影片时间上：渲之前 material.time = t，传给各 pass 的增量为 0。
 * 本链里没有依赖帧间增量的效果（自适应亮度、运动模糊之类），所以增量给 0 不影响画面。
 */
function useFilmTime(c: PPComposer | null, t: number): void {
  const tRef = React.useRef(t);
  tRef.current = t;
  // composer 是 @react-three/postprocessing 异步建的（先是 null），所以按实例而不是按 ref 挂
  React.useLayoutEffect(() => {
    if (!c) return;
    const orig = c.render.bind(c);
    c.render = () => {
      for (const p of c.passes) {
        const m = (p as unknown as { fullscreenMaterial?: { time?: number } }).fullscreenMaterial;
        if (m && typeof m.time === 'number') m.time = tRef.current;
      }
      orig(0);
    };
    return () => {
      c.render = orig;
    };
  }, [c]);
}

export const FilmPost: React.FC<FilmPostProps> = ({
  t,
  dof = { focusDistance: 0.02, focalLength: 0.035, bokehScale: 2.4 },
  bloom = { intensity: 0.3, threshold: 0.45, smoothing: 0.35 },
  tone = 'aces',
  grade = { saturation: 0.08, brightness: -0.02, contrast: 0.06 },
  vignette = { offset: 0.26, darkness: 0.7 },
  noise = { opacity: 0.18 },
  exposure = 1.0,
  multisampling = 4,
  chroma = false,
}) => {
  const gl = useThree((s) => s.gl);
  const preview = useRenderQuality() === 'preview';
  const [composer, setComposer] = React.useState<PPComposer | null>(null);
  useFilmTime(composer, t);
  React.useLayoutEffect(() => {
    // 映射模式交给链里的 <ToneMapping/>，这里只管曝光
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  // EffectComposer 的 children 不接受 false/null，按开关拼数组
  const effects: React.ReactElement[] = [];
  if (dof && !preview) {
    effects.push(
      <DepthOfField
        key="dof"
        focusDistance={dof.focusDistance}
        focalLength={dof.focalLength ?? 0.035}
        bokehScale={dof.bokehScale ?? 2.4}
        {...(dof.target ? { target: dof.target, worldFocusRange: dof.worldFocusRange ?? 2 } : {})}
      />
    );
  }
  if (bloom) {
    effects.push(
      <Bloom key="bloom" intensity={bloom.intensity} luminanceThreshold={bloom.threshold ?? 0.45} luminanceSmoothing={bloom.smoothing ?? 0.35} mipmapBlur />
    );
  }
  if (chroma) effects.push(<ChromaticAberration key="chroma" offset={[chroma.offset, chroma.offset * 0.6]} radialModulation={false} modulationOffset={0} />);
  effects.push(<ToneMapping key="tone" mode={toneFromProps(tone)} />);
  if (grade) {
    effects.push(<HueSaturation key="sat" hue={0} saturation={grade.saturation ?? 0} />);
    effects.push(<BrightnessContrast key="bc" brightness={grade.brightness ?? 0} contrast={grade.contrast ?? 0} />);
  }
  if (vignette) effects.push(<Vignette key="vig" eskil={false} offset={vignette.offset ?? 0.26} darkness={vignette.darkness ?? 0.7} />);
  // 颗粒用 OVERLAY 而不是 SOFT_LIGHT：调色把饱和色的某个通道压到负值时，SOFT_LIGHT 公式里的开方得到 NaN，
  // 整块面直接变纯黑（FlightProbe 实测：ACES + 调色 + 柔光颗粒三者同开，橙色背光面全黑）
  if (noise) effects.push(<Noise key="noise" premultiply blendFunction={BlendFunction.OVERLAY} opacity={noise.opacity ?? 0.18} />);

  return (
    <>
      <EffectComposer ref={setComposer} multisampling={preview ? 0 : multisampling} enableNormalPass={false}>
        {effects}
      </EffectComposer>
      <ComposerKick timeMs={t * 1000} />
    </>
  );
};
