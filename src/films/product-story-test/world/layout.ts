/**
 * 样片的时间单源：画面（World 及各段）和声音适配器都从这里取时刻。
 * 落定类的成组动作踩配乐的拍（配乐出来之前按 0.25s 外推，出来之后自动吸到真拍上）。
 */
import { beatGrid, onBeats } from '../../../shared/beats';
import { MotionEvent, eventGroup } from '../../../shared/events';
import { MusicFile, SyncFile } from '../../../shared/types';
import { FILM_PLAN } from '../timeline';
import musicData from '../audio/music.json' with { type: 'json' };
import syncData from '../audio/sync.json' with { type: 'json' };

const S = (id: string) => FILM_PLAN.sceneStart(id);

export const K = {
  // 1 一张单子（纸面微距）
  hl: 1.0,                        // 荧光笔划过「质检未完成，退款暂缓」
  title: 2.0,                     // 「退货那天，她打了第三次电话。」
  fly: S('ui') - 1.1,             // 那句话飞出纸面（纸到界面）
  flyLand: S('ui') - 0.1,         //   落成工单摘要
  // 2 一句话走完流程（界面）
  uiHead: S('ui') + 0.6,          // 编号 + 结论句
  type: S('ui') + 1.0,            // 输入框打字
  typeEnd: S('ui') + 2.1,
  send: S('ui') + 2.3,            // 发送：气泡落定
  reply: S('ui') + 2.7,           // 回复流式出字
  replyEnd: S('ui') + 3.6,
  steps: S('ui') + 3.9,           // 四步逐张落定（踩拍）
  stats: S('ui') + 6.0,           // 左下三个数滚动
  // 3 暗场一亮
  dim: S('stage') - 0.4,          // 纸面暗下去
  plate: S('stage') + 0.3,        // 金线底板画出
  blocks: S('stage') + 1.0,       // 能力块亮起
  ignite: S('stage') + 1.9,       // 光柱升起、光点点亮（第二高潮）
  labels: S('stage') + 2.2,       // 两个标注（隔拍；暗场一屏只给两个读点）
  out: S('numbers') - 0.4,        // 亮回纸面
  // 4 数字墙
  numHead: S('numbers') + 0.4,
  rows: S('numbers') + 1.3,       // 四行逐行落定（踩拍）
  final: S('numbers') + 6.4,      // 收束句 + 128 格全亮（主高潮）
} as const;

export const GRID = beatGrid(musicData as unknown as MusicFile, syncData as unknown as SyncFile);
export const MUSIC_KEY = (musicData as unknown as MusicFile).cues[0]?.track?.key;

export const BEATS = {
  steps: onBeats(K.steps, 4, GRID),
  labels: onBeats(K.labels, 2, GRID, { every: 2 }),
  rows: onBeats(K.rows, 4, GRID, { every: 2 }),
};

/** 四步的内容；第 3 步是系统识别出的问题（命中橙），第 4 步等人确认 */
export const STEPS = [
  { title: '识别订单', note: 'TK-20481 · 退货已签收 · 金额 ¥ 386.00', state: 'done' },
  { title: '查规则', note: 'refund/2.3：签收后 48 小时内完成质检，超时自动转人工', state: 'done' },
  { title: '发现问题：质检超时 2 天', note: '质检单 QC-7712 没有人领取。规则要求转人工，不直接回复客户。', state: 'hit' },
  { title: '正在生成回复 · 等你确认后发出', note: '语气：致歉 + 给出到账时间 · 不承诺赔偿', state: 'run' },
] as const;

export const QUESTION = '这单为什么还没退款？';
export const STAGE_LABELS = ['入口', '6 个能力包'];

export const EVENTS: MotionEvent[] = [
  // 1 一张单子
  { id: '荧光笔', kind: 'draw', at: K.hl, end: K.hl + 0.8 },
  { id: '开场标题', kind: 'focus', at: K.title - 0.45, land: K.title, silent: '故意不配声：开场第一句留白，只有底噪和荧光笔的余音' },
  { id: '纸到界面', kind: 'morph', at: K.fly, land: K.flyLand },
  // 2 一句话走完流程
  { id: '界面标题', kind: 'focus', at: K.uiHead - 0.45, land: K.uiHead },
  { id: '打字', kind: 'count', at: K.type, land: K.typeEnd, end: K.typeEnd, count: { from: 0, to: [...QUESTION].length } },
  { id: '发送', kind: 'pop', at: K.send - 0.2, land: K.send },
  { id: '流式回复', kind: 'reveal', at: K.reply, land: K.replyEnd, end: K.replyEnd, silent: '故意不配声：出字本身很轻，紧接着就是四步落定的序列' },
  ...eventGroup('步骤', 'land', BEATS.steps, { dur: 0.3 }).map((e, i) => (i === 2 ? { ...e, kind: 'stamp' as const, weight: 'heavy' as const } : e)),
  { id: '三个数', kind: 'count', at: K.stats, land: K.stats + 0.9, end: K.stats + 0.9, count: { from: 0, to: 4 } },
  // 3 暗场一亮
  { id: '纸面暗下', kind: 'reveal', at: K.dim, land: K.dim + 0.6, silent: '故意不配声：暗场前的短静默（配乐在这里抽空）' },
  { id: '金线底板', kind: 'draw', at: K.plate, end: K.plate + 0.8 },
  { id: '能力块亮起', kind: 'reveal', at: K.blocks, land: K.blocks + 0.6 },
  { id: '光点点亮', kind: 'hero', at: K.ignite - 0.6, land: K.ignite },
  ...eventGroup('标注', 'land', BEATS.labels, { dur: 0.3 }),
  { id: '亮回纸面', kind: 'reveal', at: K.out, land: K.out + 0.6, silent: '故意不配声：亮回纸面靠配乐的回落' },
  // 4 数字墙
  { id: '数字墙标题', kind: 'focus', at: K.numHead - 0.45, land: K.numHead },
  ...eventGroup('数字行', 'land', BEATS.rows, { dur: 0.3 }),
  { id: '收束', kind: 'hero', at: K.final - 0.5, land: K.final },
];
