import React from 'react';
import { VW_PROMO_THEME as T } from '../theme';
import { clamp01, easeOutCubic, easeOutExpo, tw, spring, countUp } from '../../../shared/anim';

const W = 1920;
const H = 1080;

interface SceneProps {
  t: number;
  dur: number;
}

/* ------------------------------------------------------------------ */
/* 电影感排版顶栏（随剧情有机演进）                                       */
/* ------------------------------------------------------------------ */
const StoryHeader: React.FC<{
  step: string;
  timeTag: string;
  title: string;
  sub: string;
  highlightWords?: string;
  t: number;
  from?: number;
  dark?: boolean;
}> = ({ step, timeTag, title, sub, highlightWords, t, from = 0, dark = false }) => {
  const p = easeOutCubic(tw(t, from, from + 0.5));
  const textCol = dark ? '#FFFFFF' : T.colors.text;

  return (
    <div
      style={{
        position: 'absolute',
        left: 100,
        top: 54,
        opacity: p,
        transform: `translateY(${(1 - p) * 16}px)`,
        zIndex: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <span
          style={{
            fontFamily: T.fonts.mono,
            fontSize: 14,
            fontWeight: 700,
            color: dark ? T.colors.gold : T.colors.hit,
            letterSpacing: '0.08em',
          }}
        >
          {step}
        </span>
        <span
          style={{
            fontFamily: T.fonts.mono,
            fontSize: 12,
            backgroundColor: dark ? 'rgba(231,200,119,0.18)' : T.colors.surfaceSubtle,
            color: dark ? T.colors.goldGlow : T.colors.textMid,
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${dark ? T.colors.goldDim : T.colors.line}`,
          }}
        >
          {timeTag}
        </span>
      </div>
      <div
        style={{
          fontFamily: T.fonts.sans,
          fontSize: 38,
          fontWeight: 800,
          color: textCol,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
          position: 'relative',
          display: 'inline-block',
        }}
      >
        {title}
        {highlightWords && (
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              left: 0,
              right: 0,
              height: 12,
              backgroundColor: T.colors.highlight,
              opacity: 0.35,
              zIndex: -1,
            }}
          />
        )}
      </div>
      <div
        style={{
          fontFamily: T.fonts.sans,
          fontSize: 17,
          color: dark ? 'rgba(255,255,255,0.7)' : T.colors.textMid,
          marginTop: 6,
          fontWeight: 400,
        }}
      >
        {sub}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 第一幕：危机 · 破晓前的雪崩 (0.0s – 8.0s)                             */
/* ------------------------------------------------------------------ */
export const ScenePain: React.FC<SceneProps> = ({ t }) => {
  const pIn = easeOutCubic(tw(t, 0.2, 0.8));
  const msgIn = easeOutExpo(tw(t, 1.8, 2.2));
  // 错位抖动与脉冲
  const driftShake = t > 2.0 ? Math.sin(t * 14) * 2 : 0;
  const pulseOpacity = 0.6 + 0.4 * Math.sin(t * 6);

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0D0F12', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 75% 30%, rgba(30,41,59,0.5) 0%, rgba(13,15,18,0.95) 70%)',
        }}
      />

      <StoryHeader
        step="ACT 01 / 危机降临"
        timeTag="02:14 AM"
        title="02:14 AM 紧急改版：传统剪辑轨道错位雪崩。"
        sub="文案改一处，整条时间线 200 个关键帧错脱节，预计渲染耗时 4 小时。"
        t={t}
        from={0.2}
        dark
      />

      {/* 剪辑工作台主屏 */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 190,
          width: 1720,
          height: 800,
          backgroundColor: '#161A20',
          borderRadius: 16,
          border: '1px solid #2B313A',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
          opacity: pIn,
          transform: `translateY(${(1 - pIn) * 20}px)`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 顶部菜单 */}
        <div
          style={{
            height: 48,
            backgroundColor: '#111418',
            borderBottom: '1px solid #2B313A',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#EF4444' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#F59E0B' }} />
            <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#10B981' }} />
            <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#94A3B8', marginLeft: 16 }}>
              Traditional_Editor_Pro.app — [Project_Corporate_2026_Final_v14.prproj]
            </span>
          </div>
          <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#EF4444', fontWeight: 700, opacity: pulseOpacity }}>
            ● RENDER ERROR: KEYFRAME SYNC BROKEN
          </span>
        </div>

        {/* 轨道编辑区 */}
        <div style={{ flex: 1, padding: 32, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#94A3B8' }}>SEQUENCE TIMELINE (24.00 FPS)</span>
              <span style={{ fontFamily: T.fonts.mono, fontSize: 14, color: '#EF4444', fontWeight: 700 }}>
                ⚠️ AUDIO DRIFT: +124ms (200 KEYFRAMES BROKEN)
              </span>
            </div>

            {/* 视频主轨 */}
            <div style={{ height: 68, backgroundColor: '#1E242C', borderRadius: 8, marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 40, width: 920, top: 8, bottom: 8, backgroundColor: '#334155', borderRadius: 6, display: 'flex', alignItems: 'center', paddingLeft: 20, color: '#E2E8F0', fontFamily: T.fonts.mono, fontSize: 14 }}>
                [Video_Scene_03] 画面被迫拉长 3 秒 → 后面 4 个镜头全部错开
              </div>
            </div>

            {/* 音频轨（雪崩错开 + 抖动） */}
            <div style={{ height: 68, backgroundColor: '#1E242C', borderRadius: 8, position: 'relative', overflow: 'hidden' }}>
              <div
                style={{
                  position: 'absolute',
                  left: 160 + driftShake, // 错开且微抖
                  width: 880,
                  top: 8,
                  bottom: 8,
                  backgroundColor: '#7F1D1D',
                  border: '1px solid #DC2626',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  paddingLeft: 20,
                  color: '#FCA5A5',
                  fontFamily: T.fonts.mono,
                  fontSize: 14,
                }}
              >
                [Audio_Voice_Master] 音频波形漂移 (+124ms 偏移未修复) ✖ 驳回
              </div>
            </div>

            {/* 错位拉扯虚线 */}
            <div
              style={{
                marginTop: 24,
                padding: '16px 24px',
                backgroundColor: 'rgba(239,68,68,0.1)',
                border: '1px dashed #EF4444',
                borderRadius: 8,
                color: '#F87171',
                fontFamily: T.fonts.sans,
                fontSize: 15,
                lineHeight: 1.6,
              }}
            >
              传统视频制作死穴：剪辑轨与关键帧绑定于固定帧率。增删一行台词，引发全轨音画错位雪崩，重排需 3 天，渲染预估需 4 小时……
            </div>
          </div>

          {/* 底部引导栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #2B313A', paddingTop: 20 }}>
            <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#64748B' }}>
              TIME TO MEETING: 6 HOURS 16 MINS
            </span>
            <div
              style={{
                backgroundColor: T.colors.gold,
                color: '#000',
                padding: '10px 24px',
                borderRadius: 6,
                fontFamily: T.fonts.sans,
                fontSize: 15,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              ➔ 打开代码工作台：以数学方程重塑时间
            </div>
          </div>
        </div>

        {/* 1.8s 弹出的催改即时通讯消息 */}
        <div
          style={{
            position: 'absolute',
            right: 40,
            top: 70,
            width: 480,
            backgroundColor: '#1E293B',
            borderRadius: 12,
            border: '2px solid #38BDF8',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7)',
            padding: 20,
            opacity: msgIn,
            transform: `translateY(${(1 - msgIn) * -30}px) scale(${0.95 + msgIn * 0.05})`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#38BDF8' }} />
            <span style={{ fontFamily: T.fonts.sans, fontSize: 13, fontWeight: 700, color: '#38BDF8' }}>
              飞书协同 · 总裁办
            </span>
            <span style={{ fontFamily: T.fonts.mono, fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>
              02:14:02 AM
            </span>
          </div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 15, color: '#F8FAFC', lineHeight: 1.5 }}>
            “李工，早晨 8:30 高管汇报，第 3 幕战略数据改了，视频抓紧重出，千万别延误！”
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 第二幕：破局 · 改一行代码，波形齿轮咬合 (8.0s – 18.0s)                  */
/* ------------------------------------------------------------------ */
export const SceneWorkbench: React.FC<SceneProps> = ({ t }) => {
  const pIn = easeOutCubic(tw(t, 0.0, 0.7));
  const lockProgress = easeOutExpo(tw(t, 5.8, 6.2)); // 13.8s 磁吸咬合

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#0B0D10', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 50%, rgba(20,24,33,0.8) 0%, rgba(11,13,16,1) 80%)',
        }}
      />

      <StoryHeader
        step="ACT 02 / 代码破局"
        timeTag="02:18 AM"
        title="改一行代码，波形与镜头自动齿轮咬合。"
        sub="时间不再是手动拉扯的胶片，而是绝对确定的声明式单源方程。"
        t={t}
        from={0.0}
        dark
      />

      {/* 工作台双栏 */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 190,
          width: 1720,
          height: 800,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 28,
          opacity: pIn,
          transform: `translateY(${(1 - pIn) * 16}px)`,
        }}
      >
        {/* 左栏：代码改动与规范终端 */}
        <div
          style={{
            backgroundColor: '#13171F',
            borderRadius: 16,
            border: '1px solid #232A36',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ height: 44, backgroundColor: '#0F1218', borderBottom: '1px solid #232A36', display: 'flex', alignItems: 'center', padding: '0 20px' }}>
            <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#38BDF8', fontWeight: 600 }}>
              src/films/vw-promo/timeline.ts (Single Source of Truth)
            </span>
          </div>

          <div style={{ flex: 1, padding: 28, fontFamily: T.fonts.mono, fontSize: 14, color: '#E2E8F0', lineHeight: 1.7 }}>
            <span style={{ color: '#64748B' }}>// 声明式修改：时间自动顺延，无需手动对位</span><br />
            <span style={{ color: '#F43F5E' }}>export const</span> FILM_PLAN = <span style={{ color: '#38BDF8' }}>buildPlan</span>([<br />
            &nbsp;&nbsp;&#123; id: <span style={{ color: '#10B981' }}>'pain'</span>, dur: <span style={{ color: '#F59E0B' }}>8.0</span> &#125;,<br />
            &nbsp;&nbsp;&#123; id: <span style={{ color: '#10B981' }}>'workbench'</span>, dur: <span style={{ color: '#F59E0B' }}>10.0</span> &#125;,<br />
            &nbsp;&nbsp;&#123; id: <span style={{ color: '#10B981' }}>'engine'</span>, dur: <span style={{ color: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.25)', padding: '2px 8px', borderRadius: 4 }}>8.0</span> &#125;, <span style={{ color: '#10B981' }}>// ← 仅改动此处</span><br />
            &nbsp;&nbsp;&#123; id: <span style={{ color: '#10B981' }}>'delivery'</span>, dur: <span style={{ color: '#F59E0B' }}>10.0</span> &#125;,<br />
            ]);
          </div>

          <div style={{ backgroundColor: '#090B0E', borderTop: '1px solid #232A36', padding: 20, fontFamily: T.fonts.mono, fontSize: 13 }}>
            <div style={{ color: '#38BDF8', marginBottom: 4 }}>$ vw render --mode=final</div>
            <div style={{ color: '#10B981' }}>✓ ElasticSolver: 结构化对拍自动收敛求解</div>
            <div style={{ color: '#E2E8F0' }}>✓ 2160 frames compiled · 0 audio drift</div>
          </div>
        </div>

        {/* 右栏：波形磁吸齿轮吸附 */}
        <div
          style={{
            backgroundColor: '#13171F',
            borderRadius: 16,
            border: '1px solid #232A36',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: T.fonts.mono, fontSize: 14, color: '#94A3B8' }}>
                AUDIO-VISUAL ELASTIC LOCK
              </span>
              <span
                style={{
                  fontFamily: T.fonts.mono,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '4px 14px',
                  borderRadius: 20,
                  backgroundColor: lockProgress > 0.8 ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                  color: lockProgress > 0.8 ? '#10B981' : '#F59E0B',
                  border: `1px solid ${lockProgress > 0.8 ? '#10B981' : '#F59E0B'}`,
                }}
              >
                {lockProgress > 0.8 ? '● 0.000 ms 零漂移锁定' : '○ 磁吸收敛中...'}
              </span>
            </div>

            {/* 波形与时间游标 */}
            <div style={{ marginTop: 48, height: 160, display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
              {Array.from({ length: 44 }).map((_, i) => {
                const h = 24 + Math.sin(i * 0.4 + t * 2) * 45 + Math.cos(i * 0.7) * 35;
                const isCenter = Math.abs(i - 22) < 2;
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: Math.max(14, Math.min(145, h)),
                      backgroundColor: isCenter ? (lockProgress > 0.8 ? '#10B981' : T.colors.gold) : '#334155',
                      borderRadius: 3,
                    }}
                  />
                );
              })}

              {/* 金色锁定时间游标 */}
              <div
                style={{
                  position: 'absolute',
                  left: `${24 + lockProgress * 26}%`,
                  top: -24,
                  bottom: -24,
                  width: 3,
                  backgroundColor: lockProgress > 0.8 ? '#10B981' : T.colors.gold,
                  boxShadow: `0 0 16px ${lockProgress > 0.8 ? '#10B981' : T.colors.goldGlow}`,
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: -40,
                    backgroundColor: lockProgress > 0.8 ? '#10B981' : T.colors.gold,
                    color: '#000',
                    fontFamily: T.fonts.mono,
                    fontSize: 11,
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                >
                  {lockProgress > 0.8 ? 'OFFSET 0.0ms' : '+124ms → 0.0ms'}
                </div>
              </div>
            </div>
          </div>

          {/* 指标卡片 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div style={{ backgroundColor: '#0F1218', padding: 20, borderRadius: 10, border: '1px solid #1E2430' }}>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: '#64748B' }}>CLOCK SKEW</div>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 22, fontWeight: 700, color: '#10B981', marginTop: 4 }}>
                0.000 ms
              </div>
            </div>
            <div style={{ backgroundColor: '#0F1218', padding: 20, borderRadius: 10, border: '1px solid #1E2430' }}>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: '#64748B' }}>CROSSFADE</div>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 22, fontWeight: 700, color: '#E2E8F0', marginTop: 4 }}>
                等功率连续
              </div>
            </div>
            <div style={{ backgroundColor: '#0F1218', padding: 20, borderRadius: 10, border: '1px solid #1E2430' }}>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: '#64748B' }}>CONFIDENCE</div>
              <div style={{ fontFamily: T.fonts.mono, fontSize: 22, fontWeight: 700, color: '#38BDF8', marginTop: 4 }}>
                100% 确定性
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 第三幕：内核 · 绝对确定的空间光轨 (18.0s – 26.0s)                     */
/* ------------------------------------------------------------------ */
export const SceneEngine: React.FC<SceneProps> = ({ t }) => {
  const pIn = easeOutCubic(tw(t, 0.0, 0.8));
  const tunnelZ = t * 18; // 光轨高速穿透
  const lightPulse = 0.5 + 0.5 * Math.sin(t * 4);

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: '#08090C', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(231,200,119,0.25) 0%, rgba(8,9,12,1) 75%)',
        }}
      />

      <StoryHeader
        step="ACT 03 / 空间穿透"
        timeTag="02:20 AM"
        title="穿透屏幕：逐帧光轨与三大引擎基石。"
        sub="Remotion 逐帧内核 · Three.js 空间相机 · ElasticSolver 结构化对拍。"
        t={t}
        from={0.0}
        dark
      />

      {/* 3D 穿透空间 */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 190,
          width: 1720,
          height: 800,
          perspective: 1000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pIn,
        }}
      >
        {/* 中央发光时间轴主光轨 */}
        <div
          style={{
            position: 'absolute',
            width: 16,
            height: 980,
            background: 'linear-gradient(to top, rgba(231,200,119,0), #E7C877 35%, #FFF 50%, #E7C877 65%, rgba(231,200,119,0))',
            boxShadow: `0 0 60px ${T.colors.goldGlow}`,
            transform: `rotateX(75deg) translateY(${tunnelZ}px)`,
          }}
        />

        {/* 动态光斑 */}
        <div
          style={{
            position: 'absolute',
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(231,200,119,${0.3 * lightPulse}) 0%, rgba(0,0,0,0) 70%)`,
            transform: 'rotateX(75deg)',
          }}
        />

        {/* 穿透光环 */}
        {Array.from({ length: 5 }).map((_, i) => {
          const zPos = ((i * 180 + t * 45) % 900) - 200;
          const scale = Math.max(0.2, 1 + zPos / 600);
          const op = Math.max(0, Math.min(1, 1 - zPos / 800));
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 640 * scale,
                height: 380 * scale,
                borderRadius: '50%',
                border: '2px solid rgba(231,200,119,0.4)',
                boxShadow: '0 0 35px rgba(231,200,119,0.25)',
                opacity: op,
                transform: 'rotateX(65deg)',
                pointerEvents: 'none',
              }}
            />
          );
        })}

        {/* 护航三大引擎实体卡片 */}
        <div
          style={{
            position: 'absolute',
            left: 140,
            top: 260,
            width: 380,
            backgroundColor: '#12161F',
            borderRadius: 14,
            border: '1px solid rgba(231,200,119,0.3)',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontFamily: T.fonts.mono, fontSize: 13, color: T.colors.gold }}>ENGINE 01</div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 22, fontWeight: 700, color: '#FFF', marginTop: 4 }}>
            Remotion 逐帧内核
          </div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 14, color: '#94A3B8', marginTop: 8 }}>
            0 跳帧 · 逐像素纯函数确定性栅格化
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 140,
            top: 220,
            width: 380,
            backgroundColor: '#12161F',
            borderRadius: 14,
            border: '1px solid rgba(231,200,119,0.3)',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontFamily: T.fonts.mono, fontSize: 13, color: T.colors.gold }}>ENGINE 02</div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 22, fontWeight: 700, color: '#FFF', marginTop: 4 }}>
            Three.js 镜头桥
          </div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 14, color: '#94A3B8', marginTop: 8 }}>
            2D 纸面 ↔ 3D 空间无缝相机贯通
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            right: 220,
            bottom: 110,
            width: 380,
            backgroundColor: '#12161F',
            borderRadius: 14,
            border: '1px solid rgba(231,200,119,0.3)',
            padding: 24,
            boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div style={{ fontFamily: T.fonts.mono, fontSize: 13, color: T.colors.gold }}>ENGINE 03</div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 22, fontWeight: 700, color: '#FFF', marginTop: 4 }}>
            ElasticSolver 对拍
          </div>
          <div style={{ fontFamily: T.fonts.sans, fontSize: 14, color: '#94A3B8', marginTop: 8 }}>
            弹性松弛位移，音画毫秒锁定
          </div>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* 第四幕：交付 · 晨光中的从容交付 (26.0s – 36.0s)                         */
