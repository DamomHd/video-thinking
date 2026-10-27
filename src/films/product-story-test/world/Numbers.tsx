/**
 * 4 数字墙：一排大数字从上到下逐行落定（踩拍），每个旁边一条细线图示；最后一句收束，128 格同时亮成通过绿（主高潮）。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { draw, drawLanding } from '../../../shared/motion';
import { countUp, clamp01, easeInOutCubic } from '../../../shared/anim';
import { FocusText } from '../../../components/shot';
import { PS } from '../theme';
import { K, BEATS } from './layout';

const C = PS.colors;
const F = PS.fonts;

const Row: React.FC<{ t: number; land: number; n: number; unit: string; note: string; children: (p: number) => React.ReactNode }> = ({ t, land, n, unit, note, children }) => {
  const p = drawLanding(t, land, 0.3);
  const shown = countUp(t - (land - 0.3), 0, n, 0.9);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', alignItems: 'center', minHeight: 150, borderTop: `1px solid ${C.line}`, opacity: p, transform: `translateY(${((1 - p) * 12).toFixed(2)}px)` }}>
      <div>
        <span style={{ font: `300 64px ${F.display}`, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{shown}</span>
        <span style={{ font: `600 19px ${F.text}`, color: C.text, marginLeft: 12 }}>{unit}</span>
        <div style={{ font: `400 14px ${F.text}`, color: C.textMid, marginTop: 2 }}>{note}</div>
      </div>
      <div>{children(draw(t, land - 0.1, 1.0))}</div>
    </div>
  );
};

const groups = [['识别', 8], ['规则', 9], ['回复', 7], ['质检', 6], ['升级', 7], ['回访', 5]] as const;
const steps = ['收到', '识别', '查单', '查规则', '找问题', '生成', '自检', '待确认', '已发出', '已回访'];

export const Numbers: React.FC<{ t: number }> = ({ t }) => {
  if (t < K.out - 0.2) return null;
  const fin = draw(t, K.final, 0.25);
  const push = 1 + 0.04 * easeInOutCubic(clamp01((t - K.out) / 9));
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: F.text, transform: `scale(${push.toFixed(5)})`, transformOrigin: '30% 40%' }}>
      <div style={{ position: 'absolute', left: 140, top: 96 }}>
        <div style={{ font: `400 15px ${F.mono}`, color: C.textMid, letterSpacing: 2, opacity: draw(t, K.numHead - 0.8, 0.4) }}>— 03 · 底座 · 可以被检查的部分</div>
        <div style={{ font: `600 52px ${F.display}`, color: C.text, marginTop: 18 }}>
          <FocusText text="能放心交出去，是因为每一步都查得到。" t={t} from={K.numHead - 0.45} spanSec={0.6} />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 140, right: 140, top: 270 }}>
        <Row t={t} land={BEATS.rows[0]} n={42} unit="条规则 · 6 个能力包" note="每条规则有编号，判断时引用到行">
          {(p) => {
            let k = 0;
            const total = 42;
            return (
              <div style={{ display: 'flex', gap: 34 }}>
                {groups.map(([g, n]) => (
                  <div key={g}>
                    <div style={{ font: `500 13px ${F.text}`, color: C.textMid, marginBottom: 8 }}>{g} <span style={{ color: C.textFaint }}>{n}</span></div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {Array.from({ length: n }, (_, i) => {
                        const on = k++ < p * total;
                        return <span key={i} style={{ width: 9, height: 9, borderRadius: 5, background: on ? (g === '识别' ? C.text : C.textFaint) : C.line }} />;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          }}
        </Row>
        <Row t={t} land={BEATS.rows[1]} n={3} unit="个写动作，全部要人确认" note="不确认只出预览，不写库">
          {(p) => (
            <div style={{ display: 'flex', gap: 10 }}>
              {['sendReply', 'escalateTicket', 'scheduleCallback'].map((a, i) => (
                <span key={a} style={{ opacity: p > i / 3 ? 1 : 0, display: 'inline-flex', alignItems: 'center', gap: 8, font: `400 14px ${F.mono}`, color: C.text, border: `1px solid ${C.line}`, background: C.surface, borderRadius: 6, padding: '6px 12px' }}>
                  <svg width="11" height="13" viewBox="0 0 11 13"><rect x="0.5" y="5.5" width="10" height="7" rx="1.5" fill="none" stroke={C.textMid} /><path d="M3 5.5V3.5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke={C.textMid} /></svg>
                  {a}
                </span>
              ))}
            </div>
          )}
        </Row>
        <Row t={t} land={BEATS.rows[2]} n={10} unit="个状态，一步一条审计" note="谁、何时、哪条规则、哪个版本">
          {(p) => (
            <div style={{ position: 'relative', height: 44 }}>
              <div style={{ position: 'absolute', left: 6, top: 6, height: 1, width: `calc(${(p * 100).toFixed(2)}% - 12px)`, background: C.textFaint }} />
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {steps.map((s, i) => (
                  <div key={s} style={{ textAlign: 'center', width: 64, opacity: p * 10 > i ? 1 : 0 }}>
                    <span style={{ display: 'inline-block', width: 13, height: 13, borderRadius: 7, background: i >= 7 ? C.ok : C.text }} />
                    <div style={{ font: `400 12px ${F.text}`, color: i >= 7 ? C.ok : C.textMid, marginTop: 6 }}>{s}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Row>
        <Row t={t} land={BEATS.rows[3]} n={128} unit="张真实格式的测试工单" note="每次改规则都全量回放 · 128 / 128 通过">
          {(p) => (
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
              {Array.from({ length: 128 }, (_, i) => (
                <span key={i} style={{ width: 4, height: 22, background: i < p * 128 ? (fin > 0 ? C.ok : C.textFaint) : C.line, opacity: fin > 0 ? 0.6 + 0.4 * fin : 1 }} />
              ))}
            </div>
          )}
        </Row>
      </div>
      <div style={{ position: 'absolute', left: 140, bottom: 70, font: `500 22px ${F.text}`, color: C.text }}>
        <FocusText text="判断交给规则，确认留给人。" t={t} from={K.final - 0.45} spanSec={0.5} />
      </div>
    </AbsoluteFill>
  );
};
