/**
 * 全局通用类型契约（全秒制，精度 0.1ms）
 */

/** 音频泳道。VO（口播）是可选层：只有带 audio/voice.json 的片子才有，要不要口播先问用户 */
export type AudioLayer = 'MUSIC' | 'BG' | 'TEX' | 'RISER' | 'WHOOSH' | 'IMPACT' | 'UI' | 'VO';
/** 音效泳道：除配乐和口播以外的层（音效计划、采购单、事件映射用它） */
export type SfxLayer = Exclude<AudioLayer, 'MUSIC' | 'VO'>;

export type EnterTransition = 'fade' | 'blur-scale' | 'push-up' | 'ink' | 'none';

export interface ScenePlanInput {
  id: string;              // 幕唯一标识，如 'prologue' | 'title' | 'care'
  label: string;           // 中文名称
  dur: number;             // 时长（秒）
  overlap: number;         // 与上一幕的交叠时长（秒）
  enter: EnterTransition;  // 入场过渡动效
}

export interface ScenePlanResolved extends ScenePlanInput {
  index: number;
  start: number;           // 全片绝对起点（秒）
  end: number;             // 全片绝对终点（秒）
}

export interface FilmTimelinePlan {
  scenes: ScenePlanResolved[];
  byId: Record<string, ScenePlanResolved>;
  totalSeconds: number;
  sceneStart: (id: string, localSec?: number) => number;
}

export function buildPlan(inputs: ScenePlanInput[]): FilmTimelinePlan {
  const scenes: ScenePlanResolved[] = [];
  const byId: Record<string, ScenePlanResolved> = {};
  let cursor = 0;
  inputs.forEach((item, index) => {
    const start = index === 0 ? 0 : Math.round((cursor - item.overlap) * 10000) / 10000;
    const end = Math.round((start + item.dur) * 10000) / 10000;
    cursor = end;
    const resolved: ScenePlanResolved = { ...item, index, start, end };
    scenes.push(resolved);
    byId[item.id] = resolved;
  });
  return {
    scenes,
    byId,
    totalSeconds: cursor,
    sceneStart: (id: string, localSec = 0) => {
      const s = byId[id];
      if (!s) throw new Error(`[timeline] 未知的幕 ID: ${id}`);
      return Math.round((s.start + localSec) * 10000) / 10000;
    },
  };
}

export interface PaletteSpec {
  slot: string;                    // 槽主键
  layer: SfxLayer;
  cat: string;                     // 类别
  tags: string;                    // 检索标签（UCS 命名规范）
  alt?: string;
  dur: [number, number];           // 目标时长区间 [minSec, maxSec]
  variants: number;                // 候选变体数
  mood?: string;
  align: 'peak' | 'onset';         // peak: 峰值对齐; onset: 起点对齐
  gain: number;                    // 相对层音量的倍率
  ucs?: string[];
}

export interface SpotAnnotation {
  id: string;                      // 语义 ID，如 "发送按钮点击"
  fromSec: number;                 // 起点（全片秒）
  toSec: number;                   // 终点（全片秒）
  layer: SfxLayer;
  slot: string;
  what: string;
  force?: boolean;
  take?: [number, number];         // 截取素材片段 [起秒, 止秒]
  pitchSemis?: number;             // 半音变调：playbackRate = 2^(semis/12)
}

/** 弹性区档位：hold/motion 可形变，physics/typing/video 一帧不动 */
export type ZoneKind = 'hold' | 'motion' | 'physics' | 'typing' | 'video';

export interface ElasticZone {
  name: string;
  kind: ZoneKind;
  fromSec: number;
  toSec: number;
  capShare?: number;
}

export interface VisualHit {
  id: string;
  sec: number;
  filmSec?: number;
  priority: 'P0' | 'P1' | 'P2';
  want: 'drop' | 'downbeat' | 'beat' | 'end' | 'finish';
  note?: string;
}

export interface FilmAdapter {
  filmId: string;
  title: string;
  fps: 30 | 60;
  width: number;
  height: number;
  timeline: FilmTimelinePlan;
  SC: Record<string, number>;
  K: Record<string, number>;
  ignoredKeys: string[];
  palette: Record<string, PaletteSpec>;
  spots: () => SpotAnnotation[];
  typings: () => { id: string; fromSec: number; durSec: number; label: string }[];
  hits: () => VisualHit[];
  /**
   * 弹性区：必须首尾相接盖满全片（刚性片也要显式声明 video 区）。
   * 求解器只在这里声明的弹性区内分摊位移，守门会校验连续性。
   */
  zones: () => ElasticZone[];
  /**
   * 可选：画面动作事件表（src/shared/events.ts）。实现了的片子，守门会对账「每个事件都配了声或写明留白理由」。
   */
  events?: () => import('./events').MotionEvent[];
}

// --- 九张真值 JSON 定义 ---

export interface SfxPlanItem {
  key: string;                     // 主键，如 "uiClick·发送按钮#2"
  what: string;
  layer: SfxLayer;
  slot: string;
  file: string;                    // 相对 public/ 的路径
  title: string;
  fromSec: number;                 // 挂载起点（秒）
  durSec: number;                  // 播放时长（秒）
  startFromSec: number;            // 素材内偏移（秒）
  volume: number;                  // 归一化基础音量 (0~1)
  fadeSec: number;                 // 默认淡入淡出（秒）
  loop?: boolean;
  pitchSemis?: number;             // 音高半音微调
}