/* ------------------------------------------------------------------ */
export const SceneDelivery: React.FC<SceneProps> = ({ t }) => {
  const pIn = easeOutCubic(tw(t, 0.0, 0.7));
  const stampFinal = easeOutExpo(tw(t, 6.4, 6.8));
  const pushScale = 1 + (t / 10.0) * 0.02;

  return (
    <div style={{ position: 'absolute', inset: 0, backgroundColor: T.colors.paper, transform: `scale(${pushScale})`, transformOrigin: 'center center' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 90% at 50% 20%, rgba(255,255,255,0.95) 0%, rgba(244,239,233,0.6) 100%)',
        }}
      />

      <StoryHeader
        step="ACT 04 / 破晓交付"
        timeTag="08:00 AM"
        title="代码即导演，时间绝对确定。"
        sub="改版不再通宵。12 秒自动化重新出片，08:00 AM 汇报准时交付。"
        highlightWords="时间绝对确定"
        t={t}
        from={0.0}
      />

      {/* 交付成果主体（真成片动态播放器 + 确定性交付指标） */}
      <div
        style={{
          position: 'absolute',
          left: 100,
          top: 190,
          width: 1720,
          height: 800,
          display: 'grid',
          gridTemplateColumns: '1.2fr 0.8fr',
          gap: 32,
          opacity: pIn,
        }}
      >
        {/* 左侧：成片播放器（充满活力的高清成片动态展现） */}
        <div
          style={{
            backgroundColor: '#000',
            borderRadius: 16,
            border: `1px solid ${T.colors.lineStrong}`,
            boxShadow: '0 24px 60px rgba(0,0,0,0.12)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ height: 44, backgroundColor: '#18181B', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
            <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#A1A1AA' }}>
              ▶ FINAL_DELIVERY_60FPS.mp4 [PLAYING]
            </span>
            <span style={{ fontFamily: T.fonts.mono, fontSize: 13, color: '#10B981', fontWeight: 700 }}>
              ● 60.0 FPS · 0 DROPPED
            </span>
          </div>

          {/* 充满动态画面切片的屏幕内容 */}
          <div
            style={{
              flex: 1,
              backgroundColor: '#0A0C10',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* 动态光束 */}
            <div
              style={{
                position: 'absolute',
                width: 500,
                height: 500,
                background: 'radial-gradient(circle, rgba(231,200,119,0.2) 0%, rgba(0,0,0,0) 70%)',
                transform: `rotate(${t * 30}deg)`,
              }}
            />

            {/* 成片主体徽章与动态波动图 */}
            <div style={{ zIndex: 10, textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: T.fonts.sans,
                  fontSize: 36,
                  fontWeight: 900,
                  color: '#FFFFFF',
                  letterSpacing: '0.06em',
                }}
              >
                VIDEO WORKBENCH
              </div>
              <div
                style={{
                  fontFamily: T.fonts.sans,
                  fontSize: 18,
                  fontWeight: 600,
                  color: T.colors.gold,
                  marginTop: 8,
                  letterSpacing: '0.02em',
                }}
              >
                程序化工业级视频工作台
              </div>

              {/* 动态播放中的高光频段波动 */}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 32 }}>
                {Array.from({ length: 24 }).map((_, i) => {
                  const barH = 12 + Math.abs(Math.sin(i * 0.5 + t * 4)) * 36;
                  return (
                    <div
                      key={i}
                      style={{
                        width: 4,
                        height: barH,
                        backgroundColor: i % 2 === 0 ? T.colors.gold : '#38BDF8',
                        borderRadius: 2,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            {/* 播放器底进度条 */}
            <div style={{ position: 'absolute', bottom: 20, left: 24, right: 24, height: 4, backgroundColor: '#27272A', borderRadius: 2 }}>
              <div style={{ width: `${Math.min(100, (t / 10) * 100)}%`, height: '100%', backgroundColor: T.colors.gold, borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* 右侧：准时交付结果清单 */}
        <div
          style={{
            backgroundColor: T.colors.surface,
            borderRadius: 16,
            border: `1px solid ${T.colors.line}`,
            boxShadow: '0 12px 36px rgba(0,0,0,0.04)',
            padding: 36,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontFamily: T.fonts.mono, fontSize: 13, color: T.colors.textMid }}>DELIVERY VERIFICATION</div>
            <div style={{ fontFamily: T.fonts.sans, fontSize: 26, fontWeight: 800, color: T.colors.text, marginTop: 6 }}>
              改版成功 · 提前半小时交付
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28 }}>
              <div style={{ padding: 18, backgroundColor: T.colors.surfaceSubtle, borderRadius: 10, border: `1px solid ${T.colors.line}` }}>
                <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textMid }}>改版耗时</div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 32, fontWeight: 800, color: T.colors.hit, marginTop: 6 }}>
                  12 秒
                </div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 12, color: T.colors.textMid, marginTop: 4 }}>告别 3 天重剪</div>
              </div>

              <div style={{ padding: 18, backgroundColor: T.colors.surfaceSubtle, borderRadius: 10, border: `1px solid ${T.colors.line}` }}>
                <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textMid }}>丢帧容忍</div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 32, fontWeight: 800, color: T.colors.ok, marginTop: 6 }}>
                  0
                </div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 12, color: T.colors.textMid, marginTop: 4 }}>确定性逐帧渲染</div>
              </div>

              <div style={{ padding: 18, backgroundColor: T.colors.surfaceSubtle, borderRadius: 10, border: `1px solid ${T.colors.line}` }}>
                <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textMid }}>音画误差</div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 32, fontWeight: 800, color: T.colors.text, marginTop: 6 }}>
                  0.0ms
                </div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 12, color: T.colors.textMid, marginTop: 4 }}>毫秒级零偏移锁定</div>
              </div>

              <div style={{ padding: 18, backgroundColor: T.colors.surfaceSubtle, borderRadius: 10, border: `1px solid ${T.colors.line}` }}>
                <div style={{ fontFamily: T.fonts.mono, fontSize: 12, color: T.colors.textMid }}>真值驱动</div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 32, fontWeight: 800, color: T.colors.text, marginTop: 6 }}>
                  100%
                </div>
                <div style={{ fontFamily: T.fonts.sans, fontSize: 12, color: T.colors.textMid, marginTop: 4 }}>9 张 JSON 驱动混音</div>
              </div>
            </div>
          </div>

          {/* 最终交付定格印章 (32.4s 砸落) */}
          <div
            style={{
              padding: '16px 24px',
              backgroundColor: T.colors.okSoft,
              borderRadius: 10,
              border: `2px solid ${T.colors.ok}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: stampFinal,
              transform: `scale(${1 + (1 - stampFinal) * 0.3})`,
            }}
          >
            <div>
              <div style={{ fontFamily: T.fonts.sans, fontSize: 16, fontWeight: 800, color: T.colors.ok }}>
                准时交付 · 汇报从容定稿
              </div>
              <div style={{ fontFamily: T.fonts.sans, fontSize: 13, color: T.colors.textMid, marginTop: 2 }}>
                改版不再通宵。把时间，还给创作。
              </div>
            </div>
            <div
              style={{
                fontFamily: T.fonts.mono,
                fontSize: 12,
                fontWeight: 800,
                color: T.colors.ok,
                border: `1px solid ${T.colors.ok}`,
                padding: '4px 12px',
                borderRadius: 4,
              }}
            >
              DELIVERED · 08:00 AM
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
