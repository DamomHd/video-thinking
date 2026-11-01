/**
 * 报销台（虚构产品演示）· 时间单源
 *
 * 画面（scenes）和声音适配器都从这里取时刻。沿用 product-story 风格：
 * 落定类的成组动作踩配乐的拍（配乐出来之前按 0.25s 外推，出来之后自动吸到真拍上）。
 * 配乐走画面先行（grid.lock: false + g.hit(id)），拍点先按决策单逐秒节拍表外推。
 */
import { beatGrid, onBeats } from '../../shared/beats';
import type { MusicFile, SyncFile } from '../../shared/types';
import { FILM_PLAN } from './timeline';
import musicData from './audio/music.json' with { type: 'json' };
import syncData from './audio/sync.json' with { 'type': 'json' };

const S = (id: string) => FILM_PLAN.sceneStart(id);

export const K = {
  // 01 一份报销（纸面微距）
  hl: S('open') + 1.5,                 // 报销单 + 发票原件微距推近
  highlight: S('open') + 3.0,          // 荧光笔划过超标行
  amountFly: S('open') + 4.5,          // "超 ¥200" 飞出纸面成界面字段
  flyLand: S('open') + 5.7,            //   落成报销摘要
  toUi: S('open') + 6.5,               // 01→02 切到报销台界面
  // 02 一句话走完流程（界面）
  uiHead: S('flow') + 0.6,             // 编号 + 结论句
  type: S('flow') + 1.5,               // 输入框打字
  typeEnd: S('flow') + 2.6,
  send: S('flow') + 2.8,               // 发送：气泡落定
  reply: S('flow') + 3.2,              // 回复流式出字
  replyEnd: S('flow') + 4.1,
  steps: S('flow') + 4.4,              // 四步逐张落定（踩拍；BEATS.steps 用）
  stats: S('flow') + 6.5,              // 左下三个数滚动
  rows: S('numbers') + 1.3,            // 数字墙四行逐行落定（踩拍；BEATS.rows 用）
  // 03 暗场一亮
  dim: S('stage') - 0.4,               // 纸面暗下去
  plate: S('stage') + 0.3,             // 金线底板画出
  blocks: S('stage') + 1.0,           // 能力块亮起
  ignite: S('stage') + 1.9,           // 光柱升起、光点点亮（climax2 重拍）
  out: S('twin') - 0.4,                // 亮回纸面
  // 04 两个出口
  twinDrop: S('twin') + 0.5,           // 后台审批卡 + 手机推送同落
  twinLine: S('twin') + 3.0,           // 同源连线亮
  twinPush: S('twin') + 5.0,           // 审批已推送
  // 05 数字墙
  numHead: S('numbers') + 0.4,
  final: S('numbers') + 6.0,           // 收束句 + logo 落版
} as const;

export const GRID = beatGrid(musicData as unknown as MusicFile, syncData as unknown as SyncFile);

export const BEATS = {
  steps: onBeats(K.steps, 4, GRID),
  rows: onBeats(K.rows, 4, GRID, { every: 2 }),
};

/** 四步的内容；第 2 步是系统比对出差旅标准超标（命中橙），第 4 步等人确认审批 */
export const STEPS = [
  { title: '识别报销单', note: 'BX-202610-4471 · 住宿费发票 ¥1,200.00', state: 'done' as const },
  { title: '比对差旅标准', note: 'travel/lodging：出差地住宿上限 ¥1,000，超出 ¥200 需人工确认', state: 'hit' as const },
  { title: '定位超标行', note: '发票第 8 行 · 住宿费 ¥1,200 超 ¥200，连回原文那一行', state: 'done' as const },
  { title: '生成审批意见 · 等人确认', note: '意见：超出部分 ¥200 由员工承担或申请特批 · 推送审批', state: 'run' as const },
];

export const QUESTION = '这单住宿费能报吗？';
export const KEY_PHRASE = '超 ¥200';
