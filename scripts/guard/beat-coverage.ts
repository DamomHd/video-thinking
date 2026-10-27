import fs from 'node:fs';
import path from 'node:path';
import { FilmAdapter } from '../../src/shared/types.js';
import { TruthManager } from '../spot/truth.js';

export interface BeatCoverageReport {
  totalBeats: number;
  coveredBeats: number;
  ignoredBeats: number;
  /** K 表里有、但适配器源码里压根没引用过的键 */
  unreferencedBeats: string[];
  /** 源码里引用了、但 K 表里已经没有的键（删键漏改适配器） */
  danglingRefs: string[];
  /** 源码里只在注释里出现、没有真的配声的键（必须写明理由） */
  commentOnlyBeats: { key: string; reason: string }[];
  /** 调参表里有、但计划里没有的孤儿键 */
  orphanKeys: string[];
  /** ignoredKeys 里列了、但 K 表里已经没有的过期白名单条目 */
  staleIgnored: string[];
}

/**
 * 拍点覆盖与死键守门（对标 architecture.html §15.2 / §19）
 *
 * 口径是**源码文本引用**，不是时间窗口：
 *   K / CK 的每个键（IGNORE 表里的除外）都必须以 `K.<键>` 的文本形式
 *   出现在适配器源码里 —— **注释也算**，所以不配声的键要写进注释并说明理由。
 *
 * 为什么不按时间窗口判：窗口判只能回答「这个时刻附近有没有声音」，
 * 答不了两个更要命的问题 ——
 *   · 删了一个 K 键，适配器里还在用它（原版 10-09 就这么漏过一次，运行时才炸）
 *   · 加了一个 K 键，但谁都没管它（既没配声，也没说明为什么不配）
 * 文本引用能把这两种都抓出来。
 */
export async function checkBeatCoverage(adapter: FilmAdapter): Promise<BeatCoverageReport> {
  const kKeys = Object.keys(adapter.K);
  const ignored = new Set(adapter.ignoredKeys);
  const source = readAdapterSource(adapter.filmId);

  const unreferencedBeats: string[] = [];
  const commentOnlyBeats: { key: string; reason: string }[] = [];

  for (const key of kKeys) {
    if (ignored.has(key)) continue;
    const refs = findReferences(source, key);
    if (refs.length === 0) {
      unreferencedBeats.push(key);
      continue;
    }
    // 全部出现在注释里 → 这是「故意不配声」，但必须说明理由
    if (refs.every((r) => r.inComment)) {
      const withReason = refs.find((r) => hasReason(r.text));
      commentOnlyBeats.push({
        key,
        reason: withReason ? withReason.text.trim() : '（注释里没写理由）',
      });
    }
  }

  /**
   * 源码引用了但 K 表里没有的键 —— 这就是「退役的拍点还在被引用」（§19 的 CK_RETIRED）。
   *
   * 退役一个拍点的做法就是把它从 K 里删掉，于是任何残留引用都会落到这里。
   * 注意**不能**因为它在 ignoredKeys 里就放过：
   * ignoredKeys 的语义是「K 里有、但故意不配声」，
   * 不是「可以引用一个不存在的键」。放过的话，
   * 把退役键塞进白名单就能让守门闭嘴，而运行时照样会炸。
   */
  const danglingRefs: string[] = [];
  for (const used of collectUsedKeys(source)) {
    if (!kKeys.includes(used)) danglingRefs.push(used);
  }

  /** 白名单里列了、但 K 表里已经没有的键：过期条目，清掉免得掩盖问题 */
  const staleIgnored = adapter.ignoredKeys.filter((k) => !kKeys.includes(k));

  // 孤儿调参键
  const truth = new TruthManager(adapter.filmId).readAll();
  const validKeys = new Set<string>();
  truth.plan.forEach((p) => validKeys.add(p.key));
  truth.music.cues.forEach((c) => validKeys.add(`music:${c.id}`));
  Object.keys(truth.typing.offsets || {}).forEach((k) => validKeys.add(`typing:${k}`));
  adapter.typings().forEach((t) => validKeys.add(`typing:${t.id}`));

  const orphanKeys: string[] = [];
  const sweep = (dict: Record<string, unknown>, label: string) => {
    for (const key of Object.keys(dict)) {
      if (truth.plan.length > 0 && !validKeys.has(key)) orphanKeys.push(`${label} -> ${key}`);
    }
  };
  sweep(truth.offsets, 'sfxOffsets.json');
  sweep(truth.gains, 'sfxGains.json');
  sweep(truth.fades.in, 'sfxFades.in');
  sweep(truth.fades.out, 'sfxFades.out');
  sweep(truth.ducks, 'sfxDucks.json');

  return {
    totalBeats: kKeys.length,
    coveredBeats: kKeys.length - ignored.size - unreferencedBeats.length,
    ignoredBeats: ignored.size,
    unreferencedBeats,
    danglingRefs,
    commentOnlyBeats,
    orphanKeys,
    staleIgnored,
  };
}

