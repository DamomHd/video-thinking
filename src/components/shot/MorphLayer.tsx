import React from 'react';
import { morph, MorphItem, MorphOptions, Rect } from '../../shared/morph';

/**
 * 把一组元素从布局 a 挪到布局 b（FLIP）。
 * 元素绝对定位在父容器里；children 是渲染函数，拿到这一帧的 MorphItem 自己画内容 ——
 * 尺寸由矩形给出，内容用百分比/flex 撑满即可。
 */
export const MorphLayer: React.FC<{
  a: Record<string, Rect>;
  b: Record<string, Rect>;
  p: number;
  options?: MorphOptions;
  children: (item: MorphItem) => React.ReactNode;
}> = ({ a, b, p, options, children }) => (
  <>
    {morph(a, b, p, options).map((item) =>
      item.opacity <= 0.001 ? null : (
        <div
          key={item.id}
          style={{
            position: 'absolute',
            left: item.rect.x,
            top: item.rect.y,
            width: item.rect.w,
            height: item.rect.h,
            opacity: item.opacity,
          }}
        >
          {children(item)}
        </div>
      )
    )}
  </>
);
