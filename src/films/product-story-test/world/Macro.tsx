/**
 * 1 一张单子：镜头贴着一张售后单，浅景深（按离焦平面的远近逐行加模糊），慢慢横移；
 * 荧光笔划过关键那句，标题落在左下。之后纸面化开、淡出，那句话由 Ui 段接走（纸到界面）。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { draw, stroke } from '../../../shared/motion';
import { FocusText } from '../../../components/shot';
import { PS } from '../theme';
import { K } from './layout';

const C = PS.colors;
const F = PS.fonts;

const LINES = [
  '售后服务单　　　　　　　　　　　　　　编号 AS-2026-0381',
  '客户：王＊＊　　　联系方式：138＊＊＊＊2207',
  '商品：家用净水器 · 滤芯套装 ×1　　　金额：¥ 386.00',
  '申请原因：滤芯安装后漏水，申请退货退款。',
  '处理记录：10 月 12 日 退货已签收，进入质检。',
  '　　　　　10 月 14 日 质检未完成，退款暂缓。',
  '备注：客户已三次来电询问进度，情绪焦虑。',
  '经办人签字：　　　　　　　　　日期：',
];
const FOCUS = 5;
export const KEY_PHRASE = '质检未完成，退款暂缓';

export const Macro: React.FC<{ t: number }> = ({ t }) => {
  const away = draw(t, K.fly - 0.2, 1.0);
  const hl = stroke(t, K.hl, 0.8);
  const titleOut = draw(t, K.fly, 0.5);
  return (
    <AbsoluteFill style={{ background: C.docPaper, overflow: 'hidden', opacity: 1 - away }}>
      <div style={{ position: 'absolute', inset: 0, perspective: 900, perspectiveOrigin: '30% 40%', filter: `blur(${(away * 14).toFixed(2)}px)` }}>
        <div style={{ position: 'absolute', left: -150 - t * 30, top: -30 - t * 6, width: 2300, transformOrigin: '40% 50%', transform: 'rotateX(48deg) rotateZ(-14deg) scale(1.55)' }}>
          {LINES.map((l, i) => {
            const d = Math.abs(i - FOCUS);
            const blur = d === 0 ? 0 : 1.6 + d * 2.2;
            return (
              <div key={i} style={{ font: `400 44px/2.2 ${F.quote}`, color: C.docInk, whiteSpace: 'pre', filter: `blur(${blur.toFixed(1)}px)`, opacity: 1 - d * 0.08 }}>
                {i === FOCUS ? (
                  <>
                    {'　　　　　10 月 14 日 '}
                    {/* 飞走之后原处只留下淡淡的笔迹 */}
                    <span style={{ padding: '0 6px', backgroundImage: `linear-gradient(transparent 38%, ${C.highlight} 38%, ${C.highlight} 88%, transparent 88%)`, backgroundSize: `${(hl * 100).toFixed(2)}% 100%`, backgroundRepeat: 'no-repeat', opacity: t >= K.fly ? 0.35 : 1 }}>{KEY_PHRASE}</span>
                    {'。'}
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
          <FocusText text="退货那天，她打了第三次电话。" t={t} from={K.title - 0.45} spanSec={0.5} />
        </div>
        <div style={{ font: `400 19px ${F.text}`, color: C.textMid, marginTop: 14, opacity: draw(t, K.title + 0.4, 0.5) }}>单子上都写着，但没人看见。</div>
      </div>
    </AbsoluteFill>
  );
};
