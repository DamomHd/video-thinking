import React from 'react';
import { US_THEME as T } from '../theme';
import { Phone, PhoneSwap, ScreenHighlight } from '../shots/Phone';
import { Bead, BeadStream, RiverLine, pigmentAt } from '../shots/Beads';
import { clamp01, easeOutCubic, easeOutExpo, tw, spring, countUp } from '../../../shared/anim';

/**
 * Us 30 秒社媒宣传片 · 六幕画面
 *
 * 口径：
 *   · 全部画面都是帧时间的纯函数（t = 幕内秒），没有 CSS 动画、没有随机源
 *   · 手机里是**真实截图**，不做假 UI —— 社媒上观众会拿它和 App Store 截图对照
 *   · 文案只用 App 商店页和界面里已有的说法，不替产品编新承诺
 */

const W = 1920;
const H = 1080;

interface SceneProps {
  t: number;
  dur: number;
}

/* ------------------------------------------------------------------ */
/* 公共零件                                                            */
/* ------------------------------------------------------------------ */

/** 深空底：三段紫调径向渐变叠加，越靠下越偏紫红（和 App 一致） */
const Sky: React.FC<{ drift?: number }> = ({ drift = 0 }) => (
  <div style={{ position: 'absolute', inset: 0, backgroundColor: T.colors.bgDeep }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          `radial-gradient(120% 90% at 50% ${18 + drift * 4}%, ${T.colors.bgMid} 0%, rgba(12,10,27,0) 62%), ` +
          `radial-gradient(90% 70% at 22% ${92 - drift * 3}%, ${T.colors.bgWarm} 0%, rgba(12,10,27,0) 58%), ` +
          `radial-gradient(70% 60% at 86% 76%, rgba(132,117,164,0.20) 0%, rgba(12,10,27,0) 60%)`,
      }}
    />
  </div>
);

/** 星尘：固定种子的稀疏小点，极缓慢呼吸 */
const Dust: React.FC<{ t: number; count?: number; opacity?: number }> = ({
  t,
  count = 60,
  opacity = 1,
}) => {
  const pts = React.useMemo(() => {
    const out: { x: number; y: number; r: number; ph: number }[] = [];
    let s = 20260924;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      out.push({ x: rnd() * W, y: rnd() * H, r: 0.8 + rnd() * 1.7, ph: rnd() * 6.28 });
    }
    return out;
  }, [count]);

  return (
    <>
      {pts.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: p.y,
            width: p.r * 2,
            height: p.r * 2,
            borderRadius: '50%',
            backgroundColor: T.colors.textPrimary,
            opacity: (0.10 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.8 + p.ph))) * opacity,
          }}
        />
      ))}
    </>
  );
};

/**
 * 主文案：一行大字 + 一行小字。
 * 逐字浮现太花哨，这里用整行上浮 + 字距收拢 —— 和 App 里文案的克制气质一致。
 */
const Caption: React.FC<{
  t: number;
  from: number;
  title: string;
  sub?: string;
  x: number;
  y: number;
  align?: 'left' | 'center';
  size?: number;
  /** 文案块宽度 —— 必须按本幕的留白定，压到手机上就毁了 */
  width?: number;
}> = ({ t, from, title, sub, x, y, align = 'left', size = 62, width = 840 }) => {
  const p = easeOutCubic(tw(t, from, from + 0.9));
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        textAlign: align,
        transform: `translateY(${(1 - p) * 26}px)`,
        opacity: p,
      }}
    >
      <div
        style={{
          fontFamily: T.fonts.display,
          fontSize: size,
          fontWeight: 300,
          color: T.colors.textPrimary,
          letterSpacing: `${(1 - p) * 10 + 2}px`,
          lineHeight: 1.26,
        }}
      >
        {title}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 20,
            fontFamily: T.fonts.display,
            fontSize: 27,
            fontWeight: 300,
            color: T.colors.textMuted,
            letterSpacing: '2px',
            lineHeight: 1.6,
            opacity: clamp01((p - 0.35) / 0.65),
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

