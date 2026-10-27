/**
 * 水彩晕染 / 水墨扩散（Canvas 2D，按种子确定，支持超采样）
 *
 *   <WatercolorWash width={1920} height={1080} shape={blobShape([600, 500], 220)} color="#3A6EA5"
 *     progress={draw(t, 0.5, 2.5)} seed={7} />
 *   <InkBleed width={1920} height={1080} center={[1300, 520]} radius={260} progress={stroke(t, 1, 3)} />
 *
 * 风格全靠参数：颜色、层数、毛糙度、生长方式、纸纹颗粒强度。
 * 水彩的层几何只在 seed / 形状变化时算一次（useMemo），每帧只做缩放和叠色。
 * 水墨按 1/4 分辨率算场再放大（墨的边缘本来就是虚的，放大的柔化正好），每帧几十毫秒。
 */

import React, { useCallback, useMemo } from 'react';
import { SketchCanvas } from '../SketchCanvas';
import { planWash, inkAt, P2 } from '../../shared/watercolor';
import { clamp01, easeOutCubic, createRng } from '../../shared/anim';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface WatercolorWashProps {
  width: number;
  height: number;
  shape: P2[];
  color: string;
  /** 0→1 晕开进度 */
  progress?: number;
  seed?: number;
  layers?: number;
  /** 边缘毛糙度 0.05–0.3 */
  variance?: number;
  /** 每层不透明度，0.02–0.06；层数 × 它 ≈ 色块中心的浓度 */
  layerAlpha?: number;
  /** 纸纹颗粒（颜料沉在纸纹凹处的斑驳），0 关闭 */
  granulation?: number;
  /** 边缘积色：颜料在水痕边缘聚集的那一圈深边（水彩最有辨识度的特征），0 关闭 */
  edgeDarkening?: number;
  ssaa?: number;
  style?: React.CSSProperties;
}

export const WatercolorWash: React.FC<WatercolorWashProps> = ({
  width,
  height,
  shape,
  color,
  progress = 1,
  seed = 1,
  layers = 40,
  variance = 0.12,
  layerAlpha = 0.035,
  granulation = 0.35,
  edgeDarkening = 0.5,
  ssaa,
  style,
}) => {
  const plan = useMemo(() => planWash(shape, { seed, layers, variance }), [JSON.stringify(shape), seed, layers, variance]); // eslint-disable-line react-hooks/exhaustive-deps
  const [r, g, b] = hexToRgb(color);
  const p = clamp01(progress);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (p <= 0) return;
      const [cx, cy] = plan.center;
      ctx.save();
      plan.layers.forEach((layer, i) => {
        // 每层自己的生长曲线：外圈慢、内圈快 —— 颜料由浓到淡向外渗
        const lp = easeOutCubic(clamp01(p * layer.growth));
        const s = 0.15 + 0.85 * lp;
        // 后面的层晚一点出现，层层叠深
        const a = layerAlpha * clamp01(p * 1.6 - (i / plan.layers.length) * 0.6);
        if (a <= 0) return;
        ctx.beginPath();
        layer.pts.forEach(([x, y], k) => {
          const X = cx + (x - cx) * s;
          const Y = cy + (y - cy) * s;
          if (k === 0) ctx.moveTo(X, Y);
          else ctx.lineTo(X, Y);
        });
        ctx.closePath();
        ctx.fillStyle = `rgba(${r},${g},${b},${a.toFixed(4)})`;
        ctx.fill();
        if (edgeDarkening > 0) {
          // 每层轮廓描一道很淡的深色细边：几十层叠起来，边缘就有一圈不规则的积色
          ctx.strokeStyle = `rgba(${Math.round(r * 0.7)},${Math.round(g * 0.7)},${Math.round(b * 0.7)},${(a * edgeDarkening * 2.2).toFixed(4)})`;
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }
      });
      // 纸纹颗粒：在已上色的区域里按种子散布小透明点，把颜料「吃掉」一点 —— 斑驳感
      if (granulation > 0) {
        const rng = createRng(seed * 31 + 17);
        ctx.globalCompositeOperation = 'destination-out';
        const xs = plan.layers[0].pts.map((q) => q[0]);
        const ys = plan.layers[0].pts.map((q) => q[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const count = Math.round(((maxX - minX) * (maxY - minY)) / 90);
        for (let k = 0; k < count; k++) {
          const x = minX + rng() * (maxX - minX);
          const y = minY + rng() * (maxY - minY);
          ctx.fillStyle = `rgba(0,0,0,${(granulation * rng() * 0.5).toFixed(3)})`;
          ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
    },
    [plan, p, r, g, b, layerAlpha, granulation, edgeDarkening, seed]
  );

  return <SketchCanvas width={width} height={height} time={p} ssaa={ssaa} draw={draw} style={style} />;
};

export interface InkBleedProps {
  width: number;
  height: number;
  center: P2;
  radius: number;
  progress?: number;
  color?: string;
  /** 边界毛糙度（占半径比例） */
  rough?: number;
  /** 前沿虚化宽度 */
  feather?: number;
  /** 前沿积墨强度 */
  rim?: number;
  seed?: string;
  /** 计算分辨率（相对画布），缺省 0.25 */
  resolution?: number;
  style?: React.CSSProperties;
}

export const InkBleed: React.FC<InkBleedProps> = ({
  width,
  height,
  center,
  radius,
  progress = 1,
  color = '#141414',
  rough = 0.22,
  feather = 0.1,
  rim = 0.3,
  seed = 'ink',
  resolution = 0.35,
  style,
}) => {
  const [r, g, b] = hexToRgb(color);
  const p = clamp01(progress);
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (p <= 0) return;
      // 只算墨可能到达的包围盒
      const R = radius * (1 + rough) * 1.05;
      const x0 = Math.max(0, Math.floor(center[0] - R));
      const y0 = Math.max(0, Math.floor(center[1] - R));
      const x1 = Math.min(width, Math.ceil(center[0] + R));
      const y1 = Math.min(height, Math.ceil(center[1] + R));
      const w = Math.max(1, Math.round((x1 - x0) * resolution));
      const h = Math.max(1, Math.round((y1 - y0) * resolution));
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const octx = off.getContext('2d');
      if (!octx) return;
      const img = octx.createImageData(w, h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const x = x0 + (i + 0.5) / resolution;
          const y = y0 + (j + 0.5) / resolution;
          const v = inkAt(x, y, center, radius, p, { seed, rough, feather, rim });
          const o = (j * w + i) * 4;
          img.data[o] = r;
          img.data[o + 1] = g;
          img.data[o + 2] = b;
          img.data[o + 3] = Math.round(v * 255);
        }
      }
      octx.putImageData(img, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    },
    [p, center[0], center[1], radius, rough, feather, rim, seed, resolution, r, g, b, width, height] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <SketchCanvas width={width} height={height} time={p} draw={draw} style={style} />;
};
