/**
 * 2 一句话走完流程：左边编号 + 结论句 + 副句 + 三个数，右边是正在工作的产品界面。
 * 开头接住从纸面飞来的那句话（纸到界面），落成工单摘要；之后打字、发送、流式回复、四步逐张落定、进度走到 91%。
 * 镜头慢（整体极缓推），界面快。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { draw, drawLanding } from '../../../shared/motion';
import { clamp01, lerp, easeInOutCubic } from '../../../shared/anim';
import { FocusText } from '../../../components/shot';
import { PS } from '../theme';
import { K, BEATS, STEPS, QUESTION } from './layout';
import { KEY_PHRASE } from './Macro';

const C = PS.colors;
const F = PS.fonts;
const shadow = '0 12px 36px rgba(27, 26, 24, 0.06)';
const REPLY_A = '查到这单的 3 条记录，退款停在「待质检」——';
const REPLY_HL = '质检已经超时 2 天';
const REPLY_B = '。下面是我走过的步骤：';

const Chip: React.FC<{ tone: 'ok' | 'hit' | 'idle'; children: React.ReactNode }> = ({ tone, children }) => (
  <span style={{ font: `500 13px ${F.text}`, color: tone === 'ok' ? C.ok : tone === 'hit' ? C.hit : C.textMid, background: tone === 'ok' ? C.okSoft : tone === 'hit' ? C.hitSoft : C.line, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{children}</span>
);

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

/** 那句话从纸面的位置飞到工单摘要处（容器坐标；飞的时候界面还没开始推，比例是 1） */
const Flying: React.FC<{ t: number }> = ({ t }) => {
  const u = easeInOutCubic(clamp01((t - K.fly) / (K.flyLand - K.fly)));
  const x = lerp(170, 1010, u);
  const y = lerp(572, 222, u);
  const sc = lerp(3.6, 1, u);
  const rot = lerp(-13, 0, u);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 50%', transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${sc.toFixed(4)})`, font: `500 14px ${F.quote}`, color: C.text, whiteSpace: 'nowrap' }}>
      <span style={{ padding: '0 3px', backgroundImage: `linear-gradient(transparent 50%, ${C.highlight} 50%, ${C.highlight} 92%, transparent 92%)`, filter: `blur(${(Math.sin(u * Math.PI) * 1.2).toFixed(2)}px)` }}>{KEY_PHRASE}</span>
    </div>
  );
};

export const Ui: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.fly) return null;
  const card = draw(t, K.fly + 0.3, 0.8);
  const push = 1 + 0.06 * easeInOutCubic(clamp01((t - K.flyLand) / 8));
  const typed = Math.floor([...QUESTION].length * clamp01((t - K.type) / (K.typeEnd - K.type)));
  const sent = t >= K.send;
  const bubble = drawLanding(t, K.send, 0.25);
  const reply = clamp01((t - K.reply) / (K.replyEnd - K.reply));
  const replyAll = REPLY_A + REPLY_HL + REPLY_B;
  const shown = Math.floor([...replyAll].length * reply);
  const a = Math.min(shown, [...REPLY_A].length);
  const h = Math.max(0, Math.min(shown - [...REPLY_A].length, [...REPLY_HL].length));
  const b = Math.max(0, shown - [...REPLY_A].length - [...REPLY_HL].length);
  const recognized = t >= BEATS.steps[0];
  const caret = Math.floor(t * 2.4) % 2 === 0;
  const stat = (to: number, i: number) => Math.round(to * draw(t, K.stats + i * 0.15, 0.9));
  return (
    <AbsoluteFill style={{ fontFamily: F.text, transform: `scale(${push.toFixed(5)})`, transformOrigin: '62% 45%' }}>
      <div style={{ position: 'absolute', left: 140, top: 150, width: 640 }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.textMid, letterSpacing: 2, opacity: draw(t, K.uiHead - 0.8, 0.4) }}>— 01 · 一句话，走完整流程</div>
        <div style={{ font: `600 58px/1.25 ${F.display}`, color: C.text, marginTop: 22 }}>
          <div><FocusText text="一句话，" t={t} from={K.uiHead - 0.45} spanSec={0.3} /></div>
          <div><FocusText text="工单自己走完。" t={t} from={K.uiHead - 0.2} spanSec={0.45} /></div>
        </div>
        <div style={{ font: `400 21px/1.6 ${F.text}`, color: C.textMid, marginTop: 22, opacity: draw(t, K.uiHead + 0.4, 0.6) }}>坐席只问一句。识别、查规则、找问题、写回复——四步在一个窗口里走完，最后一步等人确认。</div>
        <div style={{ display: 'flex', gap: 36, marginTop: 64, opacity: draw(t, K.stats - 0.2, 0.4) }}>
          {([[4, '步，自动走完'], [1, '处，留给人看'], [0, '次，直接发给客户']] as const).map(([n, l], i) => (
            <div key={l}>
              <div style={{ font: `300 64px ${F.display}`, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{stat(n, i)}</div>
              <div style={{ font: `400 15px ${F.text}`, color: C.textMid, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'absolute', left: 880, top: 170, width: 900, opacity: card, transform: `translateY(${((1 - card) * 16).toFixed(2)}px)`, background: C.surface, border: `1px solid ${C.line}`, borderRadius: 14, boxShadow: shadow, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ font: `600 18px ${F.text}`, color: C.text }}>售后工单助手</div>
            <div style={{ font: `400 13px ${F.mono}`, color: C.textMid, marginTop: 6, height: 20 }}>TK-20481 ·</div>
          </div>
          {recognized ? <Chip tone="ok">✓ 已识别</Chip> : <Chip tone="idle">待处理</Chip>}
        </div>
        <div style={{ padding: '22px 24px 18px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 560 }}>
          {sent && (
            <div style={{ alignSelf: 'flex-end', maxWidth: 520, background: C.text, color: C.surface, font: `400 16px/1.5 ${F.text}`, padding: '10px 16px', borderRadius: '14px 14px 4px 14px', opacity: bubble, transform: `translateY(${((1 - bubble) * 10).toFixed(2)}px)` }}>{QUESTION}</div>
          )}
          {reply > 0 && (
            <div style={{ font: `400 16px/1.6 ${F.text}`, color: C.text, maxWidth: 760 }}>
              {[...REPLY_A].slice(0, a).join('')}
              {h > 0 && <span style={{ background: `linear-gradient(transparent 55%, ${C.highlight}88 55%)` }}>{[...REPLY_HL].slice(0, h).join('')}</span>}
              {[...REPLY_B].slice(0, b).join('')}
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
      <Flying t={t} />
      <div style={{ position: 'absolute', right: 140, bottom: 54, font: `400 12px ${F.mono}`, color: C.textFaint, opacity: card }}>演示数据 · 虚构项目</div>
    </AbsoluteFill>
  );
};
