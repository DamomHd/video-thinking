/**
 * 风格注册表：id → 风格包。vw style list / sheet 据此找风格。
 * 两个来源：
 *   · 自有风格：用户认可某部片的样子后用 vw style save 收进来（会自动在下面登记一行）
 *   · 收录的风格：lemo-opuscar 的 59 个完整风格（opuscar.ts，由 scripts/style/import-opuscar.ts 生成），约束在各自的 STYLE.md 里。
 *     只有完整的风格才进库；OPUSCAR 98 的片段风格只作参考，在 docs/library/opuscar98/
 * 片子默认不选风格；选了某个风格，就按那个风格的 README / STYLE.md 做。
 */
import { StyleKit } from './types';
import { OPUSCAR_STYLES } from './opuscar';
import { BLUEPRINT } from './blueprint/style';
import { PRODUCT_STORY } from './product-story/style';

export const STYLES: Record<string, StyleKit> = {
  ...OPUSCAR_STYLES,
  blueprint: BLUEPRINT,
  'product-story': PRODUCT_STORY,
};

export function getStyle(id: string): StyleKit {
  const s = STYLES[id];
  if (!s) throw new Error(`没有风格「${id}」；已登记: ${Object.keys(STYLES).join(', ')}`);
  return s;
}

export * from './types';
export { BLUEPRINT, PRODUCT_STORY };