export type SfxPlanFile = SfxPlanItem[];
export type SfxOffsetsFile = Record<string, number>; // key -> offsetSec
export type SfxGainsFile = Record<string, number>;   // key -> gainDb

export interface SfxFadesFile {
  in: Record<string, number>;
  out: Record<string, number>;
}

export interface DuckSpec {
  db: number;                      // 衰减 dB（如 -5）
  preSec: number;                  // 提前下潜时长（秒）
  holdSec: number;                 // 最深保持时长（秒）
  releaseSec: number;              // 恢复释放时长（秒）
  layers: AudioLayer[];            // 目标泳道
}
export type SfxDucksFile = Record<string, DuckSpec>;

export interface MixFile {
  layers: Record<Exclude<AudioLayer, 'VO'>, number> & { VO?: number }; // 各泳道增益 dB（VO 可选，缺省 0）
  muted: AudioLayer[];
  master: number;                     // 总线增益 dB
}

export interface TimeRef {
  ref: string;
  sec: number;
}

export interface MusicCue {
  id: string;
  label: string;
  in: TimeRef;
  out: TimeRef;
  climax?: TimeRef;
  climax2?: TimeRef;
  brief: string;
  track?: {
    id: string;
    title: string;
    artist: string;
    bpm: number;
    key?: string;                  // Camelot 调性码，如 "8A"
    file: string;
    durationSec: number;
    adapted: boolean;
    editId?: string;
    surgeryApplied?: boolean;
    /**
     * 外部来源：freesound = Freesound CC0 曲目；local-sampled = 本地作曲、用采样乐器演奏（license 是采样库的署名行）；
     * score = 按片作曲（片子的 audio/score.ts，vw music score；画面锁在配乐网格上，不做对拍拉伸）。
     * Epidemic 与合成音色的本地作曲不写。vw review 据此核对许可证
     */
    source?: 'freesound' | 'local-sampled' | 'score';
    license?: string;
    url?: string;
  };
  startFromSec: number;
  volume: number;
  fadeInSec: number;
  fadeOutSec: number;
  join?: {
    kind: 'cut' | 'crossfade' | 'gap' | 'bridge';
    overlapSec?: number;
  };
}

export interface MusicFile {
  version: 2;
  cues: MusicCue[];
}

export interface SfxTypingFile {
  file: string;
  title: string;
  offsets: Record<string, number>;
}

export interface SyncAnchor {
  hit: string;
  cueId: string;
  targetSec: number;
  musicSec: number;
  musicKind: 'drop' | 'downbeat' | 'beat' | 'end' | 'finish';
  errMs: number;
  priority: 'P0' | 'P1' | 'P2';
  status: 'locked' | 'downgraded' | 'dropped';
  note?: string;
}

export interface SyncFile {
  knots: [number, number][];       // [[scoreSec, filmSec]]
  anchors: SyncAnchor[];
  report: {
    scoreSync: number;
    lockedCount: number;
    downgradedCount: number;
    droppedCount: number;
  };
}

// --- Inbox 协议定义 ---

export type InboxTargetType = 'visual' | 'audio' | 'global';

export interface InboxVisualContext {
  sceneId: string;
  sceneFile: string;
  sceneLocalSec: number;
  boxNormalized?: [number, number, number, number]; // [x, y, w, h] (0~1)
  domHint?: string;
  screenshotPath?: string;
}

export interface InboxAudioContext {
  layer: AudioLayer;
  itemKey?: string;
  slot?: string;
  currentOffsetSec?: number;
  currentGainDb?: number;
  currentDuck?: DuckSpec;
}

export interface InboxItem {
  id: string;
  film: string;
  createdAt: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'rejected';
  targetType: InboxTargetType;
  filmSec: number;
  instruction: string;
  visual?: InboxVisualContext;
  audio?: InboxAudioContext;
  resolutionNote?: string;
  snapshotVersionBefore?: string;
}

/**
 * 口播（可选真值 audio/voice.json）：只有需要口播的片子才有这张表，要不要口播先问用户。
 * text / sec 手写（sec 是乐谱秒，和音效一样经对拍映射到放映时间）；file / durSec / checked 由 vw voice film 生成。
 */
export interface VoiceLine {
  id: string;
  /** 字幕和核对用的文字 */
  text: string;
  /** 起点（乐谱秒） */
  sec: number;
  /** 实际念的文字（数字、缩写按读法写），缺省同 text */
  say?: string;
  /** 转写核对时期望听到的文字（专名、数字读法和 Whisper 的写法不同时填） */
  asr?: string;
  voice?: string;
  /** edge-tts 语速，如 "+10%" */
  rate?: string;
  /** 以下由 vw voice film 写入 */
  file?: string;
  durSec?: number;
  checked?: boolean;
}

export interface VoiceFile {
  /** edge = 微软神经网络声音（中文用它，需联网）；kokoro = 离线（英文可用，中文读不准） */
  engine: 'edge' | 'kokoro';
  /** 缺省声音（行里可单独指定） */
  voice?: string;
  /** 口播时配乐压低多少 dB，缺省 −10 */
  duckDb?: number;
  lines: VoiceLine[];
}
