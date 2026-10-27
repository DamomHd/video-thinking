import React from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { delayRender, continueRender } from 'remotion';
import {
  EffectComposer,
  DepthOfField,
  Bloom,
  ToneMapping,
  HueSaturation,
  BrightnessContrast,
  Vignette,
  Noise,
} from '@react-three/postprocessing';
import { ToneMappingMode, BlendFunction } from 'postprocessing';
import { getInputProps } from 'remotion';

/** 色调映射模式：--props '{"tone":"agx"}' 切 AgX，缺省 ACES（附录 B） */
function toneMode(): ToneMappingMode {
  let tone = '';
  try {
    tone = String((getInputProps() as Record<string, unknown>)?.tone ?? '');
  } catch {
    tone = '';
  }
  return tone.toLowerCase() === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;
}

/**
 * 短片后期链 (对标 §6.5)
 * 顺序固定：DOF → Bloom → ToneMapping(ACES) → 调色 Grade → Vignette → Noise
 *
 * 两条踩坑记录照搬 §7：
 *   · EffectComposer 挂载时会把 gl.toneMapping 设成 NoToneMapping，
 *     所以必须在效果链里显式补一个 <ToneMapping/>；
 *   · 金色要用 ACES，AgX 会把亮金洗成白。
 *   · 不许中途切 dpr，否则 EffectComposer 会重建并丢失 WebGL 上下文。
 */

export interface PostProps {
  /** 0..1，用来让景深与辉光跟着剧情走 */
  weave: number;
  /** 多重采样；渲染时固定，不随预览状态变 */
  multisampling?: number;
}

/**
 * EffectComposer 挂载后补一次推进。
 *
 * ThreeCanvas 是「手动单帧」模型：它在 useEffect 里调一次 advance() 就把这一帧交出去。
 * 而 EffectComposer 一挂上就以高优先级接管了渲染（默认渲染被跳过），
 * 但它的 pass 要在自己的 effect 里才建好 —— 那一次 advance 跑在它准备好之前，
 * 结果就是整块画布全黑。
 *
 * React 的 effect 是子先父后、同级按顺序，所以把这个组件放在 <EffectComposer> 之后，
 * 它的 effect 一定晚于 composer 建好，这时再 advance 一次，画面就出来了。
 */
const ComposerKick: React.FC<{ timeMs: number }> = ({ timeMs }) => {
  const advance = useThree((s) => s.advance);
  const [handle] = React.useState(() => delayRender('等 EffectComposer 渲出第一帧'));

  React.useEffect(() => {
    // 只放行一次：正常路径和清理路径共用同一个 release，
    // 这样文件里只有一处 continueRender，守门的配对计数也对得上。
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };

    // 再等一个 rAF：此时 composer 的 pass 已经建好，推进一次把画面真正画出来，
    // 然后才放行 Remotion 截帧。不挂 delayRender 的话 Remotion 会先把黑帧截走。
    const raf = requestAnimationFrame(() => {
      // 时间戳用**影片时间**而不是 performance.now()：
      // 后者是墙钟，并发渲染时每个标签页拿到的值都不一样，是确定性的漏洞。
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

export const Post: React.FC<PostProps> = ({ weave, multisampling = 4 }) => {
  const { gl } = useThree();

  // EffectComposer 会覆盖 toneMapping，这里只负责曝光；映射模式交给链里的 <ToneMapping/>
  React.useLayoutEffect(() => {
    gl.toneMappingExposure = 1.0;
  }, [gl]);

  const focusDistance = 0.012 + (1 - weave) * 0.018;
  const bloomIntensity = 0.18 + weave * 0.45;

  return (
    <EffectComposer multisampling={multisampling} enableNormalPass={false}>
      <DepthOfField
        focusDistance={focusDistance}
        focalLength={0.035}
        bokehScale={2.4 + weave * 1.6}
      />
      <Bloom
        intensity={bloomIntensity}
        luminanceThreshold={0.45}
        luminanceSmoothing={0.35}
        mipmapBlur
      />
      {/*
        必须显式补：否则 EffectComposer 把 toneMapping 置成 NoToneMapping，亮金会死白。
        --props '{"tone":"agx"}' 换 AgX（附录 B）——
        缺省仍是 ACES：AgX 会把亮金洗成白，只在看样比对时才切。
      */}
      <ToneMapping mode={toneMode()} />
      {/* 调色 Grade：轻微提饱和 + 压对比，让金线和底噪拉开 */}
      <HueSaturation hue={0} saturation={0.12} />
      <BrightnessContrast brightness={-0.02} contrast={0.08} />
      <Vignette eskil={false} offset={0.26} darkness={0.82} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.22} />
    </EffectComposer>
  );
};

export { ComposerKick };
