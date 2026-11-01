/**
 * 报销台（虚构产品演示）· 五段画面
 *
 * 沿用 product-story 风格。02 FlowScene 先做到成品质量（试水），其余四段先占位。
 * 手法学样片 product-story-test（draw / drawLanding / FocusText / Chip / Step），
 * 故事 / 数据 / 镜头是本片自己的（报销审批，不是售后工单）。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { draw, drawLanding, stroke } from '../../../shared/motion';
import { clamp01, lerp, easeInOutCubic, countUp } from '../../../shared/anim';
import { FocusText } from '../../../components/shot';
import { INVOICE_AUDIT_THEME as T } from '../theme';
import { K, BEATS, STEPS, QUESTION, KEY_PHRASE } from '../layout';

const C = T.colors;
const F = T.fonts;
const shadow = '0 12px 36px rgba(27, 26, 24, 0.06)';

const Chip: React.FC<{ tone: 'ok' | 'hit' | 'idle'; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{ font: `500 13px ${F.text}`, color: tone === 'ok' ? C.ok : tone === 'hit' ? C.hit : C.textMid, background: tone === 'ok' ? C.okSoft : tone === 'hit' ? C.hitSoft : C.line, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{children}</span>
);

/** 报销审批的四步卡：第 2 步命中超标（命中橙），第 4 步等人确认（运行态 + 进度走到 91%） */
const Step: React.FC<{ n: number; t: number; land: number }> = ({ n, t, land }) => {
  const s = STEPS[n - 1];
  const p = drawLanding(t, land, 0.3);
  if (p <= 0) return null;
  const progress = s.state === 'run' ? Math.round(91 * easeInOutCubic(clamp01((t - land) / 1.6))) : undefined;
  const hit = s.state === 'hit';
  const done = s.state === 'done';
  return (
    <div style={{ opacity: p, transform: `translateY(${((1 - p) * 12).toFixed(2)}px)`, display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 10, border: `1px solid ${hit ? C.hit : C.line}`, background: hit ? C.hitSoft : C.surface }}>
      <div style={{ width: 24, height: 24, borderRadius: 12, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `600 13px ${F.mono}`, color: done || hit ? C.surface : C.textMid, background: done ? C.ok : hit ? C.hit : C.line }}>{done ? '✓' : n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ font: `600 17px ${F.text}`, color: C.text }}>{s.title}</div>
          {hit && <Chip tone="hit">需要你看</Chip>}
          {done && <span style={{ font: `400 12px ${F.mono}`, color: C.textFaint }}>0.{n + 2}s</span>}
        </div>
        <div style={{ font: `400 14px/1.5 ${F.text}`, color: C.textMid, marginTop: 4 }}>{s.note}</div>
        {progress !== undefined && (
          <div style={{ marginTop: 10, height: 3, background: C.line, borderRadius: 2 }}>
            <div style={{ width: `${progress}%`, height: 3, background: C.text, borderRadius: 2 }} />
          </div>
        )}
      </div>
    </div>
  );
};

