import React from 'react';
import { SketchCanvas } from '../../../../components/SketchCanvas';
import { clamp01, camOut, easeOutCubic, createRng } from '../../../../shared/anim';
import { US_THEME } from '../../theme';

const C = US_THEME.colors;

/**
 * 预告片自己的新镜头（对标 §6.5 的 PaperVoid / WovenMark）
 * 都是 Canvas 2D 的确定性手稿绘制：逐帧纯函数、种子随机、按 SSAA 倍数画。
 */

/* ------------------------------------------------------------------ */
/* 01 StarVoid —— 星域开场                                            */
/* ------------------------------------------------------------------ */

export const StarVoid: React.FC<{ t: number; dur: number }> = ({ t, dur }) => {
  const p = clamp01(t / dur);
  return (
    <div style={{ width: 1920, height: 1080, background: C.bg, position: 'relative' }}>
      <SketchCanvas
        width={1920}
        height={1080}
        time={t}
        ssaa={2}
        enableGlow
        glowBlurPx={26}
        glowAlpha={0.42}
        draw={(ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          const rand = createRng(20261024);
          const cx = w / 2;
          const cy = h / 2;

          // 星尘：从中心向外推开，越晚越远
          const push = easeOutCubic(p);
          for (let i = 0; i < 420; i++) {
            const a = rand() * Math.PI * 2;
            const r0 = 40 + rand() * 520;
            const r = r0 * (0.55 + push * 0.9);
            const x = cx + Math.cos(a) * r * 1.5;
            const y = cy + Math.sin(a) * r;
            const size = 0.6 + rand() * 1.8;
            const alpha = (0.1 + rand() * 0.5) * clamp01(p * 2.2);
            ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
          }

          // 两颗主星：从远处相向靠近
          const gap = (1 - camOut(p)) * 300 + 70;
          for (const [sx, color] of [[-1, C.goldCore], [1, C.whiteCore]] as const) {
            const x = cx + sx * gap;
            const glow = ctx.createRadialGradient(x, cy, 0, x, cy, 90);
            glow.addColorStop(0, color);
            glow.addColorStop(0.35, `${color}66`);
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, cy, 90, 0, Math.PI * 2);
            ctx.fill();
          }

          // 连接两星的细线，最后一拍才出现
          const linkP = clamp01((p - 0.6) / 0.4);
          if (linkP > 0) {
            ctx.strokeStyle = `rgba(245,158,11,${(0.55 * linkP).toFixed(3)})`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx - gap, cy);
            ctx.lineTo(cx - gap + 2 * gap * linkP, cy);
            ctx.stroke();
          }
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 05 WovenMark —— 在 Canvas 上把 "US" 一笔笔织出来                    */
/* ------------------------------------------------------------------ */

/** "US" 的笔画骨架（归一化坐标，按笔画顺序织） */
const STROKES: [number, number][][] = [
  // U：左竖 → 底弧 → 右竖
  [[0.30, 0.22], [0.30, 0.60]],
  [[0.30, 0.60], [0.345, 0.73], [0.40, 0.78], [0.455, 0.73], [0.50, 0.60]],
  [[0.50, 0.60], [0.50, 0.22]],
  // S：上弧 → 中腰 → 下弧
  [[0.70, 0.29], [0.645, 0.22], [0.575, 0.24], [0.56, 0.33], [0.60, 0.40]],
  [[0.60, 0.40], [0.665, 0.46], [0.715, 0.52]],
  [[0.715, 0.52], [0.73, 0.63], [0.665, 0.72], [0.585, 0.71], [0.555, 0.64]],
];

export const WovenMark: React.FC<{ t: number; dur: number }> = ({ t, dur }) => {
  const p = clamp01(t / dur);
  return (
    <div style={{ width: 1920, height: 1080, background: C.bg, position: 'relative' }}>
      <SketchCanvas
        width={1920}
        height={1080}
        time={t}
        ssaa={2}
        enableGlow
        glowBlurPx={18}
        glowAlpha={0.5}
        draw={(ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          const rand = createRng(777);

          // 经线：底布，先铺满
          const warpP = clamp01(p / 0.35);
          ctx.lineWidth = 1;
          for (let i = 0; i < 96; i++) {
            const x = w * 0.26 + (i / 95) * w * 0.52;
            const a = 0.05 + rand() * 0.06;
            ctx.strokeStyle = `rgba(255,255,255,${(a * warpP).toFixed(3)})`;
            ctx.beginPath();
            ctx.moveTo(x, h * 0.16);
            ctx.lineTo(x, h * 0.84);
            ctx.stroke();
          }

          // 纬线：把 US 的笔画按顺序织出来
          const weaveP = clamp01((p - 0.2) / 0.8);
          const totalLen = STROKES.length;
          STROKES.forEach((pts, si) => {
            const localP = clamp01(weaveP * totalLen - si);
            if (localP <= 0) return;
            const path = pts.map(([nx, ny]) => [nx * w, ny * h] as [number, number]);

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 16;
            ctx.strokeStyle = si < 3 ? C.whiteCore : C.goldCore;
            ctx.beginPath();
            drawPartialPath(ctx, path, localP);
            ctx.stroke();

            // 织到一半时，线头留一小段金色余晖
            if (localP < 1) {
              const tip = pointAt(path, localP);
              ctx.fillStyle = C.goldLight;
              ctx.beginPath();
              ctx.arc(tip[0], tip[1], 5, 0, Math.PI * 2);
              ctx.fill();
            }
          });
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 07 EndCard —— 收尾卡板                                             */
/* ------------------------------------------------------------------ */

export const EndCard: React.FC<{ t: number; dur: number }> = ({ t, dur }) => {
  const p = clamp01(t / dur);
  const rise = easeOutCubic(clamp01(p / 0.3));
  const out = clamp01((p - 0.82) / 0.18);
  return (
    <div
      style={{
        width: 1920,
        height: 1080,
        background: C.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 1 - out,
      }}
    >
      <div
        style={{
          fontFamily: US_THEME.fonts.display,
          fontSize: 148,
          fontWeight: 800,
          letterSpacing: '0.06em',
          color: C.whiteCore,
          textShadow: US_THEME.shadows.glowWhite,
          transform: `translateY(${((1 - rise) * 26).toFixed(2)}px)`,
          opacity: rise,
        }}
      >
        US
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: US_THEME.fonts.mono,
          fontSize: 17,
          letterSpacing: '0.42em',
          color: C.goldCore,
          opacity: clamp01((p - 0.18) / 0.25),
        }}
      >
        INTIMAMATE · 2026
      </div>
      <div
        style={{
          marginTop: 40,
          width: 240 * clamp01((p - 0.3) / 0.35),
          height: 1,
          background: `linear-gradient(90deg, transparent, ${C.goldCore}, transparent)`,
        }}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */

function pointAt(path: [number, number][], p: number): [number, number] {
  const segs = path.length - 1;
  const f = clamp01(p) * segs;
  const i = Math.min(segs - 1, Math.floor(f));
  const k = f - i;
  return [
    path[i][0] + (path[i + 1][0] - path[i][0]) * k,
    path[i][1] + (path[i + 1][1] - path[i][1]) * k,
  ];
}

function drawPartialPath(
  ctx: CanvasRenderingContext2D,
  path: [number, number][],
  p: number
): void {
  const segs = path.length - 1;
  const f = clamp01(p) * segs;
  ctx.moveTo(path[0][0], path[0][1]);
  for (let i = 0; i < segs; i++) {
    if (f >= i + 1) {
      ctx.lineTo(path[i + 1][0], path[i + 1][1]);
    } else if (f > i) {
      const tip = pointAt(path, p);
      ctx.lineTo(tip[0], tip[1]);
      break;
    } else break;
  }
}
