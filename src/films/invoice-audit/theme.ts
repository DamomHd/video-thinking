import { extendStyle } from '../../styles/types';
import { PRODUCT_STORY } from '../../styles/product-story/style';

/**
 * 报销台（虚构产品演示）· 沿用 product-story 风格
 * 高度复刻：直接 extendStyle 不改任何值（色板、字体全用库里的）。
 */
export const INVOICE_AUDIT_THEME = extendStyle(PRODUCT_STORY, {});
