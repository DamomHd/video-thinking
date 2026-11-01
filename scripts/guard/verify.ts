/**
 * 事实溯源与验收状态（借鉴 chaojifeng-video-design 的知识包 / 验收状态机，只复用现有决策单字段，不新增 schema）：
 *
 *   · 事实溯源（factTrace）：屏幕上的字和口播里出现的数字，必须能在决策单「事实清单」里找到出处。
 *     这是机械检查——只查「数字有没有登记」，不判断事实本身对不对。
 *   · 验收状态（acceptanceStatus）：把 vw review 手里的证据归成六个维度，每维 passed / partial / not_run。
 *     原则：没看、没听、没做观众测试的维度不标通过；自动检查不能替代人的判断（结构通过 ≠ 听感通过）。
 * 只给提示（vw review 汇总），不拦出片。纯函数；读文件的入口在 review.ts。
 */
import type { ReviewItem } from './review.js';
import type { BriefRow, VoLine } from './brief.js';

/** 取决策单「事实清单」那一项（从「事实清单」起到下一个顶层「- 」条目、小节标题或信息表为止）（纯函数） */
export function factsText(director: string): string {
  const i = director.indexOf('事实清单');
  if (i < 0) return '';
  const rest = director.slice(i);
  const nl = rest.indexOf('\n');
  if (nl < 0) return rest;
  const tail = rest.slice(nl + 1);
  const end = tail.search(/\n(?:- |## |\|)/);
  return rest.slice(0, nl) + '\n' + (end < 0 ? tail : tail.slice(0, end));
}

/** 提取要追溯的数字：带小数 / 百分号 / 两位及以上的整数；单个数字（第 1 步、3 个）不查（纯函数） */
export function tracedNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.replace(/(\d),(\d{3})/g, '$1$2').matchAll(/\d+(?:\.\d+)?/g)) {
    if (m[0].length >= 2 || m[0].includes('.')) out.add(m[0]);
  }
  return [...out];
}

/** 事实溯源（纯函数）：屏幕字 + 口播里的数字，在事实清单里找不到就警告 */
export function factTrace(director: string, rows: BriefRow[], vo: VoLine[] = []): ReviewItem[] {
  const T = '事实溯源';
  const used = tracedNumbers([...rows.flatMap((r) => r.screen), ...vo.map((l) => l.text)].join(' '));
  if (!used.length) return [];
  const facts = factsText(director);
  // 清单里写的是「事实：…」之后的内容；只有说明文字（括号里的提示）不算登记过
  const body = facts.replace(/^[^：:\n]*(?:（[^）]*）)?[：:]?/, '').replace(/\s/g, '');
  if (!body) return [{ level: 'warn', topic: T, text: `屏幕 / 口播用到了数字（${used.slice(0, 6).join('、')}），但决策单「事实清单」是空的——每个数字先登记出处` }];
  const known = new Set(tracedNumbers(facts));
  const missing = used.filter((n) => !known.has(n));
  if (missing.length) return [{ level: 'warn', topic: T, text: `这些数字在事实清单里找不到出处：${missing.join('、')}——补登记（带出处）或改掉` }];
  return [{ level: 'ok', topic: T, text: `${used.length} 个数字都能在事实清单里找到` }];
}

export type Dim = '结构' | '事实' | '画面' | '播放' | '声音' | '理解';
export type State = 'passed' | 'partial' | 'not_run';

export interface Evidence {
  /** 决策单各节填写、信息表可解析、vw brief 无警告 */
  briefOk: boolean;
  /** 事实溯源已执行且无警告（'none' = 没有数字可查） */
  facts: 'ok' | 'warn' | 'none';
  /** 读字检查结果文件在不在、成片缩略图看过没（设计评审六维都打了分） */
  readcheck: boolean;
  designScored: boolean;
  /** 成片 + 运动检查有没有跑过、有没有闪帧 / 声音规则警告 */
  rendered: boolean;
  audioWav: boolean;
  soundWarn: boolean;
  /** 决策单「自检记录」里写了听审 / 试听 */
  listened: boolean;
  /** 冷看：critic.md 在不在、比成片新、没有「说不出来」类警告 */
  critic: 'none' | 'stale' | 'warn' | 'ok';
}

/** 验收状态（纯函数）：每个维度的状态和一句依据 */
export function acceptanceStatus(e: Evidence): { dim: Dim; state: State; note: string }[] {
  return [
    { dim: '结构', state: e.briefOk ? 'passed' : 'partial', note: e.briefOk ? '决策单与信息表自洽（机械检查，不判断好坏）' : '决策单 / 信息表还有警告' },
    e.facts === 'ok' ? { dim: '事实', state: 'passed', note: '数字都登记了出处（出处本身对不对仍需人核）' }
      : e.facts === 'warn' ? { dim: '事实', state: 'partial', note: '有数字没登记出处' }
        : { dim: '事实', state: 'not_run', note: '没有可追溯的数字，或事实清单没填' },
    e.designScored && e.readcheck ? { dim: '画面', state: 'passed', note: '读字检查跑过、设计评审六维已打分' }
      : e.designScored || e.readcheck ? { dim: '画面', state: 'partial', note: e.readcheck ? '读字检查跑过，设计评审没打完分' : '设计评审打了分，没跑 vw readcheck' }
        : { dim: '画面', state: 'not_run', note: '读字检查和设计评审都没做' },
    e.rendered ? { dim: '播放', state: 'passed', note: '成片已出、运动检查跑过' } : { dim: '播放', state: 'not_run', note: '还没有成片' },
    !e.audioWav ? { dim: '声音', state: 'not_run', note: '还没有成片音轨' }
      : e.listened && !e.soundWarn ? { dim: '声音', state: 'passed', note: '声音规则无警告、自检记录写了听审' }
        : { dim: '声音', state: 'partial', note: e.soundWarn ? '声音规则有警告' : '规则检查过了，但没有听审记录（在自检记录里写「听审」）' },
    e.critic === 'ok' ? { dim: '理解', state: 'passed', note: '冷看完成，审片者说得出这部片在讲什么' }
      : e.critic === 'none' ? { dim: '理解', state: 'not_run', note: '没冷看（vw critic）' }
        : { dim: '理解', state: 'partial', note: e.critic === 'stale' ? '冷看比成片旧，重做' : '冷看有警告' },
  ];
}

/** 验收状态 → 提示条目（纯函数）：一条汇总，not_run / partial 单独点出来 */
export function acceptanceReview(e: Evidence): ReviewItem[] {
  const st = acceptanceStatus(e);
  const line = st.map((s) => `${s.dim} ${s.state}`).join(' · ');
  const open = st.filter((s) => s.state !== 'passed');
  return [
    { level: open.length ? 'hint' : 'ok', topic: '验收状态', text: line },
    ...open.map((s) => ({ level: 'hint' as const, topic: '验收状态', text: `${s.dim}：${s.state}——${s.note}` })),
  ];
}
