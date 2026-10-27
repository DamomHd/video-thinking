import React from 'react';
import { staticFile, Img } from 'remotion';
import { US_PAPER_THEME as T } from '../theme';
import { Sheet, Heading, Callout, SHEET_W as W, SHEET_H as H } from '../shots/Sheet';
import { clamp01, easeOutCubic, easeInOutCubic, tw, countUp } from '../../../shared/anim';

/**
 * Us「图纸」版 · 六屏
 *
 * 口径：
 *   · 每一屏都套同一个图幅外壳，只有图号和内容在变 —— 观众要觉得在翻同一套图纸
 *   · 数字全部来自 App 真实界面和商店描述，一个都不编
 *   · 元素「画出来」之后要停住让人读，不做持续运动（参考片 82% 的帧是静止的）
 */

interface SceneProps {
  t: number;
  dur: number;
  /** 全片秒 —— 驱动跨幕连续的细微漂移 */
  filmSec: number;
}

/** 本片统一的主视觉：一条水平时间基线。铁路换成标尺 —— 产品量的是时间，不是里程。 */
const AXIS_Y = H * 0.46;
const AXIS_X0 = 200;
const AXIS_X1 = W - 200;

/**
 * 时间基线：主线 + 刻度 + 端点标注。
 * draw 0–1 控制从左往右画出来。
 */
