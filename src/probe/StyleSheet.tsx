import React from 'react';
import { AbsoluteFill } from 'remotion';
import { getStyle } from '../styles';

/**
 * 风格样张：vw style sheet <id> 渲这一张（--props '{"styleId":"…"}'）。
 * 风格只定整体气质，样张也只看气质：色板、字号阶梯、墨线层级、图框。
 * 全部静态，同一风格每次渲出来一样。
 */
export const StyleSheet: React.FC<{ styleId: string }> = ({ styleId }) => {
  const s = getStyle(styleId);
  const c = s.colors as Record<string, string>;
  // 底色、字色：先认常见键名；认不出（收录的风格键名各不相同）就按亮度对比挑——底色取色板第一个，字色取和它对比最大的
  const pick = (keys: string[]) => keys.map((k) => c[k]).find((v) => v && /^#[0-9a-f]{6}$/i.test(v));
  const hexes = Object.values(c).filter((v) => /^#[0-9a-f]{6}$/i.test(v));
  const lum = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  };
  const bg = pick(['paper', 'bg', 'bg0', 'background', 'base', 'stage', 'ground', 'canvas']) ?? hexes[0] ?? '#FFFFFF';
  const fg = pick(['text', 'ink', 'fg', 'foreground']) ?? [...hexes].sort((a, b) => Math.abs(lum(b) - lum(bg)) - Math.abs(lum(a) - lum(bg)))[0] ?? '#111111';
  const mid = c.textMid ?? `color-mix(in srgb, ${fg} 64%, ${bg})`;
  const faint = c.textFaint ?? `color-mix(in srgb, ${fg} 40%, ${bg})`;
  const lines = (['line', 'lineMid', 'lineThin', 'grid'] as const).filter((k) => c[k]);
  const f = s.frame;
  return (
    <AbsoluteFill style={{ background: bg, color: fg, fontFamily: s.fonts.text }}>
      {/* 图框（风格有图框才画） */}
      {f && (
        <div style={{ position: 'absolute', inset: f.margin, border: `1.5px solid ${c.lineMid ?? mid}` }}>
          {Array.from({ length: f.cols + 1 }, (_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${(100 * i) / f.cols}%`, top: -f.tickLen, width: 1.5, height: f.tickLen, background: c.lineMid ?? mid }} />
          ))}
          {f.rows.map((r, i) => (
            <div key={r} style={{ position: 'absolute', left: -28, top: `${(100 * (i + 0.5)) / f.rows.length}%`, font: `500 14px ${s.fonts.mono}`, color: faint }}>{r}</div>
          ))}
        </div>
      )}

      {/* 字号阶梯：标题和注释之间要拉得开 */}
      <div style={{ position: 'absolute', left: 120, top: 110 }}>
        <div style={{ font: `500 18px ${s.fonts.mono}`, color: faint, letterSpacing: 2 }}>— 01 · {s.id}</div>
        <div style={{ font: `800 84px/1.1 ${s.fonts.display}`, marginTop: 12 }}>{s.label}</div>
        <div style={{ font: `700 44px ${s.fonts.display}`, marginTop: 18 }}>二级标题 · 一句话下结论。</div>
        <div style={{ font: `400 26px ${s.fonts.text}`, color: mid, marginTop: 14 }}>正文：这是一段说明文字，用来看行距和灰度。Text 0123456789</div>
        <div style={{ font: `400 18px ${s.fonts.mono}`, color: faint, marginTop: 10 }}>MONO 注释 · AL-04 · 652,445 · 00:00–05:00</div>
      </div>

      {/* 墨线层级 */}
      <svg width={1920} height={1080} style={{ position: 'absolute', left: 0, top: 0 }}>
        {lines.map((k, i) => (
          <g key={k}>
            <line x1={120} x2={760} y1={620 + i * 56} y2={620 + i * 56} stroke={c[k]} strokeWidth={1.5} />
            <text x={790} y={625 + i * 56} fill={faint} style={{ font: `400 16px ${s.fonts.mono}` }}>{k}</text>
          </g>
        ))}
      </svg>

      {/* 色板 */}
      <div style={{ position: 'absolute', left: 1080, top: 600, width: 720, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {Object.entries(c).map(([k, v]) => (
          <div key={k} style={{ width: 132 }}>
            <div style={{ height: 40, borderRadius: 4, background: v, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }} />
            <div style={{ font: `500 13px ${s.fonts.mono}`, color: mid, marginTop: 4 }}>{k}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
