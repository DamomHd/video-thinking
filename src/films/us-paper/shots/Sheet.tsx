import React from 'react';
import { US_PAPER_THEME as T } from '../theme';
import { clamp01, easeOutCubic, tw } from '../../../shared/anim';
import { drift, breathe } from '../../../shared/motion';

/**
 * 图幅外壳（整部片每一屏都套这一层）
 *
 * 构成和工程图纸一致：
 *   细点阵网格 → 内外双图框 → 四边坐标刻度（上下 1…6、左右 A…D）
 *   → 四角裁切标记 → 右下角图签栏（图名 / 图号 / 两行附注）
 *
 * 全片复用同一个外壳是这套风格成立的关键：观众要觉得自己在翻**同一套图纸**的不同页，
 * 而不是在看一张张独立的海报。所以这里不接受「这一屏特殊处理」的参数，
 * 只接受图号和附注。
 */

export const SHEET_W = 1920;
export const SHEET_H = 1080;

export interface SheetProps {
  /** 图号，形如 US-00 */
  code: string;
  /** 图签栏第一行：图名 */
  title: string;
  /** 图签栏第二行左：本页讲什么 */
  note?: string;
  /** 图签栏第二行右：所属系统 */
  system?: string;
  /** 顶部居中的细线标题 */
  header?: string;
  /** 暗场反转 */
  dark?: boolean;
  /**
   * 全片秒（不是幕内秒）。
   * 用来驱动持续的细微运动 —— 必须跨幕连续，否则每翻一页漂移就跳回原点。
   */
  filmSec?: number;
  /** 进场进度 0–1：网格和图框先于内容浮现 */
  intro?: number;
  children?: React.ReactNode;
}