/** 02 一句话走完流程：左边编号 + 结论句 + 副句 + 三个数，右边是正在工作的报销台界面 */
export const FlowScene: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.toUi) return null;
  const card = draw(t, K.uiHead - 0.4, 0.8);
  const push = 1 + 0.06 * easeInOutCubic(clamp01((t - K.uiHead) / 8));
  const typed = Math.floor([...QUESTION].length * clamp01((t - K.type) / (K.typeEnd - K.type)));
  const sent = t >= K.send;
  const bubble = drawLanding(t, K.send, 0.25);
  const reply = clamp01((t - K.reply) / (K.replyEnd - K.reply));
  const replyText = '查到这单住宿费 ¥1,200，差旅标准 ¥1,000——';
  const replyHl = '超了 ¥200';
  const replyTail = '。下面是我走过的步骤：';
  const replyAll = replyText + replyHl + replyTail;
  const shown = Math.floor([...replyAll].length * reply);
  const a = Math.min(shown, [...replyText].length);
  const h = Math.max(0, Math.min(shown - [...replyText].length, [...replyHl].length));
  const b = Math.max(0, shown - [...replyText].length - [...replyHl].length);
  const recognized = t >= BEATS.steps[0];
  const caret = Math.floor(t * 2.4) % 2 === 0;
  const stat = (to: number, i: number) => Math.round(to * draw(t, K.stats + i * 0.15, 0.9));
  return (
    <AbsoluteFill style={{ fontFamily: F.text, transform: `scale(${push.toFixed(5)})`, transformOrigin: '62% 45%' }}>
      {/* 左：编号 + 结论句 + 副句 + 三个数 */}
      <div style={{ position: 'absolute', left: 140, top: 150, width: 640 }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.textMid, letterSpacing: 2, opacity: draw(t, K.uiHead - 0.8, 0.4) }}>— 02 · 一句话，走完整流程</div>
        <div style={{ font: `600 58px/1.25 ${F.display}`, color: C.text, marginTop: 22 }}>
          <div><FocusText text="一句话，" t={t} from={K.uiHead - 0.45} spanSec={0.3} /></div>
          <div><FocusText text="报销自己走完。" t={t} from={K.uiHead - 0.2} spanSec={0.45} /></div>
        </div>
        <div style={{ font: `400 21px/1.6 ${F.text}`, color: C.textMid, marginTop: 22, opacity: draw(t, K.uiHead + 0.4, 0.6) }}>员工只问一句。识别、比对、定位、生成审批——四步在一个窗口里走完，超出标准的那一处留给人看。</div>
        <div style={{ display: 'flex', gap: 36, marginTop: 64, opacity: draw(t, K.stats - 0.2, 0.4) }}>
          {([[4, '步，自动走完'], [1, '处，留给人看'], [0, '次，误判归零']] as const).map(([n, l], i) => (
            <div key={l}>
              <div style={{ font: `300 64px ${F.display}`, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{stat(n, i)}</div>
              <div style={{ font: `400 15px ${F.text}`, color: C.textMid, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 右：报销台界面卡片 */}
      <div style={{ position: 'absolute', left: 880, top: 170, width: 900, opacity: card, transform: `translateY(${((1 - card) * 16).toFixed(2)}px)`, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: shadow, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ font: `600 18px ${F.text}`, color: C.text }}>报销审批助手</div>
            <div style={{ font: `400 13px ${F.mono}`, color: C.textMid, marginTop: 6, height: 20 }}>BX-202610-4471 ·</div>
          </div>
          {recognized ? <Chip tone="ok">✓ 已识别</Chip> : <Chip tone="idle">待处理</Chip>}
        </div>
        <div style={{ padding: '22px 24px 18px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 560 }}>
          {sent && (
            <div style={{ alignSelf: 'flex-end', maxWidth: 520, background: C.text, color: C.surface, font: `400 16px/1.5 ${F.text}`, padding: '10px 16px', borderRadius: '14px 14px 4px 14px', opacity: bubble, transform: `translateY(${((1 - bubble) * 10).toFixed(2)}px)` }}>{QUESTION}</div>
          )}
          {reply > 0 && (
            <div style={{ font: `400 16px/1.6 ${F.text}`, color: C.text, maxWidth: 760 }}>
              {[...replyText].slice(0, a).join('')}
              {h > 0 && <span style={{ background: `linear-gradient(transparent 55%, ${C.highlight}88 55%)` }}>{[...replyHl].slice(0, h).join('')}</span>}
              {[...replyTail].slice(0, b).join('')}
            </div>
          )}
          {BEATS.steps.map((land, i) => (
            <Step key={i} n={i + 1} t={t} land={land} />
          ))}
        </div>
        <div style={{ margin: '0 24px 22px', border: `1px solid ${C.line}`, borderRadius: 12, padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ font: `400 15px ${F.text}`, color: typed > 0 && !sent ? C.text : C.textFaint }}>
            {typed > 0 && !sent ? [...QUESTION].slice(0, typed).join('') : '输入消息…'}
            {t >= K.type - 0.4 && !sent && caret && <span style={{ display: 'inline-block', width: 2, height: 17, background: C.text, marginLeft: 2, verticalAlign: -3 }} />}
          </span>
          <span style={{ width: 30, height: 30, borderRadius: 15, background: typed > 0 && !sent ? C.text : C.textFaint, display: 'inline-block' }} />
        </div>
      </div>
      <div style={{ position: 'absolute', right: 140, bottom: 54, font: `400 12px ${F.mono}`, color: C.textFaint, opacity: card }}>演示数据 · 虚构产品</div>
    </AbsoluteFill>
  );
};

/** 五段渲同一个世界（全片乐谱秒 t）：纸面微距 → 界面 → 暗场（盖在纸面之上）→ 两个出口 → 数字墙 */
export const World: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: C.paper }}>
    {t < K.toUi && <OpenScene t={t} />}
    {t < K.dim && <FlowScene t={t} />}
    {t >= K.out && t < K.numHead && <TwinScene t={t} />}
    <NumbersScene t={t} />
    <StageScene t={t} />
  </AbsoluteFill>
);

/** 01 一份报销：镜头贴着报销单 + 发票，浅景深（按离焦平面逐行模糊），慢横移；荧光笔划过超标那行，标题落在左下。之后纸面化开、淡出，那行由 02 段接走（纸到界面）。 */
const RECEIPT_LINES = [
  '差旅报销单　　　　　　　　　　　　　　编号 BX-202610-4471',
  '报销人：林＊＊　　　部门：市场部　　出差地：上海',
  '行程：10 月 22 日 — 10 月 24 日 · 住宿 2 晚',
  '住宿费　发票 FA-202610-2817　　¥ 1,200.00',
  '交通费　高铁 + 市内　　　　　　¥ 480.00',
  '差旅标准：出差地住宿上限 ¥ 1,000 / 晚',
  '经办人签字：　　　　　　　　　日期：',
];
const RECEIPT_FOCUS = 3;
const RECEIPT_TITLE = '出差回来报个销，住宿费超了 ¥200。';

const OpenScene: React.FC<{ t: number }> = ({ t }) => {
  const away = draw(t, K.toUi - 0.4, 1.0);
  const hl = stroke(t, K.highlight, 0.8);
  const titleOut = draw(t, K.toUi - 0.2, 0.5);
  return (
    <AbsoluteFill style={{ background: C.docPaper, overflow: 'hidden', opacity: 1 - away }}>
      <div style={{ position: 'absolute', inset: 0, perspective: 900, perspectiveOrigin: '30% 40%', filter: `blur(${(away * 14).toFixed(2)}px)` }}>
        <div style={{ position: 'absolute', left: -150 - t * 30, top: -30 - t * 6, width: 2300, transformOrigin: '40% 50%', transform: 'rotateX(48deg) rotateZ(-14deg) scale(1.55)' }}>
          {RECEIPT_LINES.map((l, i) => {
            const d = Math.abs(i - RECEIPT_FOCUS);
            const blur = d === 0 ? 0 : 1.6 + d * 2.2;
            return (
              <div key={i} style={{ font: `400 44px/2.2 ${F.quote}`, color: C.docInk, whiteSpace: 'pre', filter: `blur(${blur.toFixed(1)}px)`, opacity: 1 - d * 0.08 }}>
                {i === RECEIPT_FOCUS ? (
                  <>
                    {'住宿费　发票 FA-202610-2817　　¥ 1,200.'}
                    <span style={{ padding: '0 6px', backgroundImage: `linear-gradient(transparent 38%, ${C.highlight} 38%, ${C.highlight} 88%, transparent 88%)`, backgroundSize: `${(hl * 100).toFixed(2)}% 100%`, backgroundRepeat: 'no-repeat', opacity: t >= K.toUi - 0.4 ? 0.35 : 1 }}>00</span>
                  </>
                ) : (
                  l
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1400px 900px at 45% 40%, transparent 40%, ${C.docInk}40 100%)` }} />
      <div style={{ position: 'absolute', left: 140, bottom: 120, opacity: 1 - titleOut }}>
        <div style={{ font: `600 44px ${F.display}`, color: C.text }}>
          <FocusText text={RECEIPT_TITLE} t={t} from={K.hl + 1.0} spanSec={0.5} />
        </div>
        <div style={{ font: `400 19px ${F.text}`, color: C.textMid, marginTop: 14, opacity: draw(t, K.hl + 1.6, 0.5) }}>单子上都写着，标准也写着，但没人一对。</div>
      </div>
    </AbsoluteFill>
  );
};

/** 03 暗场一亮：纸面暗下去，金色等距线框画出报销规则引擎的能力块，光点点亮（climax2），两个标注落定；只有金色的光。
 *  DOM 版等距细线稿（后面要更真实再换 three + FilmPost）。 */
const StageScene: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.dim || t > K.out + 0.7) return null;
  const dim = draw(t, K.dim, 0.6);
  const plate = stroke(t, K.plate, 0.8);
  const blocks = draw(t, K.blocks, 0.6);
  const ignite = draw(t, K.ignite, 0.5);
  const out = draw(t, K.out, 0.5);
  // 8 个等距能力块（识别 / 比对 / 定位 / 审批），其中 2 个点亮
  const cubes = [
    { x: 380, y: 320, lit: false },
    { x: 560, y: 380, lit: true },
    { x: 740, y: 340, lit: false },
    { x: 920, y: 400, lit: false },
    { x: 460, y: 540, lit: true },
    { x: 640, y: 600, lit: false },
    { x: 820, y: 560, lit: false },
    { x: 1000, y: 620, lit: false },
  ];
  return (
    <AbsoluteFill style={{ background: C.stage, opacity: dim, fontFamily: F.text, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(1200px 800px at 50% 45%, ${C.stageLift} 0%, ${C.stage} 70%)` }} />
      {/* 金线底板（等距网格） */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, opacity: plate * 0.5 }} fill="none">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`h${i}`} x1={200 + i * 30} y1={250 + i * 70} x2={1100 + i * 30} y2={250 + i * 70} stroke={C.goldDim} strokeWidth={1} opacity={0.4} />
        ))}
      </svg>
      {/* 能力块（等距立方体细线稿） */}
      {cubes.map((c, i) => {
        const lit = c.lit && blocks > 0;
        const k = lit ? ignite : blocks;
        if (k <= 0) return null;
        const s = 70;
        // 等距投影：顶面 / 左面 / 右面
        const dx = s * 0.866, dy = s * 0.5;
        const col = lit ? C.gold : C.goldDim;
        return (
          <div key={i} style={{ position: 'absolute', left: c.x, top: c.y, opacity: k, filter: lit ? `drop-shadow(0 0 ${12 * ignite}px ${C.gold})` : 'none' }}>
            <svg width={s * 2} height={s * 1.7} fill="none">
              <polygon points={`${s},${0} ${s + dx},${dy} ${s},${s} ${s - dx},${dy}`} stroke={col} strokeWidth={1.5} />
              <polygon points={`${s - dx},${dy} ${s},${s} ${s},${s + s} ${s - dx},${s + dy}`} stroke={col} strokeWidth={1.5} opacity={0.7} />
              <polygon points={`${s + dx},${dy} ${s},${s} ${s},${s + s} ${s + dx},${s + dy}`} stroke={col} strokeWidth={1.5} opacity={0.7} />
              {lit && <circle cx={s} cy={s + dy} r={3 + ignite * 2} fill={C.gold} />}
            </svg>
          </div>
        );
      })}
      {/* 标题（暗场里也留一句） */}
      <div style={{ position: 'absolute', left: 140, top: 96, opacity: plate }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.goldDim, letterSpacing: 2 }}>— 03 · 暗场 · 规则引擎</div>
        <div style={{ font: `600 52px ${F.display}`, color: C.gold, marginTop: 18 }}>
          <FocusText text="标准，是一张张接住的网。" t={t} from={K.plate - 0.45} spanSec={0.6} />
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: C.stage, opacity: out * 0.8 }} />
    </AbsoluteFill>
  );
};

