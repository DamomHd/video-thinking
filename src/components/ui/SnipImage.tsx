/**
 * 工业级截片防缓存加载组件 (Deterministic SnipImage)
 * 严格遵循 LoomCare §7.2 避坑规范第 10 条：
 * "截片等生成图同名覆盖时，Studio 按地址缓存旧图：生成资源带内容指纹，强制突破浏览器缓存"
 */

import React from 'react';
import { Img } from 'remotion';

export interface SnipImageProps {
  src: string;
  fingerprint?: string; // 内容哈希指纹或时间戳
  alt?: string;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
  showShadow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const SnipImage: React.FC<SnipImageProps> = ({
  src,
  fingerprint,
  alt = 'Snip Image',
  width = '100%',
  height = 'auto',
  borderRadius = 12,
  showShadow = true,
  className,
  style,
}) => {
  // 注入指纹参数突破浏览器与 Remotion Studio 的硬缓存
  // data: / blob: 地址本身就是内容，拼查询参数会把它拼坏（图直接裂掉），只给普通地址加指纹
  const finalSrc = fingerprint && !/^(data|blob):/.test(src)
    ? `${src}${src.includes('?') ? '&' : '?'}v=${encodeURIComponent(fingerprint)}`
    : src;

  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius,
        overflow: 'hidden',
        boxShadow: showShadow
          ? '0 20px 50px -10px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.15)'
          : 'none',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        position: 'relative',
        ...style,
      }}
    >
      {/* Remotion 的 Img 自带 delayRender：图没到位不出帧（§7「资源加载一律挂 delayRender」） */}
      <Img
        src={finalSrc}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
};