/** 功能小标签：左侧一道竖光 + 标签文字 */
const Tag: React.FC<{ t: number; from: number; text: string; x: number; y: number }> = ({
  t,
  from,
  text,
  x,
  y,
}) => {
  const p = easeOutCubic(tw(t, from, from + 0.6));
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        opacity: p,
        transform: `translateX(${(1 - p) * -14}px)`,
      }}
    >
      <div
        style={{
          width: 3,
          height: 26,
          borderRadius: 2,
          background: `linear-gradient(180deg, ${T.colors.peach}, ${T.colors.rose})`,
        }}
      />
      <div
        style={{
          fontFamily: T.fonts.display,
          fontSize: 25,
          fontWeight: 400,
          color: T.colors.textSecondary,
          letterSpacing: '3px',
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 01 钩子（0 → 5.0s）                                                 */
/* ------------------------------------------------------------------ */

export const OpenScene: React.FC<SceneProps> = ({ t }) => {
  // 2.0s：第一颗珠子亮起（K.firstBead）
  const beadIn = spring(tw(t, 1.6, 3.0), { stiffness: 120, damping: 14 });
  const beadGlow = clamp01(tw(t, 1.9, 2.5));
  const skyIn = easeOutExpo(tw(t, 0, 1.6));

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', inset: 0, opacity: skyIn }}>
        <Sky />
        <Dust t={t} opacity={skyIn} />
      </div>

      {/* 一颗珠子 —— 整部片的最小单位：一条记录 */}
      <Bead
        x={W * 0.5}
        y={H * 0.44}
        r={26 * beadIn}
        color={T.colors.beadNight}
        opacity={beadIn}
        glow={0.6 + beadGlow * 1.6}
      />

      <Caption
        t={t}
        from={2.5}
        title="有些时刻，只想自己记得"
        x={W * 0.5 - 420}
        y={H * 0.56}
        align="center"
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 02 快速记录（4.6 → 10.8s）                                          */
/* ------------------------------------------------------------------ */

export const RecordScene: React.FC<SceneProps> = ({ t }) => {
  const phoneIn = spring(tw(t, 0.2, 1.6), { stiffness: 90, damping: 16 });
  // 3.2s：点一下（K.tapRecord）—— 高亮四个记录入口
  const tapP = easeOutCubic(tw(t, 2.6, 3.2)) * (1 - clamp01(tw(t, 3.4, 3.8)));
  // 4.9s：珠子落下（K.beadDrop）
  const dropP = easeOutCubic(tw(t, 4.7, 5.5));
  // 3.4s 起换屏：首页 → 记录编辑器（点完那一下真的进了编辑器）
  const swapP = tw(t, 3.4, 4.3);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sky drift={0.3} />
      <Dust t={t} count={42} opacity={0.7} />

      <div
        style={{
          position: 'absolute',
          left: W * 0.62,
          top: H * 0.5,
          transform: `translate(-50%, -50%) translateY(${(1 - phoneIn) * 70}px) scale(${0.94 + phoneIn * 0.06})`,
          opacity: phoneIn,
        }}
      >
        <PhoneSwap a="01_home.png" b="07_editor.png" progress={swapP} glow={phoneIn} push={clamp01(t / 6)}>
          {/* 四个记录入口：亲密 / 独处 / 计时 / 模板 */}
          <ScreenHighlight x={56} y={1288} w={1208} h={252} progress={tapP} />
        </PhoneSwap>
      </div>

      <Caption
        t={t}
        from={1.4}
        title="点一下，记一笔"
        sub="亲密 · 独处 · 计时 — 时间、时长、心情，想记多细都行"
        x={W * 0.07}
        y={H * 0.36}
        width={760}
      />
      <Tag t={t} from={2.6} text="万年历 2000 — 2100" x={W * 0.07} y={H * 0.55} />
      <Tag t={t} from={3.1} text="柔和标记，不用刺眼数字" x={W * 0.07} y={H * 0.62} />

      {/*
        记录落成一颗珠子，从机身左缘浮出、向左飘 ——
        它是下一幕「时间之河」的引子，所以要看得清：
        之前半径只有 20·dropP、起点又离机身太远，看起来像一粒杂点。
      */}
      <Bead
        x={W * 0.62 - 210 - dropP * 120}
        y={H * 0.5 + 60 - dropP * 90}
        r={16 + 16 * dropP}
        color={pigmentAt(23)}
        opacity={dropP}
        glow={1.6}
      />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 03 时间之河（10.4 → 17.0s）                                         */
/* ------------------------------------------------------------------ */

export const RiverScene: React.FC<SceneProps> = ({ t }) => {
  const phoneIn = easeOutCubic(tw(t, 0.2, 1.4));
  const streamIn = clamp01(tw(t, 0.6, 2.2));
  const beadCount = Math.round(countUp(t, 0, 22, 1.8));

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sky drift={0.6} />
      <Dust t={t} count={70} />

      {/* 左半屏：珠子汇成河 —— 和手机里那条河道呼应 */}
      <RiverLine t={t} width={W} height={H} centerX={W * 0.14} amp={78} opacity={streamIn * 0.9} />
      <BeadStream
        t={t}
        width={W}
        height={H}
        centerX={W * 0.14}
        count={15}
        amp={78}
        speed={52}
        opacity={streamIn}
        seed={11}
      />

      <div
        style={{
          position: 'absolute',
          left: W * 0.78,
          top: H * 0.5,
          transform: `translate(-50%, -50%) scale(${0.96 + phoneIn * 0.04})`,
          opacity: phoneIn,
        }}
      >
        <Phone shot="03_river.png" glow={phoneIn} push={clamp01(t / 6.6)} />
      </div>

      <Caption
        t={t}
        from={1.0}
        title="时间之河"
        sub="把历史变成一条温柔的时间轴，按篇章回顾"
        x={W * 0.27}
        y={H * 0.30}
        width={660}
      />

      {/* 「22 颗珠子 · 多在深夜」—— 直接用 App 里的叙事文案 */}
      <div
        style={{
          position: 'absolute',
          left: W * 0.27,
          top: H * 0.60,
          fontFamily: T.fonts.serif,
          fontSize: 34,
          fontStyle: 'italic',
          color: T.colors.textSecondary,
          letterSpacing: '2px',
          opacity: clamp01(tw(t, 2.4, 3.2)),
        }}
      >
        {beadCount} 颗珠子 · 多在深夜
      </div>

      <Tag t={t} from={3.6} text="颜色由发生的时刻决定" x={W * 0.27} y={H * 0.70} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 04 统计洞察（16.6 → 22.2s）                                         */
/* ------------------------------------------------------------------ */

export const InsightsScene: React.FC<SceneProps> = ({ t }) => {
  const phoneIn = easeOutCubic(tw(t, 0.2, 1.4));
  // 0.8s：柱子生长（K.chartGrow）
  const hiP = easeOutCubic(tw(t, 2.2, 2.9));

  /**
   * 放大图的数据必须和旁边那张截图**逐根对上** ——
   * 截图里是 周二 3 / 周三 1 / 周四 8 / 周五 2，文案也写「最集中的时间落在周四」。
   * 之前这里少了周一的 0，整排往左错了一位，峰值跑到周三上，和截图自相矛盾。
   */
  const bars = [0, 3, 1, 8, 2, 0, 0];
  const labels = ['一', '二', '三', '四', '五', '六', '日'];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sky drift={0.4} />
      <Dust t={t} count={40} opacity={0.6} />

      <div
        style={{
          position: 'absolute',
          left: W * 0.28,
          top: H * 0.5,
          transform: `translate(-50%, -50%) scale(${0.96 + phoneIn * 0.04})`,
          opacity: phoneIn,
        }}
      >
        <Phone shot="02_stats.png" glow={phoneIn} push={clamp01(t / 5.6)}>
          {/* 「频率轨迹」整张卡 */}
          <ScreenHighlight x={56} y={1300} w={1208} h={640} progress={hiP} />
        </Phone>
      </div>

      <Caption
        t={t}
        from={0.9}
        title="看见自己的节奏"
        sub="周 / 月 / 年三个维度 — 频率轨迹、时长分布、时段偏好"
        x={W * 0.46}
        y={H * 0.24}
        width={820}
      />

      {/*
        右侧把「频率轨迹」放大重绘一遍，让横屏右半区不空。
        柱子是从基线往**上**长的（bottom: 0 相对这个零高度容器），
        所以容器的 top 就是基线 —— basline 定低一点，别让最高的柱子顶穿标题。
      */}
      <div style={{ position: 'absolute', left: W * 0.46, top: H * 0.70 }}>
        {bars.map((v, i) => {
          const grow = easeOutCubic(tw(t, 1.6 + i * 0.09, 2.5 + i * 0.09));
          const h = v === 0 ? 14 : 16 + v * 26;
          const peak = v === 8;
          return (
            <div key={i} style={{ position: 'absolute', left: i * 78, top: 0 }}>
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: 34,
                  height: h * grow,
                  borderRadius: 17,
                  background:
                    v === 0
                      ? 'rgba(239,234,255,0.10)'
                      : `linear-gradient(180deg, ${T.colors.peach}, ${T.colors.rose})`,
                  boxShadow: peak ? `0 0 ${26 * grow}px ${T.colors.rose}` : 'none',
                }}
              />
              {v > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: h * grow + 10,
                    width: 34,
                    textAlign: 'center',
                    fontFamily: T.fonts.mono,
                    fontSize: 22,
                    color: peak ? T.colors.rose : T.colors.textMuted,
                    opacity: grow,
                  }}
                >
                  {v}
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  width: 34,
                  textAlign: 'center',
                  fontFamily: T.fonts.display,
                  fontSize: 20,
                  color: T.colors.textFaint,
                  opacity: grow,
                }}
              >
                {labels[i]}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: 'absolute',
          left: W * 0.46,
          top: H * 0.84,
          fontFamily: T.fonts.serif,
          fontSize: 32,
          fontStyle: 'italic',
          color: T.colors.textSecondary,
          letterSpacing: '2px',
          opacity: clamp01(tw(t, 3.0, 3.8)),
        }}
      >
        最集中的时间落在周四，共 8 次。
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 05 本地优先（21.8 → 26.4s）                                         */
/* ------------------------------------------------------------------ */

/** 锁：两段路径描边，合拢时锁梁落下 */
const LockMark: React.FC<{ p: number; size?: number }> = ({ p, size = 108 }) => {
  const shackle = easeOutCubic(clamp01(p * 1.6));
  const body = easeOutCubic(clamp01((p - 0.25) / 0.75));
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible' }}>
      <path
        d="M16 20 V15 a8 8 0 0 1 16 0 V20"
        fill="none"
        stroke={T.colors.peach}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeDasharray={40}
        strokeDashoffset={40 * (1 - shackle)}
        transform={`translate(0 ${(1 - shackle) * -5})`}
      />
      <rect
        x={11}
        y={20}
        width={26}
        height={19}
        rx={5}
        fill="none"
        stroke={T.colors.rose}
        strokeWidth={2.6}
        strokeDasharray={92}
        strokeDashoffset={92 * (1 - body)}
      />
      <circle cx={24} cy={29.5} r={2.6} fill={T.colors.rose} opacity={body} />
    </svg>
  );
};

export const PrivacyScene: React.FC<SceneProps> = ({ t }) => {
  // 0.8s：锁上（K.lockSnap）
  const lockP = easeOutCubic(tw(t, 0.5, 1.6));
  const phoneIn = easeOutCubic(tw(t, 0.3, 1.5));
  const hiP = easeOutCubic(tw(t, 1.8, 2.5));

  const lines = [
    '不需要注册账号',
    '没有服务器接收你的资料',
    '没有广告',
  ];

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sky drift={0.15} />
      <Dust t={t} count={34} opacity={0.5} />

      <div
        style={{
          position: 'absolute',
          left: W * 0.70,
          top: H * 0.5,
          transform: `translate(-50%, -50%) scale(${0.96 + phoneIn * 0.04})`,
          opacity: phoneIn,
        }}
      >
        <Phone shot="10_settings.png" glow={phoneIn} push={clamp01(t / 4.6)}>
          {/* iCloud 与伴侣共享 · 默认关闭，数据仅保存在本机 */}
          <ScreenHighlight x={56} y={2040} w={1208} h={196} progress={hiP} />
        </Phone>
      </div>

      <div style={{ position: 'absolute', left: W * 0.08, top: H * 0.26 }}>
        <LockMark p={lockP} />
      </div>

      <Caption
        t={t}
        from={1.0}
        title="数据只留在你的设备上"
        x={W * 0.08}
        y={H * 0.40}
        size={56}
        width={760}
      />

      {lines.map((s, i) => (
        <Tag key={s} t={t} from={1.8 + i * 0.3} text={s} x={W * 0.08} y={H * 0.56 + i * 62} />
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 06 落版（26.0 → 30.0s）                                             */
/* ------------------------------------------------------------------ */

export const FinaleScene: React.FC<SceneProps> = ({ t }) => {
  // 0.6s：落版（K.logoReveal）
  const logoP = spring(tw(t, 0.4, 1.8), { stiffness: 80, damping: 18 });
  const lineP = easeOutCubic(tw(t, 1.2, 2.2));
  const subP = easeOutCubic(tw(t, 1.6, 2.6));
  const beadsP = clamp01(tw(t, 0, 1.2));

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <Sky drift={0.9} />
      <Dust t={t} count={80} />

      {/* 珠子向中心汇拢 —— 一部片里散落的记录，最后收成一个「我们」 */}
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.4;
        const gather = easeOutCubic(clamp01(tw(t, 0.2 + i * 0.07, 2.0)));
        /**
         * 终点半径要留在 Logo 之外 —— 收到 150 的话珠子正好压在「Us」上。
         * 它们是来烘托落版的，不是来挡字的。
         */
        const rad = (1 - gather) * 300 + 360;
        return (
          <Bead
            key={i}
            x={W * 0.5 + Math.cos(a) * rad * 1.5}
            y={H * 0.5 + Math.sin(a) * rad * 0.7}
            r={13}
            color={pigmentAt(i * 4 + 19)}
            opacity={beadsP * (0.42 + 0.38 * (1 - gather))}
            glow={1}
          />
        );
      })}

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: H * 0.40,
          width: W,
          textAlign: 'center',
          opacity: logoP,
          transform: `scale(${0.92 + logoP * 0.08})`,
        }}
      >
        <div
          style={{
            fontFamily: T.fonts.serif,
            fontSize: 150,
            fontWeight: 400,
            color: T.colors.textPrimary,
            letterSpacing: '10px',
            lineHeight: 1,
          }}
        >
          Us
        </div>
      </div>

      {/* 渐变细线 */}
      <div
        style={{
          position: 'absolute',
          left: W * 0.5 - 190 * lineP,
          top: H * 0.40 + 190,
          width: 380 * lineP,
          height: 2,
          background: `linear-gradient(90deg, rgba(253,179,169,0), ${T.colors.peach}, ${T.colors.rose}, rgba(253,143,172,0))`,
          opacity: lineP,
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: H * 0.40 + 230,
          width: W,
          textAlign: 'center',
          fontFamily: T.fonts.display,
          fontSize: 36,
          fontWeight: 300,
          color: T.colors.textSecondary,
          letterSpacing: '8px',
          opacity: subP,
          transform: `translateY(${(1 - subP) * 16}px)`,
        }}
      >
        把关系里的微光，静静留住
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          top: H * 0.40 + 310,
          width: W,
          textAlign: 'center',
          fontFamily: T.fonts.display,
          fontSize: 24,
          fontWeight: 300,
          color: T.colors.textFaint,
          letterSpacing: '6px',
          opacity: clamp01(tw(t, 1.9, 2.7)),
        }}
      >
        App Store 搜索 Us · 伴侣亲密记录
      </div>
    </div>
  );
};