/** 04 两个出口：后台审批卡 + 手机推送消息同源同秒更新，一根线连着。 */
const TwinScene: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.out || t > K.numHead) return null;
  const drop = drawLanding(t, K.twinDrop, 0.4);
  const line = stroke(t, K.twinLine, 0.6);
  const push = draw(t, K.twinPush, 0.3);
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: F.text, opacity: draw(t, K.out + 0.2, 0.5) }}>
      <div style={{ position: 'absolute', left: 140, top: 96 }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.textMid, letterSpacing: 2 }}>— 03 · 一次输入，两个出口</div>
        <div style={{ font: `600 52px ${F.display}`, color: C.text, marginTop: 18 }}>
          <FocusText text="后台看到，手机收到，同源同秒。" t={t} from={K.out + 0.5} spanSec={0.6} />
        </div>
      </div>
      {/* 左：后台审批卡 */}
      <div style={{ position: 'absolute', left: 180, top: 320, width: 620, opacity: drop, transform: `translateY(${((1 - drop) * 16).toFixed(2)}px)`, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: shadow, padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ font: `600 18px ${F.text}`, color: C.text }}>审批后台 · 待确认</div>
          <span style={{ font: `500 13px ${F.text}`, color: C.hit, background: C.hitSoft, padding: '3px 9px', borderRadius: 999 }}>超标 ¥200</span>
        </div>
        <div style={{ font: `400 15px ${F.text}`, color: C.textMid, marginTop: 12, lineHeight: 1.6 }}>
          BX-202610-4471 · 住宿费 ¥1,200 超 ¥200<br />建议：超出部分 ¥200 由员工承担或申请特批
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <span style={{ font: `500 14px ${F.text}`, color: C.surface, background: C.text, padding: '8px 16px', borderRadius: 8 }}>通过</span>
          <span style={{ font: `500 14px ${F.text}`, color: C.text, border: `1px solid ${C.line}`, padding: '8px 16px', borderRadius: 8 }}>退回</span>
        </div>
      </div>
      {/* 中：连线 */}
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} fill="none">
        <path d="M 800 480 Q 960 380 1120 580" stroke={C.text} strokeWidth={1.5} strokeDasharray="4 4" opacity={line} />
        <circle cx={800 + line * 0} cy={480} r={4} fill={C.text} opacity={line} />
        <circle cx={1120} cy={580} r={4} fill={C.text} opacity={line} />
      </svg>
      {/* 右：手机推送 */}
      <div style={{ position: 'absolute', right: 180, top: 380, width: 340, opacity: drop, transform: `translateY(${((1 - drop) * 16).toFixed(2)}px)`, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, boxShadow: shadow, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, borderRadius: 7, background: C.text, display: 'inline-block' }} />
          <div>
            <div style={{ font: `600 14px ${F.text}`, color: C.text }}>报销助手</div>
            <div style={{ font: `400 12px ${F.mono}`, color: C.textFaint }}>09:41 · 现在</div>
          </div>
        </div>
        <div style={{ font: `500 16px ${F.text}`, color: C.text, marginTop: 12 }}>有一笔报销需要你确认</div>
        <div style={{ font: `400 14px ${F.text}`, color: C.textMid, marginTop: 6, lineHeight: 1.5 }}>
          住宿费超标 ¥200，点开看处理建议。
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** 05 数字墙：一排大数字从上到下逐行落定（踩拍），每个旁边一条细线图示；最后一句收束，128 格同时亮成通过绿（主高潮）。 */
const NumRow: React.FC<{ t: number; land: number; n: number; unit: string; note: string; children: (p: number) => React.ReactNode }> = ({ t, land, n, unit, note, children }) => {
  const p = drawLanding(t, land, 0.3);
  const shown = countUp(t - (land - 0.3), 0, n, 0.9);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', alignItems: 'center', minHeight: 150, borderTop: `1px solid ${C.line}`, opacity: p, transform: `translateY(${((1 - p) * 12).toFixed(2)}px)` }}>
      <div>
        <span style={{ font: `300 64px ${F.display}`, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{shown.toLocaleString()}</span>
        <span style={{ font: `600 19px ${F.text}`, color: C.text, marginLeft: 12 }}>{unit}</span>
        <div style={{ font: `400 14px ${F.text}`, color: C.textMid, marginTop: 2 }}>{note}</div>
      </div>
      <div>{children(draw(t, land - 0.1, 1.0))}</div>
    </div>
  );
};

const auditGroups = [['识别', 7], ['比对', 8], ['定位', 6], ['审批', 5]] as const;
const auditSteps = ['收到', '识别', '查标准', '比对', '定位', '生成', '自检', '推送', '已确认', '已归档'];

const NumbersScene: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.numHead - 1.0) return null;
  const fin = draw(t, K.final, 0.25);
  const push = 1 + 0.04 * easeInOutCubic(clamp01((t - K.out) / 9));
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: F.text, transform: `scale(${push.toFixed(5)})`, transformOrigin: '30% 40%' }}>
      <div style={{ position: 'absolute', left: 140, top: 96 }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.textMid, letterSpacing: 2, opacity: draw(t, K.numHead - 0.8, 0.4) }}>— 04 · 底座 · 可以被检查的部分</div>
        <div style={{ font: `600 52px ${F.display}`, color: C.text, marginTop: 18 }}>
          <FocusText text="能放心交出去，是因为每一份都查得到。" t={t} from={K.numHead - 0.45} spanSec={0.6} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 270 }}>
        <NumRow t={t} land={BEATS.rows[0]} n={42} unit="条规则 · 4 个能力包" note="每条规则有编号，判断时引用到行">
          {(p) => {
            let k = 0;
            const total = 42;
            return (
              <div style={{ display: 'flex', gap: 34 }}>
                {auditGroups.map(([g, n]) => (
                  <div key={g}>
                    <div style={{ font: `500 13px ${F.text}`, color: C.textMid, marginBottom: 8 }}>{g} <span style={{ color: C.textFaint }}>{n}</span></div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: n }, (_, i) => {
                        const on = k++ < p * total;
                        return <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: on ? (g === '比对' ? C.hit : C.text) : C.line }} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          }}
        </NumRow>
        <NumRow t={t} land={BEATS.rows[1]} n={124} unit="处超标，全部留给人看" note="超出标准的那一项都不自动通过">
          {(p) => (
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
              {Array.from({ length: 124 }, (_, i) => (
                <span key={i} style={{ width: 4, height: 22, background: i < p * 124 ? C.hit : C.line }} />
              ))}
            </div>
          )}
        </NumRow>
        <NumRow t={t} land={BEATS.rows[2]} n={0} unit="次误判，零漏放" note="该提醒的全提醒，不该拦的没拦">
          {(p) => (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ font: `300 64px ${F.display}`, color: C.ok, fontVariantNumeric: 'tabular-nums' }}>0</span>
              <span style={{ font: `400 16px ${F.text}`, color: C.textMid, opacity: p }}>误判</span>
            </div>
          )}
        </NumRow>
        <NumRow t={t} land={BEATS.rows[3]} n={31} unit="秒，月底 8,600 份全审完" note="每次改规则都全量回放 · 128 / 128 通过">
          {(p) => (
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
              {Array.from({ length: 128 }, (_, i) => (
                <span key={i} style={{ width: 4, height: 22, background: i < p * 128 ? (fin > 0 ? C.ok : C.textFaint) : C.line, opacity: fin > 0 ? 0.6 + 0.4 * fin : 1 }} />
              ))}
            </div>
          )}
        </NumRow>
      </div>
      <div style={{ position: 'absolute', left: 140, bottom: 70, font: `500 22px ${F.text}`, color: C.text }}>
        <FocusText text="超标交给人，标准交给规则。" t={t} from={K.final - 0.45} spanSec={0.5} />
      </div>
    </AbsoluteFill>
  );
};
