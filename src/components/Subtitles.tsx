/**
 * 画面字幕（口播的字幕烧进画面）：<Subtitles cues={…} t={放映秒} style={…} />
 *
 * cues 是放映时间（shared/voice.voiceSubtitles 算好：至少 1.8s、不短于念完 + 0.6s、不和下一句重叠）。
 * 样式参数全部外露，默认是中性的底部半透明条；风格要求的字幕设计（发布会的提示条、水墨的题跋……）由片子传 style 或自己写组件。
 * 带 data-subtitle：读字检查据此认出字幕，检查它有没有压住画面上别的字。
 */
import React from 'react';
import { clamp01 } from '../shared/anim';

export interface SubtitleStyle {
  font: string;
  color: string;
  /** 底条背景；'none' 不要底条 */
  background: string;
  /** 离画面底边（px） */
  bottom: number;
  maxWidth: number;
  /** 淡入淡出（秒） */
  fadeSec: number;
  textShadow: string;
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  font: '500 40px "PingFang SC", "Hiragino Sans GB", sans-serif',
  color: '#FFFFFF',
  background: 'rgba(12, 12, 14, 0.62)',
  bottom: 72,
  maxWidth: 1400,
  fadeSec: 0.15,
  textShadow: '0 1px 6px rgba(0,0,0,0.5)',
};

export interface SubtitleCue {
  t0: number;
  t1: number;
  text: string;
}

/** 某一刻显示哪条、透明度多少（纯函数） */
export function subtitleAt(cues: SubtitleCue[], t: number, fadeSec: number): { cue: SubtitleCue; alpha: number } | null {
  const c = cues.find((q) => t >= q.t0 && t < q.t1);
  if (!c) return null;
  const f = Math.max(1e-3, fadeSec);
  return { cue: c, alpha: clamp01(Math.min((t - c.t0) / f, (c.t1 - t) / f)) };
}

export const Subtitles: React.FC<{ cues: SubtitleCue[]; t: number; style?: Partial<SubtitleStyle> }> = ({ cues, t, style }) => {
  const s = { ...DEFAULT_SUBTITLE_STYLE, ...style };
  const now = subtitleAt(cues, t, s.fadeSec);
  if (!now) return null;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: s.bottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: now.alpha }}>
      <div
        data-subtitle=""
        style={{ maxWidth: s.maxWidth, padding: s.background === 'none' ? 0 : '10px 28px', borderRadius: 12, background: s.background === 'none' ? 'transparent' : s.background, font: s.font, color: s.color, textShadow: s.textShadow, textAlign: 'center', lineHeight: 1.35 }}
      >
        {now.cue.text}
      </div>
    </div>
  );
};