const TimeAxis: React.FC<{
  draw: number;
  dark?: boolean;
  /** 刻度数 */
  ticks?: number;
  y?: number;
  labels?: [string, string];
}> = ({ draw, dark = false, ticks = 24, y = AXIS_Y, labels }) => {
  const p = clamp01(draw);
  const line = dark ? T.colors.onInkMid : T.colors.line;
  const thin = dark ? T.colors.onInkFaint : T.colors.lineThin;
  const faint = dark ? T.colors.onInkFaint : T.colors.textFaint;
  const len = AXIS_X1 - AXIS_X0;

  return (
    <>
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {/* 主基线 */}
        <line x1={AXIS_X0} y1={y} x2={AXIS_X0 + len * p} y2={y} stroke={line} strokeWidth={1.4} />
        {/* 刻度：每格一短线，整点加长 */}
        {Array.from({ length: ticks + 1 }, (_, i) => {
          const x = AXIS_X0 + (len / ticks) * i;
          if (x > AXIS_X0 + len * p) return null;
          const major = i % 6 === 0;
          return (
            <line
              key={i}
              x1={x}
              y1={y}
              x2={x}
              y2={y + (major ? 16 : 8)}
              stroke={major ? line : (dark ? T.colors.onInkFaint : T.colors.lineMid)}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      {labels && p > 0.96 && (
        <>
          <div
            style={{
              position: 'absolute',
              left: AXIS_X0,
              top: y + 24,
              fontFamily: T.fonts.mono,
              fontSize: 13,
              letterSpacing: '2px',
              color: faint,
            }}
          >
            {labels[0]}
          </div>
          <div
            style={{
              position: 'absolute',
              left: AXIS_X1,
              top: y + 24,
              transform: 'translateX(-100%)',
              fontFamily: T.fonts.mono,
              fontSize: 13,
              letterSpacing: '2px',
              color: faint,
            }}
          >
            {labels[1]}
          </div>
        </>
      )}
    </>
  );
};

/** 基线上的一个记录点：小圆 + 一道竖线钉在轴上 */
const Mark: React.FC<{
  x: number;
  y?: number;
  /** 竖线高度（正=向上） */
  rise: number;
  p: number;
  color?: string;
  dark?: boolean;
  r?: number;
}> = ({ x, y = AXIS_Y, rise, p, color = T.colors.accentDeep, dark = false, r = 4.5 }) => {
  if (p <= 0.001) return null;
  const thin = dark ? T.colors.onInkFaint : T.colors.lineThin;
  return (
    <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
      <line x1={x} y1={y} x2={x} y2={y - rise * p} stroke={thin} strokeWidth={1} />
      <circle cx={x} cy={y - rise * p} r={r} fill={color} opacity={p} />
    </svg>
  );
};

/* ================================================================== */
/* US-00 封面（0 → 5.4s）                                             */
/* ================================================================== */

export const CoverScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  const intro = easeOutCubic(tw(t, 0, 0.9));
  const axis = easeInOutCubic(tw(t, 0.5, 2.1));
  // 2.4s：第一个记录点落在轴上（K.firstMark）
  const mark = easeOutCubic(tw(t, 2.2, 2.9));

  return (
    <Sheet
      code="US-00"
      title="Us · 亲密与独处记录"
      note="封面 · 时间标尺"
      system="本地优先 / 无服务器"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
      intro={intro}
    >
      <TimeAxis draw={axis} labels={['00:00', '24:00']} />
      <Mark x={AXIS_X0 + (AXIS_X1 - AXIS_X0) * 0.86} rise={86} p={mark} />
      <Callout
        t={t}
        from={2.9}
        toX={AXIS_X0 + (AXIS_X1 - AXIS_X0) * 0.86}
        toY={AXIS_Y - 86}
        atX={AXIS_X0 + (AXIS_X1 - AXIS_X0) * 0.86}
        atY={AXIS_Y - 128}
        label="一条记录 · 22:32 · 32min"
      />

      <Heading
        t={t}
        from={3.1}
        title="记 录"
        sub="量的是时刻，留下的是自己的节奏。"
        x={W * 0.5 - 450}
        y={H * 0.58}
        size={76}
        align="center"
        width={900}
      />
    </Sheet>
  );
};

/* ================================================================== */
/* US-01 一条记录的构成（5.15 → 10.55s）                              */
/* ================================================================== */

/** 字段明细表的一行（像零件明细） */
const FieldRow: React.FC<{
  t: number;
  from: number;
  idx: number;
  name: string;
  en: string;
  value: string;
  x: number;
  y: number;
  pro?: boolean;
}> = ({ t, from, idx, name, en, value, x, y, pro }) => {
  const p = easeOutCubic(tw(t, from, from + 0.4));
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 640,
        display: 'flex',
        alignItems: 'baseline',
        gap: 14,
        opacity: p,
        transform: `translateX(${(1 - p) * -10}px)`,
        borderBottom: `1px solid ${T.colors.lineThin}`,
        paddingBottom: 9,
      }}
    >
      <span style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textFaint, width: 26 }}>
        {String(idx).padStart(2, '0')}
      </span>
      <span style={{ fontFamily: T.fonts.text, fontSize: 19, color: T.colors.text, letterSpacing: '1px', width: 112 }}>
        {name}
      </span>
      <span style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textFaint, width: 126 }}>
        {en}
      </span>
      <span
        style={{
          fontFamily: T.fonts.mono,
          fontSize: 16,
          color: T.colors.accentDeep,
          flex: 1,
          textAlign: 'right',
        }}
      >
        {value}
      </span>
      {pro && (
        <span
          style={{
            fontFamily: T.fonts.mono,
            fontSize: 10,
            letterSpacing: '1px',
            color: T.colors.warn,
            border: `1px solid ${T.colors.warn}`,
            padding: '1px 5px',
          }}
        >
          PRO
        </span>
      )}
    </div>
  );
};

