/**
 * 冷看（vw critic <片>）：给一个不带任何制作上下文的审片者打包材料。
 *
 * 做片的模型知道自己想讲什么，看不出观众实际收到了什么。这里只打包「观众能看到、听到的」：
 *   out/<片>/critic/
 *     sheet.png      全片均匀 24 帧
 *     frames/        16 张原尺寸帧（读字、看细节）
 *     strips/        能量最高的几处，前后 2 秒、每秒 6 帧
 *     signals.md     每秒能量 / 运动 / 响度、静默、硬切、口播原文（观众听到的话）
 *     PROMPT.md      给审片者的说明和回答格式
 * 不放决策单、信息表、脚本、代码。由做片的模型另起一个子代理只读这个目录，回答写到 out/<片>/critic.md；
 * vw review 读回来，把它复述的一句话和信息表的结论并排给出。
 * --frames=a.png,b.png：海报帧阶段，只打包这几张帧。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ReviewItem } from './review.js';
import { audioRmsLevels, energyCurve, normalize, perSecond, shotStats, sparkline } from './structure.js';

export const CRITIC_DIMS = ['看得懂', '完成度', '节奏', '记得住'] as const;
const PASS = 7;

/** 给审片者的说明（纯函数） */
export function criticPrompt(filmId: string, mode: 'film' | 'frames'): string {
  const material = mode === 'film'
    ? [
      '- `sheet.png`：全片均匀抽 24 帧（从左到右、从上到下，时刻见 `signals.md`）',
      '- `frames/`：16 张原尺寸帧，文件名是时刻——读字、看细节用这些',
      '- `strips/`：全片能量最高的几处，每张是那一处前后 2 秒、每秒 6 帧（从左到右、从上到下）',
      '- `signals.md`：每秒的能量 / 运动 / 响度曲线、静默段、硬切、口播原文（观众听到的话）',
      '',
      '你听不到声音，只能从 `signals.md` 推断；推断的写成推断。',
    ]
    : [
      '- `frames/`：这部片还没做完，这里只是几张关键帧（开场、主镜头、最密的一屏、结尾之类），文件名是做片的人起的',
      '',
      '只评这几张帧本身；节奏、声音没法评的写「未评」。',
    ];
  return [
    `# 冷看 · ${filmId}`,
    '',
    '你是第一次看这部片的观众，也是一位挑剔的同行。你不知道它是谁做的、想讲什么、为什么这样做——也不要去找：',
    `**只看这个目录（out/${filmId}/critic/）里的东西，不打开仓库里别的任何文件**（src/、docs/、director.md、代码都不要读）。`,
    '',
    '## 材料',
    ...material,
    '',
    '## 怎么评',
    '- 先从画面判断这是哪一类片子（汇报、产品片、科普、手绘动画……），**按这一类里做得最好的作品来要求它**，不拿别的类型的标准套（汇报片不需要预告片的快切，手绘片不需要 3D 的光影）。',
    '- 每一条都带时刻（秒），说具体的帧、具体的元素。不客气，不夸奖，不写空话。',
    '- 7 分 = 能交给一个挑剔的客户；9 分以上要能和这一类的顶级作品放在一起。',
    '',
    `## 回答写到 out/${filmId}/critic.md，按下面的格式（标题不要改）`,
    '',
    '```markdown',
    `# 冷看 · ${filmId}`,
    '',
    '## 一句话',
    '（看完你记住的这部片在说什么，一句话。说不出来就写「说不出来」，再写为什么）',
    '',
    '## 片型',
    '（这是哪一类片子；这一类里最好的作品是什么水准，这部片离它差在哪）',
    '',
    '## 看不懂',
    '- 12.4s：哪里看不懂、为什么（没有就写「- 无」）',
    '',
    '## 记住的一刻',
    '- 20.0s：是什么、为什么记住（没有就写「- 无」——这本身就是问题）',
    '',
    '## 最弱的三处',
    '- 8.0s：缺陷——怎么改',
    '',
    '## 分数',
    ...CRITIC_DIMS.map((d) => `- ${d}：n/10 —— 理由`),
    '```',
    '',
  ].join('\n');
}

export interface CriticNotes {
  sentence: string | null;
  confusing: string[];
  scores: Partial<Record<(typeof CRITIC_DIMS)[number], number>>;
}

