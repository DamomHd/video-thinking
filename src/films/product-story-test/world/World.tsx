/**
 * 样片的画面装配：四段按全片秒叠在同一张纸上——
 * 纸面微距（Macro）→ 纸到界面、界面演示（Ui）→ 暗场一亮（Stage，盖在纸面之上，亮度进出）→ 数字墙（Numbers）。
 * 时刻都在 layout.ts。
 */
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { PS } from '../theme';
import { K } from './layout';
import { Macro } from './Macro';
import { Ui } from './Ui';
import { Stage } from './Stage';
import { Numbers } from './Numbers';

export const World: React.FC<{ t: number }> = ({ t }) => (
  <AbsoluteFill style={{ background: PS.colors.paper }}>
    {t < K.flyLand + 0.2 && <Macro t={t} />}
    {/* 界面盖在化开的纸面上浮现，飞出的那句话在最上层 */}
    {t < K.out + 0.6 && <Ui t={t} />}
    <Numbers t={t} />
    <Stage t={t} />
  </AbsoluteFill>
);
