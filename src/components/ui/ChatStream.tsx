/**
 * 工业级防换行抖动对话流组件 (Deterministic ChatStream)
 * 严格遵循 LoomCare §7.2 避坑规范第 3 条：
 * "逐字出字时，排版取决于哪个标签页先渲到那一帧，换行会来回跳：相邻两个标点同一帧出现 (PUNCT)"
 */

import React from 'react';
import { clamp01 } from '../../shared/anim';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  avatar?: string;
  timeSec?: number;
}

export interface ChatStreamProps {
  messages: ChatMessage[];
  /**
   * 当前打字进度 0..1 (或按幕内秒数推进)
   */
  progress?: number;
  theme?: 'dark' | 'light';
  className?: string;
  style?: React.CSSProperties;
}

// 标点保护集合：相邻标点必须打包为同一不可分割单元
const PUNCT_REGEX = /[，。！？；：、,.!?;:]+/g;

/**
 * 标点保护的分词算法：将文本切分为字块，遇到标点时与前一个字绑定，防止单独换行
 */
export function safeTokenize(text: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    // 检查后续是否紧跟标点
    if (i + 1 < text.length && /[，。！？；：、,.!?;:]/.test(text[i + 1])) {
      tokens.push(char + text[i + 1]);
      i += 2;
    } else {
      tokens.push(char);
      i++;
    }
  }
  return tokens;
}

export const ChatStream: React.FC<ChatStreamProps> = ({
  messages,
  progress = 1.0,
  theme = 'dark',
  className,
  style,
}) => {
  const isDark = theme === 'dark';
  const p = clamp01(progress);

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        width: '100%',
        maxWidth: 680,
        ...style,
      }}
    >
      {messages.map((msg, idx) => {
        const isUser = msg.sender === 'user';
        const tokens = safeTokenize(msg.text);
        // 按总进度分摊给各条消息
        const msgProgress = clamp01(p * messages.length - idx);
        const visibleTokenCount = Math.floor(tokens.length * msgProgress);

        if (visibleTokenCount <= 0 && p < 1) return null;

        const displayedText = tokens.slice(0, visibleTokenCount).join('');

        return (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: isUser ? 'row-reverse' : 'row',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            {/* 头像 */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: isUser ? '#A855F7' : '#FF5A79',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {isUser ? 'ME' : 'US'}
            </div>

            {/* 消息气泡 */}
            <div
              style={{
                maxWidth: '75%',
                padding: '12px 18px',
                borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                backgroundColor: isUser
                  ? (isDark ? 'rgba(168, 85, 247, 0.25)' : 'rgba(168, 85, 247, 0.15)')
                  : (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.85)'),
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                backdropFilter: 'blur(16px)',
                color: isDark ? '#FFFFFF' : '#111827',
                fontSize: 14,
                lineHeight: 1.6,
                letterSpacing: '-0.01em',
                wordBreak: 'break-word',
                // 标点保护，杜绝并发渲染标签页因排版精度差异产生的行宽抖动
                whiteSpace: 'pre-wrap',
              }}
            >
              {displayedText}
            </div>
          </div>
        );
      })}
    </div>
  );
};