/** 读适配器及其同目录下的源码（编舞常量可能拆在 timeline / rig 里） */
export function readAdapterSource(filmId: string): { file: string; lines: string[] }[] {
  const roots = [
    path.join(process.cwd(), 'src', 'films', filmId, 'audio'),
    path.join(process.cwd(), 'src', 'films', filmId),
  ];
  const out: { file: string; lines: string[] }[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const name of fs.readdirSync(root)) {
      const full = path.join(root, name);
      if (!fs.statSync(full).isFile()) continue;
      if (!/\.tsx?$/.test(name)) continue;
      if (seen.has(full)) continue;
      seen.add(full);
      out.push({
        file: path.relative(process.cwd(), full),
        lines: fs.readFileSync(full, 'utf-8').split('\n'),
      });
    }
  }
  return out;
}

export interface KeyReference {
  file: string;
  line: number;
  text: string;
  inComment: boolean;
}

/** 找 `K.<键>` 形式的文本引用；注释里的也算，但标出来 */
export function findReferences(
  source: { file: string; lines: string[] }[],
  key: string
): KeyReference[] {
  // K.ink / this.K.ink / K['ink'] / K.ink 出现在注释里都算
  // 末尾不能用 \b：中文键名后面没有 ASCII 词边界
  const pattern = new RegExp(
    `K(?:\\.|\\s*\\[\\s*['"\`])${escapeRe(key)}(?:['"\`]\\s*\\])?(?![\\w$])`,
    'u'
  );
  const out: KeyReference[] = [];

  for (const { file, lines } of source) {
    let inBlock = false;
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('/*')) inBlock = true;
      const isComment = inBlock || trimmed.startsWith('//') || trimmed.startsWith('*');
      if (pattern.test(line)) {
        out.push({ file, line: idx + 1, text: line, inComment: isComment });
      }
      if (trimmed.includes('*/')) inBlock = false;
    });
  }
  return out;
}

/** 从源码里收集所有被引用过的 K 键名 */
export function collectUsedKeys(source: { file: string; lines: string[] }[]): string[] {
  const found = new Set<string>();
  // 键名允许非 ASCII —— 本仓库的事件名和槽名都可能是中文
  const re = /K(?:\.|\s*\[\s*['"`])([^\s.,;:'"`[\](){}=<>!?+\-*/&|]+)/gu;
  for (const { lines } of source) {
    for (const line of lines) {
      // 跳过 K 表自己的定义行（`K: Record<string, number> = {` 之后的字面量不算引用）
      let m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) found.add(m[1]);
    }
  }
  return [...found];
}

/** 注释里有没有说明「为什么不配声」 */
function hasReason(text: string): boolean {
  return /不配|无需|不需要|留白|故意|刻意|只做|仅做|because|intentional/i.test(text);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