function section(text: string, head: string): string {
  const i = text.indexOf(`## ${head}`);
  if (i < 0) return '';
  const rest = text.slice(i + head.length + 3);
  const j = rest.search(/\n## /);
  return j < 0 ? rest : rest.slice(0, j);
}

/** 读审片者的回答（纯函数） */
export function parseCritic(text: string): CriticNotes {
  const sentence = section(text, '一句话').split('\n').map((l) => l.trim()).find((l) => l && !/^[（(]/.test(l)) ?? null;
  const confusing = section(text, '看不懂').split('\n').map((l) => l.trim()).filter((l) => /^- /.test(l) && !/^- 无/.test(l)).map((l) => l.slice(2));
  const scores: CriticNotes['scores'] = {};
  for (const d of CRITIC_DIMS) {
    const m = section(text, '分数').match(new RegExp(`${d}[：:]\\s*(\\d+(?:\\.\\d+)?)`));
    if (m) scores[d] = Number(m[1]);
  }
  return { sentence, confusing, scores };
}

/** 冷看结果的提示（纯函数）：没冷看 / 过期 / 复述和结论并排 / 看不懂的地方 / 低分 */
export function criticReview(critic: { text: string; mtimeMs: number } | null, conclusion: string | undefined, finalMtimeMs: number, filmId: string): ReviewItem[] {
  const T = '冷看';
  if (!critic) return [{ level: 'hint', topic: T, text: `还没冷看：跑 vw critic ${filmId}，再另起一个不带任何制作上下文的子代理，只让它读 out/${filmId}/critic/PROMPT.md` }];
  const out: ReviewItem[] = [];
  if (critic.mtimeMs < finalMtimeMs) out.push({ level: 'hint', topic: T, text: `out/${filmId}/critic.md 比成片旧——成片改过，重新冷看（vw critic ${filmId}）` });
  const n = parseCritic(critic.text);
  if (!n.sentence || /说不出来/.test(n.sentence)) out.push({ level: 'warn', topic: T, text: `审片者说不出这部片在讲什么${n.sentence ? `：${n.sentence}` : ''}——结论没有传达到` });
  else out.push({ level: 'hint', topic: T, text: `审片者复述「${n.sentence}」 ↔ 信息表结论「${conclusion ?? '（没有）'}」——意思一致吗？不一致就是结论没传达到，写进「自检记录」` });
  if (n.confusing.length) out.push({ level: 'hint', topic: T, text: `看不懂 ${n.confusing.length} 处：${n.confusing.slice(0, 4).map((c) => (c.length > 40 ? c.slice(0, 40) + '…' : c)).join('；')}` });
  const low = CRITIC_DIMS.filter((d) => (n.scores[d] ?? 10) < PASS);
  const missing = CRITIC_DIMS.filter((d) => n.scores[d] === undefined);
  if (low.length) out.push({ level: 'hint', topic: T, text: `冷看低于 ${PASS} 分：${low.map((d) => `${d} ${n.scores[d]}`).join('、')}——缺陷和改法见 critic.md「最弱的三处」` });
  if (missing.length) out.push({ level: 'hint', topic: T, text: `冷看没打分：${missing.join('、')}` });
  if (!low.length && !missing.length) out.push({ level: 'ok', topic: T, text: CRITIC_DIMS.map((d) => `${d} ${n.scores[d]}`).join(' · ') });
  return out;
}

export function readCritic(root: string, filmId: string): { text: string; mtimeMs: number } | null {
  const f = path.join(root, 'out', filmId, 'critic.md');
  return fs.existsSync(f) ? { text: fs.readFileSync(f, 'utf-8'), mtimeMs: fs.statSync(f).mtimeMs } : null;
}

/** 能量最高的 k 处（纯函数）：彼此至少隔 gapSec 秒 */
export function energyPeaks(curve: number[], k = 3, gapSec = 5): number[] {
  const order = curve.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const picked: number[] = [];
  for (const [, i] of order) {
    if (picked.length >= k) break;
    if (picked.every((p) => Math.abs(p - i) >= gapSec)) picked.push(i);
  }
  return picked.sort((a, b) => a - b);
}

/** 曲线配一行刻度：每 10 秒一个数字（纯函数） */
export function ruler(n: number): string {
  let s = '';
  while (s.length < n) {
    const label = String(s.length);
    s += s.length % 10 === 0 ? label.padEnd(Math.min(10, n - s.length), ' ') : ' ';
  }
  return s.slice(0, n);
}

const fmt = (t: number) => `${t.toFixed(1).padStart(5, '0')}s`;

/** 打包（读文件、调 ffmpeg） */
export async function buildCriticPack(o: { root: string; filmId: string; video?: string; frames?: string[] }): Promise<{ dir: string; prompt: string }> {
  const dir = path.join(o.root, 'out', o.filmId, 'critic');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'frames'), { recursive: true });
  const prompt = path.join(dir, 'PROMPT.md');

  if (o.frames?.length) {
    for (const f of o.frames) fs.copyFileSync(f, path.join(dir, 'frames', path.basename(f)));
    fs.writeFileSync(prompt, criticPrompt(o.filmId, 'frames'), 'utf-8');
    return { dir, prompt };
  }

  const video = o.video ?? path.join(o.root, 'out', o.filmId, 'final-60.mp4');
  if (!fs.existsSync(video)) throw new Error(`找不到成片 ${video}（先 vw render ${o.filmId} --mode=final，或用 --frames= 只看关键帧）`);
  const { contactSheet, evenTimes } = await import('../look/stills.js');
  const { checkMotion } = await import('./motion-guard.js');
  const { quietRuns } = await import('./review.js');

  const sheet = contactSheet(video, path.join(dir, 'sheet.png'), { n: 24, cols: 6, width: 480 });
  const m = checkMotion(video);
  const dur = m.durationSec;
  for (const t of evenTimes(dur, 16)) {
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=1600:-2', '-q:v', '3', path.join(dir, 'frames', `${fmt(t)}.jpg`)]);
  }

  // 声音从成片本身读（观众听到的就是这一条）
  const rms = audioRmsLevels(video, 0.1);
  const motion = m.series ? perSecond(m.series.diffs, m.series.hz) : [];
  const loud = perSecond(rms, 10);
  const curve = energyCurve(motion, loud);
  fs.mkdirSync(path.join(dir, 'strips'), { recursive: true });
  const peaks = energyPeaks(curve);
  for (const p of peaks) {
    const a = Math.max(0, p - 1);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', String(a), '-t', '2', '-i', video, '-vf', 'fps=6,scale=480:-2,tile=4x3:padding=4:color=white', '-frames:v', '1', path.join(dir, 'strips', `${fmt(a)}-${fmt(a + 2)}.png`)]);
  }

  const silences = quietRuns(rms, 0.1).runs.filter(([a, b]) => a > 0.5 && b < dur - 0.5);
  const shots = shotStats(m.cuts, dur);
  const vPath = path.join(o.root, 'src', 'films', o.filmId, 'audio', 'voice.json');
  const vo: { sec: number; text: string }[] = fs.existsSync(vPath) ? (JSON.parse(fs.readFileSync(vPath, 'utf-8')).lines ?? []) : [];
  const n = curve.length;
  fs.writeFileSync(path.join(dir, 'signals.md'), [
    `# 信号 · 全长 ${dur.toFixed(1)}s`,
    '',
    `sheet.png 各格时刻：${sheet.times.map((t) => `${t.toFixed(1)}s`).join(' · ')}`,
    '',
    '## 每秒曲线（每格 1 秒，▁ 低 → █ 高，按全片自身拉伸）',
    '```',
    `秒      ${ruler(n)}`,
    `能量    ${sparkline(curve)}`,
    `运动    ${sparkline(normalize(motion).slice(0, n))}`,
    `响度    ${sparkline(normalize(loud).slice(0, n))}`,
    '```',
    `能量最高的几处：${peaks.map((p) => `${p}s`).join('、') || '无'}（strips/ 里有这几处前后 2 秒）`,
    '',
    `## 静默（比全片中位响度低 12 dB 以上、≥ 0.3s）`,
    silences.length ? silences.map(([a, b]) => `- ${a.toFixed(1)}–${b.toFixed(1)}s`).join('\n') : '- 无',
    '',
    '## 剪辑',
    `- 硬切 ${shots.count - 1} 处，镜头平均 ${shots.meanSec.toFixed(1)}s，最长 ${shots.longestSec.toFixed(1)}s（${shots.longestAt.toFixed(1)}s 起）`,
    '',
    '## 口播（观众听到的话，时刻为大约）',
    vo.length ? vo.map((l) => `- ${l.sec.toFixed(1)}s：${l.text}`).join('\n') : '- 没有口播',
    '',
  ].join('\n'), 'utf-8');
  fs.writeFileSync(prompt, criticPrompt(o.filmId, 'film'), 'utf-8');
  return { dir, prompt };
}