export const Sheet: React.FC<SheetProps> = ({
  code,
  title,
  note,
  system,
  header,
  dark = false,
  intro = 1,
  filmSec = 0,
  children,
}) => {
  const bg = dark ? T.colors.ink : T.colors.paper;
  const line = dark ? T.colors.onInkFaint : T.colors.lineMid;
  const lineStrong = dark ? T.colors.onInkMid : T.colors.line;
  const text = dark ? T.colors.onInk : T.colors.text;
  const textFaint = dark ? T.colors.onInkFaint : T.colors.textFaint;
  const gridCol = dark ? T.colors.onInkGrid : T.colors.grid;
  const dotCol = dark ? T.colors.onInkGrid : T.colors.gridDot;

  const m = T.frame.margin;
  const inner = { x: m, y: m, w: SHEET_W - m * 2, h: SHEET_H - m * 2 };
  const gi = clamp01(intro);

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: bg, overflow: 'hidden' }}>
      {/*
        细点阵网格：20px 细线 + 100px 交点。

        这一层**永远在缓慢漂移**（drift）并轻微呼吸（breathe）——
        它是全片面积最大的元素，让它动是填补「细微运动」那一档最省的办法。
        幅度压到 3px / 4%：说不出哪里在动，但画面不会像一张静态图。
        纯正弦、纯 t 的函数，逐帧确定，不破坏确定性约束。
      */}
      <div
        style={{
          position: 'absolute',
          inset: -8,
          opacity: gi * breathe(filmSec, 13, 0.86, 1.0),
          transform:
            `translate(${drift(filmSec, 17, 3).toFixed(3)}px, ` +
            `${drift(filmSec, 23, 2.2, 0.31).toFixed(3)}px)`,
          backgroundImage:
            `linear-gradient(${gridCol} 1px, transparent 1px), ` +
            `linear-gradient(90deg, ${gridCol} 1px, transparent 1px), ` +
            `radial-gradient(${dotCol} 1.2px, transparent 1.2px)`,
          backgroundSize: '100px 100px, 100px 100px, 20px 20px',
          backgroundPosition: '0 0, 0 0, 10px 10px',
        }}
      />

      {/* ── 图框 + 刻度 + 裁切标记 ── */}
      <svg
        width={SHEET_W}
        height={SHEET_H}
        style={{ position: 'absolute', left: 0, top: 0, opacity: gi }}
      >
        {/* 内图框 */}
        <rect
          x={inner.x}
          y={inner.y}
          width={inner.w}
          height={inner.h}
          fill="none"
          stroke={line}
          strokeWidth={1}
        />

        {/* 横向分区刻度（上下各一排数字） */}
        {Array.from({ length: T.frame.cols + 1 }, (_, i) => {
          const x = inner.x + (inner.w / T.frame.cols) * i;
          return (
            <g key={`c${i}`}>
              <line x1={x} y1={inner.y} x2={x} y2={inner.y + T.frame.tickLen} stroke={line} strokeWidth={1} />
              <line x1={x} y1={inner.y + inner.h - T.frame.tickLen} x2={x} y2={inner.y + inner.h} stroke={line} strokeWidth={1} />
              {i < T.frame.cols && (
                <>
                  <text
                    x={x + inner.w / T.frame.cols / 2}
                    y={inner.y - 12}
                    fill={textFaint}
                    fontSize={13}
                    fontFamily={T.fonts.mono}
                    textAnchor="middle"
                  >
                    {i + 1}
                  </text>
                  <text
                    x={x + inner.w / T.frame.cols / 2}
                    y={inner.y + inner.h + 24}
                    fill={textFaint}
                    fontSize={13}
                    fontFamily={T.fonts.mono}
                    textAnchor="middle"
                  >
                    {i + 1}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* 纵向分区刻度（左右各一列字母） */}
        {T.frame.rows.map((r, i) => {
          const step = inner.h / T.frame.rows.length;
          const y = inner.y + step * i;
          return (
            <g key={r}>
              <line x1={inner.x} y1={y} x2={inner.x + T.frame.tickLen} y2={y} stroke={line} strokeWidth={1} />
              <line x1={inner.x + inner.w - T.frame.tickLen} y1={y} x2={inner.x + inner.w} y2={y} stroke={line} strokeWidth={1} />
              <text x={inner.x - 20} y={y + step / 2 + 5} fill={textFaint} fontSize={13} fontFamily={T.fonts.mono} textAnchor="middle">
                {r}
              </text>
              <text x={inner.x + inner.w + 20} y={y + step / 2 + 5} fill={textFaint} fontSize={13} fontFamily={T.fonts.mono} textAnchor="middle">
                {r}
              </text>
            </g>
          );
        })}

        {/* 四角裁切标记 ✛ */}
        {[
          [m - 18, m - 18],
          [SHEET_W - m + 18, m - 18],
          [m - 18, SHEET_H - m + 18],
          [SHEET_W - m + 18, SHEET_H - m + 18],
        ].map(([cx, cy], i) => (
          <g key={`x${i}`} stroke={line} strokeWidth={1}>
            <line x1={cx - 9} y1={cy} x2={cx + 9} y2={cy} />
            <line x1={cx} y1={cy - 9} x2={cx} y2={cy + 9} />
            <circle cx={cx} cy={cy} r={4.5} fill="none" />
          </g>
        ))}
      </svg>

      {/* ── 顶部细线标题 ── */}
      {header && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: m + 52,
            width: SHEET_W,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            opacity: gi,
          }}
        >
          <div style={{ width: 52, height: 1, backgroundColor: line }} />
          <div
            style={{
              fontFamily: T.fonts.text,
              fontSize: 15,
              letterSpacing: '4px',
              color: textFaint,
            }}
          >
            {header}
          </div>
          <div style={{ width: 52, height: 1, backgroundColor: line }} />
        </div>
      )}

      {/* ── 内容层 ── */}
      {children}

      {/* ── 右下角图签栏 ── */}
      <div
        style={{
          position: 'absolute',
          right: m,
          bottom: m,
          width: 420,
          border: `1px solid ${lineStrong}`,
          backgroundColor: dark ? 'rgba(14,14,15,0.86)' : 'rgba(245,243,239,0.86)',
          opacity: gi,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '9px 14px',
            borderBottom: `1px solid ${line}`,
            fontFamily: T.fonts.mono,
            fontSize: 13,
            letterSpacing: '2px',
            color: text,
          }}
        >
          <span>{title}</span>
          <span style={{ color: T.colors.accentDeep }}>{code}</span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '7px 14px',
            fontFamily: T.fonts.text,
            fontSize: 12,
            letterSpacing: '1px',
            color: textFaint,
          }}
        >
          <span>{note ?? ''}</span>
          <span>{system ?? ''}</span>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 图纸上的通用零件                                                     */
