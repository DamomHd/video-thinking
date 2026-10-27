/**
 * 风格包 (Style Kit)
 *
 * 一个风格 = 色板 + 字体 + （可选）图框，外加同目录的 README.md 和 refs/（参考帧）。两个来源：
 *   · 自有风格：用户认可某部片的样子后用 vw style save 沉淀，只定整体气质（README 写气质描述：靠什么成立、适合 / 不适合、不要什么）；
 *     画面怎么设计（语言、构图、动效、声音）由模型逐片设计，方法见 docs/method/、docs/library/
 *   · 收录的风格（lemo-opuscar，src/styles/opuscar.ts）：同目录多一份 STYLE.md 原文，材质、配色逻辑、字体、动效、镜头、声音都在里面；
 *     片子选了它就按 STYLE.md 做。这里的字段（色板、字体）只是从原文和样片源码抽出来方便代码用的
 *
 * 片子默认不选风格，在自己的 theme.ts 里写主题；沿用某个风格时用 extendStyle 派生（只写不同的部分；片子特有的段直接加）。
 */

/** 图框：图纸类风格的版面外框（分区刻度 + 标题栏），没有图框的风格不写 */
export interface StyleFrame {
  /** 图框离画面边缘的距离（px） */
  margin: number;
  /** 边上刻度的长度（px） */
  tickLen: number;
  /** 横向分区数（刻度标 1…cols） */
  cols: number;
  /** 纵向分区名 */
  rows: readonly string[];
}

export interface StyleKit {
  id: string;
  label: string;
  colors: Record<string, string>;
  fonts: Record<string, string>;
  frame?: StyleFrame;
}

/** 定义一个风格：只做类型约束，原样返回（as const 风格的字面量类型得以保留） */
export function defineStyle<T extends StyleKit>(style: T): T {
  return style;
}

/** 可选段（frame）也要能只覆盖其中几个字段；数组整体替换 */
type DeepPartial<T> = {
  [K in keyof T]?: NonNullable<T[K]> extends readonly unknown[] ? T[K] : NonNullable<T[K]> extends object ? DeepPartial<NonNullable<T[K]>> : T[K];
};

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepMerge<A, B>(base: A, over: B): A & B {
  if (!isPlain(base) || !isPlain(over)) return (over === undefined ? base : over) as A & B;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out as A & B;
}

/**
 * 片子从风格派生主题：overrides 只写不同的部分（深合并）；片子特有的段直接加。
 * colors / fonts 可以加风格里没有的键（片子自己的颜色进色板）。
 * 结果带 styleId，风格守门据此知道这部片用的是哪个风格。
 */
export function extendStyle<S extends StyleKit, O extends DeepPartial<StyleKit> & Record<string, unknown>>(
  style: S,
  overrides: O
): S & O & { styleId: string } {
  return { ...deepMerge(style, overrides), styleId: style.id } as S & O & { styleId: string };
}