export const RecordScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  const fields: [string, string, string, boolean][] = [
    ['开始时间', 'started_at', '2026-08-12 21:22', false],
    ['持续时间', 'duration', '118 min', false],
    ['类型', 'kind', '亲密 / 独处', false],
    ['心情', 'mood', '· · · · ·', true],
    ['伴侣 / 地点', 'partner / place', '阿柚 · 卧室', false],
    ['空间位置', 'geo', '可选 · 街道级', true],
  ];

  return (
    <Sheet
      code="US-01"
      title="Us · 亲密与独处记录"
      note="一条记录的构成"
      system="记录 Record"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
    >
      <Heading
        t={t}
        from={0.2}
        kicker="01 · 记录"
        title="一条记录，六个字段。"
        sub="点一下就开始；想记多细，由你决定。"
        x={W * 0.07}
        y={H * 0.16}
        size={50}
      />

      {fields.map(([name, en, value, pro], i) => (
        <FieldRow
          key={en}
          t={t}
          from={1.1 + i * 0.22}
          idx={i + 1}
          name={name}
          en={en}
          value={value}
          pro={pro}
          x={W * 0.07}
          y={H * 0.42 + i * 62}
        />
      ))}

      {/* 右侧：四个入口的示意 */}
      <div style={{ position: 'absolute', left: W * 0.62, top: H * 0.42 }}>
        {['亲密', '独处', '计时', '模板'].map((s, i) => {
          const p = easeOutCubic(tw(t, 2.4 + i * 0.16, 2.9 + i * 0.16));
          return (
            <div
              key={s}
              style={{
                position: 'absolute',
                left: (i % 2) * 190,
                top: Math.floor(i / 2) * 104,
                width: 160,
                height: 76,
                border: `1px solid ${i === 0 ? T.colors.accentDeep : T.colors.lineMid}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: T.fonts.text,
                fontSize: 20,
                letterSpacing: '3px',
                color: i === 0 ? T.colors.accentDeep : T.colors.textMid,
                opacity: p,
                transform: `scale(${0.96 + p * 0.04})`,
              }}
            >
              {s}
            </div>
          );
        })}
      </div>
      <Callout
        t={t}
        from={3.5}
        toX={W * 0.62 + 80}
        toY={H * 0.42 + 76}
        atX={W * 0.62 + 200}
        atY={H * 0.42 + 230}
        label="四个入口 · 一屏之内"
      />
    </Sheet>
  );
};

/* ================================================================== */
/* US-02 时间之河 · 散点（10.3 → 16.1s）                              */
/* ================================================================== */

/**
 * 22 条记录按小时标在基线上。
 * 小时数据来自 App 真实界面的那一屏（多在深夜），不是随手编的分布。
 */
const RECORD_HOURS = [
  0.55, 0.53, 22.53, 21.6, 21.35, 20.75, 18.48, 23.1, 22.9, 21.8, 23.5,
  0.2, 1.1, 22.1, 20.3, 23.8, 21.0, 19.5, 0.9, 22.7, 23.2, 20.9,
];

export const RiverScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  const axis = easeInOutCubic(tw(t, 0.2, 1.4));
  const count = Math.round(countUp(t, 0, 22, 2.0));

  return (
    <Sheet
      code="US-02"
      title="Us · 亲密与独处记录"
      note="时间之河 · 散点"
      system="回顾 Review"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
    >
      <Heading
        t={t}
        from={0.2}
        kicker="02 · 时间之河"
        title="22 颗珠子，多在深夜。"
        sub="把历史摊在一条轴上 — 按篇章回顾，不排名、不打分。"
        x={W * 0.07}
        y={H * 0.14}
        size={50}
      />

      <TimeAxis draw={axis} ticks={24} labels={['00:00', '24:00']} />

      {RECORD_HOURS.map((h, i) => {
        const x = AXIS_X0 + ((AXIS_X1 - AXIS_X0) * h) / 24;
        const p = easeOutCubic(tw(t, 1.5 + i * 0.055, 1.9 + i * 0.055));
        // 深夜的点抬得高一点，让「多在深夜」一眼看得出
        const night = h < 5 || h >= 21;
        return (
          <Mark
            key={i}
            x={x}
            rise={night ? 74 + (i % 3) * 16 : 40 + (i % 3) * 10}
            p={p}
            color={night ? T.colors.accentDeep : T.colors.accentSoft}
            r={night ? 5 : 4}
          />
        );
      })}

      {/* 深夜区间的括注 */}
      <div
        style={{
          position: 'absolute',
          left: AXIS_X0 + ((AXIS_X1 - AXIS_X0) * 21) / 24,
          top: AXIS_Y + 44,
          width: ((AXIS_X1 - AXIS_X0) * 3) / 24,
          borderTop: `1px solid ${T.colors.accentDeep}`,
          borderLeft: `1px solid ${T.colors.accentDeep}`,
          borderRight: `1px solid ${T.colors.accentDeep}`,
          height: 10,
          opacity: clamp01(tw(t, 3.2, 3.8)),
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: AXIS_X0 + ((AXIS_X1 - AXIS_X0) * 22.5) / 24,
          top: AXIS_Y + 62,
          transform: 'translateX(-50%)',
          fontFamily: T.fonts.mono,
          fontSize: 13,
          letterSpacing: '1px',
          color: T.colors.accentDeep,
          opacity: clamp01(tw(t, 3.4, 4.0)),
          whiteSpace: 'nowrap',
        }}
      >
        21:00 — 24:00 · 最密
      </div>

      {/*
        每小时条数密度条：把散点换一种读法。
        参考片的习惯是同一组数据给两个视角（散点 + 分布），下半屏不留白。
      */}
      {/*
        容器给**显式高度**，所有子元素都从底边量起。
        之前容器是零高度、柱子用 height 撑、刻度用 top 定位，
        三种基准混在一起，刻度标签直接压在柱子上。
      */}
      <div
        style={{
          position: 'absolute',
          left: AXIS_X0,
          top: H * 0.60,
          width: AXIS_X1 - AXIS_X0,
          height: 190,
        }}
      >
        {/* 密度条的基线 */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 26,
            width: '100%',
            height: 1,
            backgroundColor: T.colors.lineMid,
          }}
        />
        {Array.from({ length: 24 }, (_, hr) => {
          const n = RECORD_HOURS.filter((h) => Math.floor(h) === hr).length;
          const cw = (AXIS_X1 - AXIS_X0) / 24;
          const p = easeOutCubic(tw(t, 2.6 + hr * 0.02, 3.1 + hr * 0.02));
          const hgt = n === 0 ? 3 : 10 + n * 17;
          return (
            <React.Fragment key={hr}>
              <div
                style={{
                  position: 'absolute',
                  left: hr * cw,
                  bottom: 27,
                  width: cw - 7,
                  height: hgt * p,
                  backgroundColor: n === 0 ? T.colors.paperDeep : T.colors.accentSoft,
                  borderTop: n > 0 ? `1px solid ${T.colors.accentDeep}` : 'none',
                }}
              />
              {n > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: hr * cw,
                    bottom: 27 + hgt * p + 5,
                    width: cw - 7,
                    textAlign: 'center',
                    fontFamily: T.fonts.mono,
                    fontSize: 12,
                    color: T.colors.textMid,
                    opacity: p,
                  }}
                >
                  {n}
                </div>
              )}
              {hr % 6 === 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: hr * cw,
                    bottom: 4,
                    width: cw - 7,
                    textAlign: 'left',
                    fontFamily: T.fonts.mono,
                    fontSize: 12,
                    color: T.colors.textFaint,
                    opacity: p,
                  }}
                >
                  {String(hr).padStart(2, '0')}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: AXIS_X0,
          top: H * 0.60 + 206,
          fontFamily: T.fonts.text,
          fontSize: 13,
          letterSpacing: '2px',
          color: T.colors.textFaint,
          opacity: clamp01(tw(t, 3.4, 4.0)),
        }}
      >
        每小时条数 · 同一组数据的第二种读法
      </div>

      {/* 计数器 */}
      <div
        style={{
          position: 'absolute',
          right: W * 0.08,
          top: H * 0.17,
          textAlign: 'right',
          opacity: clamp01(tw(t, 1.4, 2.0)),
        }}
      >
        <div style={{ fontFamily: T.fonts.mono, fontSize: 68, color: T.colors.text, lineHeight: 1 }}>
          {count}
        </div>
        <div style={{ fontFamily: T.fonts.text, fontSize: 14, letterSpacing: '2px', color: T.colors.textFaint, marginTop: 6 }}>
          条记录 · 本月
        </div>
      </div>
    </Sheet>
  );
};

/* ================================================================== */
/* US-03 时段分布（暗场）（15.85 → 21.45s）                           */
/* ================================================================== */

export const StatsScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  // 真实数据：周二 3 / 周三 1 / 周四 8 / 周五 2
  const bars = [0, 3, 1, 8, 2, 0, 0];
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const shotIn = easeOutCubic(tw(t, 1.6, 2.6));

  return (
    <Sheet
      code="US-03"
      title="Us · 亲密与独处记录"
      note="频率轨迹 · 周维度"
      system="统计 Insights"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
      dark
    >
      <Heading
        t={t}
        from={0.2}
        kicker="03 · 统计"
        title="最集中的时间落在周四。"
        sub="周 / 月 / 年三个维度，依指标选图表，不套同一个模板。"
        x={W * 0.07}
        y={H * 0.14}
        size={50}
        dark
      />

      {/* 柱状图：基线在 0.74H，柱子向上长 */}
      <div style={{ position: 'absolute', left: W * 0.08, top: H * 0.74 }}>
        {bars.map((v, i) => {
          const grow = easeOutCubic(tw(t, 0.9 + i * 0.1, 1.7 + i * 0.1));
          const h = v === 0 ? 10 : 22 + v * 30;
          const peak = v === 8;
          return (
            <div key={i} style={{ position: 'absolute', left: i * 92 }}>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: 40,
                  height: h * grow,
                  backgroundColor: v === 0 ? T.colors.onInkGrid : peak ? T.colors.accent : T.colors.onInkMid,
                }}
              />
              {v > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: h * grow + 10,
                    width: 40,
                    textAlign: 'center',
                    fontFamily: T.fonts.mono,
                    fontSize: 18,
                    color: peak ? T.colors.accent : T.colors.onInkMid,
                    opacity: grow,
                  }}
                >
                  {v}
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 12,
                  width: 40,
                  textAlign: 'center',
                  fontFamily: T.fonts.text,
                  fontSize: 15,
                  color: T.colors.onInkFaint,
                  opacity: grow,
                }}
              >
                {labels[i]}
              </div>
            </div>
          );
        })}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 7 * 92 - 52,
            height: 1,
            backgroundColor: T.colors.onInkFaint,
          }}
        />
      </div>

      {/* 右侧：真实界面。全片只在这一屏露产品本体 —— 它本来就是深色的，正好接上暗场 */}
      <div
        style={{
          position: 'absolute',
          right: W * 0.09,
          top: H * 0.5,
          transform: `translateY(-50%) scale(${0.97 + shotIn * 0.03})`,
          opacity: shotIn,
        }}
      >
        <div
          style={{
            width: 304,
            height: 660,
            border: `1px solid ${T.colors.onInkMid}`,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <Img
            src={staticFile('app-shots/02_stats.png')}
            style={{ position: 'absolute', left: 0, top: 0, width: 304, height: 660 }}
          />
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: T.fonts.mono,
            fontSize: 12,
            letterSpacing: '2px',
            color: T.colors.onInkFaint,
            textAlign: 'center',
          }}
        >
          实机截图 · 统计页
        </div>
      </div>
    </Sheet>
  );
};

/* ================================================================== */
/* US-04 数据边界 · 剖面（21.2 → 26.0s）                              */
/* ================================================================== */

export const PrivacyScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  const boxP = easeOutCubic(tw(t, 0.6, 1.6));
  const lockP = easeOutCubic(tw(t, 1.4, 2.2));
  const bx = W * 0.09;
  const by = H * 0.40;
  const bw = 520;
  const bh = 300;

  const outside: [string, string][] = [
    ['服务器', '不存在'],
    ['账号', '不需要'],
    ['广告', '没有'],
  ];

  return (
    <Sheet
      code="US-04"
      title="Us · 亲密与独处记录"
      note="数据边界 · 剖面"
      system="本地优先 Local-first"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
    >
      <Heading
        t={t}
        from={0.2}
        kicker="04 · 数据边界"
        title="没有服务器，自然无从收集。"
        sub="每一笔都先写在你的设备上；开了 iCloud 同步，也只经过你自己的私有容器。"
        x={W * 0.07}
        y={H * 0.14}
        size={48}
        width={1000}
      />

      {/* 设备边界：一个实线框，里面是数据，外面什么都没有 */}
      <svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        <rect
          x={bx}
          y={by}
          width={bw}
          height={bh}
          fill="none"
          stroke={T.colors.line}
          strokeWidth={1.6}
          strokeDasharray={(bw + bh) * 2}
          strokeDashoffset={(bw + bh) * 2 * (1 - boxP)}
        />
        {/* 边界外的虚线：示意「本来该有个服务器的地方」 */}
        <line
          x1={bx + bw + 60}
          y1={by + bh / 2}
          x2={bx + bw + 60 + 220 * boxP}
          y2={by + bh / 2}
          stroke={T.colors.lineThin}
          strokeWidth={1}
          strokeDasharray="5 7"
        />
        <g opacity={clamp01(tw(t, 1.8, 2.4))}>
          <rect
            x={bx + bw + 300}
            y={by + bh / 2 - 46}
            width={180}
            height={92}
            fill="none"
            stroke={T.colors.lineThin}
            strokeWidth={1}
            strokeDasharray="5 7"
          />
          <line
            x1={bx + bw + 300}
            y1={by + bh / 2 - 46}
            x2={bx + bw + 480}
            y2={by + bh / 2 + 46}
            stroke={T.colors.lineThin}
            strokeWidth={1}
          />
          <line
            x1={bx + bw + 480}
            y1={by + bh / 2 - 46}
            x2={bx + bw + 300}
            y2={by + bh / 2 + 46}
            stroke={T.colors.lineThin}
            strokeWidth={1}
          />
        </g>
      </svg>

      <div
        style={{
          position: 'absolute',
          left: bx + bw + 390,
          top: by + bh / 2 + 62,
          transform: 'translateX(-50%)',
          fontFamily: T.fonts.text,
          fontSize: 14,
          letterSpacing: '2px',
          color: T.colors.textFaint,
          opacity: clamp01(tw(t, 2.1, 2.7)),
          whiteSpace: 'nowrap',
        }}
      >
        这里本该有一台服务器
      </div>

      {/* 框内：锁 + 说明 */}
      <div
        style={{
          position: 'absolute',
          left: bx + 36,
          top: by + 40,
          opacity: lockP,
        }}
      >
        <svg width={52} height={52} viewBox="0 0 48 48">
          <path
            d="M16 20 V15 a8 8 0 0 1 16 0 V20"
            fill="none"
            stroke={T.colors.accentDeep}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeDasharray={40}
            strokeDashoffset={40 * (1 - lockP)}
          />
          <rect x={11} y={20} width={26} height={19} rx={3} fill="none" stroke={T.colors.line} strokeWidth={2} />
        </svg>
        <div
          style={{
            marginTop: 20,
            fontFamily: T.fonts.text,
            fontSize: 24,
            letterSpacing: '2px',
            color: T.colors.text,
          }}
        >
          本机 · 你的设备
        </div>
        <div
          style={{
            marginTop: 10,
            fontFamily: T.fonts.mono,
            fontSize: 13,
            letterSpacing: '1px',
            color: T.colors.textFaint,
            lineHeight: 1.9,
          }}
        >
          SQLite · 本地文件
          <br />
          Face ID / PIN 锁 · 可选伪装图标
        </div>
      </div>

      {/*
        三条「没有」。
        注意必须给子元素显式宽度 + nowrap ——
        父容器宽度为 0 时，里面绝对定位的子元素可用宽度也是 0，
        浏览器会把每个汉字都折一行（实测渲出来是竖排的）。
      */}
      <div style={{ position: 'absolute', left: W * 0.07, top: H * 0.79, width: 760 }}>
        {outside.map(([k, v], i) => {
          const p = easeOutCubic(tw(t, 2.4 + i * 0.22, 2.9 + i * 0.22));
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                left: i * 230,
                width: 210,
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                opacity: p,
              }}
            >
              <span style={{ fontFamily: T.fonts.text, fontSize: 17, color: T.colors.textMid, letterSpacing: '2px' }}>
                {k}
              </span>
              <span style={{ fontFamily: T.fonts.mono, fontSize: 20, color: T.colors.accentDeep }}>{v}</span>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
};

/* ================================================================== */
/* US-05 落版（25.75 → 30.0s）                                        */
/* ================================================================== */

export const FinaleScene: React.FC<SceneProps> = ({ t, filmSec }) => {
  const axis = easeInOutCubic(tw(t, 0.1, 1.2));
  const logoP = easeOutCubic(tw(t, 0.8, 1.8));

  /** 汇总行：全部是 App 里的真实口径 */
  const summary: [string, string][] = [
    ['记录维度', '6 字段'],
    ['万年历', '2000—2100'],
    ['统计维度', '周 / 月 / 年'],
    ['语言', '7 种'],
    ['服务器', '0'],
  ];

  return (
    <Sheet
      code="US-05"
      title="Us · 亲密与独处记录"
      note="落版 · 汇总"
      system="App Store · 搜索 Us"
      header="Us 产品说明 · 一页纸"
      filmSec={filmSec}
    >
      <TimeAxis draw={axis} ticks={24} />

      {/* 轴上均匀落一排点 —— 和封面那一个点呼应：从一条记录到一整条时间轴 */}
      {Array.from({ length: 9 }, (_, i) => {
        const x = AXIS_X0 + ((AXIS_X1 - AXIS_X0) * (i + 0.6)) / 9.8;
        const p = easeOutCubic(tw(t, 0.6 + i * 0.05, 1.0 + i * 0.05));
        return <Mark key={i} x={x} rise={30 + (i % 4) * 18} p={p} r={4} />;
      })}

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: H * 0.56,
          width: W,
          textAlign: 'center',
          opacity: logoP,
        }}
      >
        <div
          style={{
            fontFamily: T.fonts.display,
            fontSize: 104,
            fontWeight: 600,
            letterSpacing: '14px',
            color: T.colors.text,
            lineHeight: 1,
          }}
        >
          Us
        </div>
        <div
          style={{
            marginTop: 20,
            fontFamily: T.fonts.text,
            fontSize: 22,
            letterSpacing: '6px',
            color: T.colors.textMid,
            opacity: clamp01(tw(t, 1.4, 2.2)),
          }}
        >
          把关系里的微光，静静留住
        </div>
      </div>

      {/* 底部汇总行：参考片最后一屏就是这种「一行数字收口」 */}
      <div
        style={{
          position: 'absolute',
          left: W * 0.07,
          bottom: 148,
          width: W * 0.58,
          display: 'flex',
          justifyContent: 'space-between',
          borderTop: `1px solid ${T.colors.lineMid}`,
          paddingTop: 16,
          opacity: clamp01(tw(t, 1.9, 2.7)),
        }}
      >
        {summary.map(([k, v]) => (
          <div key={k} style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: T.fonts.mono, fontSize: 24, color: T.colors.text }}>{v}</div>
            <div
              style={{
                marginTop: 5,
                fontFamily: T.fonts.text,
                fontSize: 12,
                letterSpacing: '1.5px',
                color: T.colors.textFaint,
              }}
            >
              {k}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
};