/* ------------------------------------------------------------------ */

/**
 * 大标题：黑体 + 大字距。
 * 参考片的标题永远顶在左上或居中偏上，下面压一行极小的说明 —— 这是这套风格的骨架。
 */
export const Heading: React.FC<{
  t: number;
  from: number;
  /** 章节号，如 "01 · 记录" */
  kicker?: string;
  title: string;
  sub?: string;
  x: number;
  y: number;
  size?: number;
  align?: 'left' | 'center';
  dark?: boolean;
  width?: number;
}> = ({ t, from, kicker, title, sub, x, y, size = 54, align = 'left', dark = false, width = 900 }) => {
  const p = easeOutCubic(tw(t, from, from + 0.7));
  if (p <= 0) return null;
  const text = dark ? T.colors.onInk : T.colors.text;
  const faint = dark ? T.colors.onInkFaint : T.colors.textFaint;
  const mid = dark ? T.colors.onInkMid : T.colors.textMid;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        textAlign: align,
        opacity: p,
        transform: `translateY(${(1 - p) * 10}px)`,
      }}
    >
      {kicker && (
        <div
          style={{
            fontFamily: T.fonts.mono,
            fontSize: 13,
            letterSpacing: '3px',
            color: faint,
            marginBottom: 12,
          }}
        >
          — {kicker}
        </div>
      )}
      <div
        style={{
          fontFamily: T.fonts.display,
          fontSize: size,
          fontWeight: 600,
          letterSpacing: '3px',
          color: text,
          lineHeight: 1.22,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 14,
            fontFamily: T.fonts.text,
            fontSize: 17,
            letterSpacing: '1.5px',
            color: mid,
            lineHeight: 1.7,
            opacity: clamp01((p - 0.3) / 0.7),
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

/** 标注引线 + 小标签（制图里的「指引」） */
export const Callout: React.FC<{
  t: number;
  from: number;
  /** 指向点 */
  toX: number;
  toY: number;
  /** 标签位置 */
  atX: number;
  atY: number;
  label: string;
  dark?: boolean;
}> = ({ t, from, toX, toY, atX, atY, label, dark = false }) => {
  const p = easeOutCubic(tw(t, from, from + 0.5));
  if (p <= 0) return null;
  const line = dark ? T.colors.onInkFaint : T.colors.lineThin;
  const faint = dark ? T.colors.onInkMid : T.colors.textFaint;
  const len = Math.hypot(toX - atX, toY - atY);

  return (
    <>
      <svg width={SHEET_W} height={SHEET_H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <line
          x1={atX}
          y1={atY}
          x2={atX + (toX - atX) * p}
          y2={atY + (toY - atY) * p}
          stroke={line}
          strokeWidth={1}
          strokeDasharray={`${len} ${len}`}
        />
        <circle cx={toX} cy={toY} r={2.6} fill={T.colors.accentDeep} opacity={clamp01((p - 0.7) / 0.3)} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: atX,
          top: atY - 9,
          transform: 'translateX(-50%)',
          fontFamily: T.fonts.text,
          fontSize: 13,
          letterSpacing: '1px',
          color: faint,
          opacity: p,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </>
  );
};
