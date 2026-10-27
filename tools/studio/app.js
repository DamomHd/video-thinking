/* eslint-disable */
import {
  dbToLin,
  linToDb,
  clamp01,
  fadeAt,
  equalPowerCrossfade as equalPower,
  duckAt,
  voiceDuckTriggers,
  knotMap,
  identityWarp,
  buildWarp,
} from './formulas.js';

/**
 * 工作台前端 (Video Workbench Studio)
 * 对标 architecture.html §18：
 *   §18.4 播放引擎与双时钟 —— 每条片段一条 Web Audio 节点链
 *         Source → g(片段增益) → env(淡化) → dk(让位) → 层 Gain(推子/mute/solo) → master → Analyser
 *         音频只在视频 playing 之后起播；漂移 > 120ms 且距上次重排 ≥ 1.5s 才重排
 *         母片已重排过（时长 == 放映总长）时按恒等映射播放，否则按 toScore 驱动画面、playbackRate = 1/斜率
 *   §18.5 响度 —— OfflineAudioContext 按同一套公式离线混一遍，再按 BS.1770 测
 *   §18.6 所听即所得 —— 音量 / 淡化 / 让位 / 时间映射四个公式与渲染端同式
 */

/** VO（口播）是可选层：只有片子有 voice.json 时才显示这一轨 */
const LANES = ['MUSIC', 'VO', 'BG', 'TEX', 'RISER', 'WHOOSH', 'IMPACT', 'UI'];
const visibleLanes = () => LANES.filter((l) => l !== 'VO' || (S && S.truth.voice));
/** 界面上的轨道名（层的代号只在数据里用） */
const LANE_LABEL = { MUSIC: '配乐', VO: '口播', BG: '氛围床', TEX: '质感床', RISER: '起势', WHOOSH: '运动', IMPACT: '冲击', UI: '界面' };
/** 配乐段落名 */
const SECTION_LABEL = { intro: '前奏', verse: '主段', build: '起势', drop: '高潮', bridge: '过渡', outro: '尾奏', body: '主体' };
/** 拍点优先级 */
const PRIORITY_LABEL = { P0: '一级', P1: '二级', P2: '三级' };
const DRIFT_TOLERANCE = 0.12;
const RESYNC_COOLDOWN = 1.5;

let S = null;            // 影片状态（九张真值 + 幕表 + 拍点）
let films = [];
let filmId = new URLSearchParams(location.search).get('film') || '';
let warp = identityWarp();
let selected = null;     // { kind: 'sfx'|'cue', key }
let undoStack = [];
let redoStack = [];
/** 时间轴缩放：1 = 整片放进一屏 */
let zoom = 1;
let lastEdit = { key: null, field: null, at: 0 };
/** 各段配乐的真实网格（拍 / 小节头 / 段落），由 /api/sync/analyze 拉回来 */
let analyses = [];
/**
 * A/B 对比：'mix' = 听当前混音；'identity' = 按恒等映射听
 * （音效映回乐谱位置、配乐不动），用来判断弹性对拍到底带来了什么变化。
 */
let abMode = 'mix';

/* ──────────────────────────────── 公式 ─────────────────────────────── */
/**
 * 混音公式不在这个文件里 —— 全部来自 ./formulas.js，
 * 并由 src/shared/studio-parity.test.ts 和渲染端的 src/shared/audio-math.ts 逐点对照。
 * 之所以要有这道闸：两端各写一份的话，悄悄分叉时「所听即所得」就失效了，
 * 而这种失效在界面上看不出来（听到的和成片里的不一样，但两边都"正常工作"）。
 */

/* ──────────────────────────────── 音频引擎 ─────────────────────────────── */

const engine = {
  ctx: null,
  master: null,
  analyser: null,
  layerGain: {},
  buffers: new Map(),
  nodes: [],
  playing: false,
  /** ctx.currentTime 与放映时间的差：filmTime = ctx.currentTime - anchor */
  anchor: 0,
  lastResync: 0,
  solo: null,
  /** 试听倍速：画面和声音一起变（声音会跟着变调），只在工作台里有效 */
  speed: 1,
};

async function ensureEngine() {
  if (engine.ctx) return;
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
  engine.ctx = ctx;
  engine.master = ctx.createGain();
  engine.analyser = ctx.createAnalyser();
  engine.analyser.fftSize = 2048;
  engine.master.connect(engine.analyser);
  engine.analyser.connect(ctx.destination);
  for (const lane of LANES) {
    const g = ctx.createGain();
    g.connect(engine.master);
    engine.layerGain[lane] = g;
  }
  applyLaneGains();
  badge('engineBadge', `试听引擎 ${ctx.sampleRate / 1000}kHz`, 'ok');
  startBusMeter();
}

function applyLaneGains() {
  if (!engine.ctx) return;
  const mix = S.truth.mix;
  engine.master.gain.value = dbToLin(mix.master ?? 0);
  for (const lane of LANES) {
    const muted = (mix.muted || []).includes(lane) || (engine.solo && engine.solo !== lane);
    // 层推子只放层增益；片段增益与 master 在片段链上，避免重复相乘
    engine.layerGain[lane].gain.value = muted ? 0 : dbToLin(mix.layers[lane] ?? 0);
  }
}

function clipUrl(file) {
  let f = String(file || '').replace(/^\//, '');
  if (f.startsWith('public/')) f = f.slice(7);
  return '/public/' + f;
}

async function loadBuffer(ctx, file) {
  const url = clipUrl(file);
  if (engine.buffers.has(url)) return engine.buffers.get(url);
  const res = await fetch(url);
  if (!res.ok) { engine.buffers.set(url, null); return null; }
  const buf = await ctx.decodeAudioData(await res.arrayBuffer());
  engine.buffers.set(url, buf);
  return buf;
}

/** 收集所有要播的片段：音效 + 打字 + 配乐段，起点一律换算到放映时间 */
function collectClips() {
  const t = S.truth;
  const triggers = t.plan
    .filter((p) => t.ducks[p.key])
    .map((p) => ({ triggerStartSec: startOf(p), spec: t.ducks[p.key] }));

  const clips = [];

  for (const p of t.plan) {
    clips.push({
      kind: 'sfx', key: p.key, layer: p.layer, file: p.file,
      startSec: startOf(p), durSec: p.durSec, offsetInFile: p.startFromSec,
      baseVolume: p.volume, loop: !!p.loop,
      fadeIn: t.fades.in[p.key] ?? p.fadeSec,
      fadeOut: t.fades.out[p.key] ?? p.fadeSec,
      pitchSemis: p.pitchSemis || 0,
    });
  }

  const cues = [...t.music.cues].sort((a, b) => a.in.sec - b.in.sec);
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i];
    if (!c.track || !c.track.file) continue;
    const next = cues[i + 1];
    const prev = cues[i - 1];
    clips.push({
      kind: 'cue', key: 'music:' + c.id, cueId: c.id, layer: 'MUSIC', file: c.track.file,
      startSec: c.in.sec, durSec: c.out.sec - c.in.sec, offsetInFile: c.startFromSec,
      baseVolume: c.volume, loop: false,
      fadeIn: c.fadeInSec, fadeOut: c.fadeOutSec,
      xfadeIn: prev && prev.out.sec - c.in.sec > 1e-4 ? prev.out.sec - c.in.sec : 0,
      xfadeOut: next && c.out.sec - next.in.sec > 1e-4 ? c.out.sec - next.in.sec : 0,
      pitchSemis: 0,
    });
  }

  // 口播（可选 VO 层）：每句一段；配乐在口播时让位（与渲染端 FilmAudio 同式）
  if (t.voice) {
    const toFilm = (s) => (abMode === 'identity' || warp.identity ? s : warp.toFilm(s));
    triggers.push(...voiceDuckTriggers(t.voice, toFilm));
    for (const l of t.voice.lines) {
      if (!l.file || !l.durSec) continue;
      clips.push({
        kind: 'vo', key: 'vo:' + l.id, voId: l.id, layer: 'VO', file: l.file,
        startSec: toFilm(l.sec), durSec: l.durSec + 0.2, offsetInFile: 0,
        baseVolume: 1, loop: false, fadeIn: 0, fadeOut: 0, pitchSemis: 0,
      });
    }
  }

  return { clips, triggers };
}

/**
 * 片段真实起点：fromSec + offset（乐谱轴）→ toFilm。
 * A/B 的 'identity' 档按恒等映射算（音效留在乐谱位置、配乐不动），
 * 用来对比「弹性对拍到底把声音挪到了哪里」。
 */
function startOf(p) {
  const score = p.fromSec + (S.truth.offsets[p.key] ?? 0);
  if (abMode === 'identity' || warp.identity) return score;
  return warp.toFilm(score);
}

async function scheduleFrom(filmSec) {
  await ensureEngine();
  stopNodes();
  const ctx = engine.ctx;
  const { clips, triggers } = collectClips();
  const sp = engine.speed;
  // filmTime = (ctx.currentTime - anchor) × 倍速
  engine.anchor = ctx.currentTime - filmSec / sp;

  for (const clip of clips) {
    const buf = await loadBuffer(ctx, clip.file);
    if (!buf) continue;
    const endSec = clip.startSec + clip.durSec;
    if (endSec <= filmSec) continue;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = clip.loop;
    // 变调素材已离线做成独立文件（src/shared/pitch.ts），这里原速播放，和渲染端一致；倍速试听时整体变速
    src.playbackRate.value = sp;

    const env = ctx.createGain();
    src.connect(env);
    env.connect(engine.layerGain[clip.layer] || engine.master);

    // 从 filmSec 中途进入时，跳过已经过去的部分
    const skipped = Math.max(0, filmSec - clip.startSec);
    const when = engine.anchor + Math.max(filmSec, clip.startSec) / sp;
    const dur = clip.durSec - skipped;
    // 片段链上只放片段自己的增益 / 淡化 / 让位；层推子和总线在后级节点上（之前这里用了含层增益的曲线，层推子被算了两遍）
    const curve = envelopeCurveNoBus(clip, triggers);
    const curveStart = Math.floor((skipped / clip.durSec) * (curve.length - 1));
    const sliced = curve.slice(curveStart);

    env.gain.setValueAtTime(sliced[0] ?? 0, when);
    if (sliced.length >= 2 && dur > 0.01) {
      env.gain.setValueCurveAtTime(sliced, when, dur / sp);
    }

    src.start(when, clip.offsetInFile + skipped);
    src.stop(when + dur / sp);
    engine.nodes.push({ src, env });
  }

  engine.lastResync = ctx.currentTime;
}

function stopNodes() {
  for (const { src } of engine.nodes) {
    try { src.stop(); } catch (_) {}
  }
  engine.nodes = [];
}

/* ──────────────────────────────── 播放与双时钟 ─────────────────────────── */

const video = () => document.getElementById('videoEl');

/** 母片时长 ≈ 放映总长 → 已重排过，恒等播放；≈ 乐谱总长 → 要按 toScore 驱动 */
let videoClock = 'film';

function detectVideoClock() {
  const v = video();
  if (!v || !isFinite(v.duration)) return;
  const filmTotal = warp.identity ? S.totalSeconds : warp.toFilm(S.totalSeconds);
  videoClock = Math.abs(v.duration - filmTotal) <= Math.abs(v.duration - S.totalSeconds)
    ? 'film' : 'score';
  badge('warpBadge',
    `时间 ${warp.identity ? '未拉伸' : '按配乐拉伸过'} · 母片按${videoClock === 'film' ? '放映' : '乐谱'}时间`,
    warp.identity ? '' : 'warn');
}

function filmTimeNow() {
  const v = video();
  if (!v) return 0;
  if (videoClock === 'film') return v.currentTime;
  return warp.identity ? v.currentTime : warp.toFilm(v.currentTime);
}

async function togglePlay() {
  const v = video();
  if (!v || !v.src) return;
  if (v.paused) {
    await ensureEngine();
    if (engine.ctx.state === 'suspended') await engine.ctx.resume();
    await v.play();
  } else {
    v.pause();
  }
}

function onPlaying() {
  // 音频只在视频真的开始播之后起播（§18.4）
  scheduleFrom(filmTimeNow());
  engine.playing = true;
  document.getElementById('playBtn').textContent = '⏸';
}

function onPause() {
  stopNodes();
  engine.playing = false;
  document.getElementById('playBtn').textContent = '▶';
}

function onTimeUpdate() {
  const v = video();
  const film = filmTimeNow();
  drawPlayhead(film);
  showTimecode(film);

  if (videoClock === 'score' && !warp.identity) {
    // 画面按乐谱时间渲的母片：播放时设 playbackRate = 1 / 斜率
    const dt = 0.01;
    const slope = (warp.toFilm(v.currentTime + dt) - warp.toFilm(v.currentTime)) / dt;
    const rate = Math.max(0.5, Math.min(2, 1 / (slope || 1))) * engine.speed;
    if (Math.abs(v.playbackRate - rate) > 0.02) v.playbackRate = rate;
  } else if (Math.abs(v.playbackRate - engine.speed) > 0.001) {
    v.playbackRate = engine.speed;
  }
  followPlayhead(film);

  if (!engine.playing || !engine.ctx) return;
  const audioFilm = (engine.ctx.currentTime - engine.anchor) * engine.speed;
  const drift = Math.abs(audioFilm - film);
  if (drift > DRIFT_TOLERANCE && engine.ctx.currentTime - engine.lastResync > RESYNC_COOLDOWN) {
    scheduleFrom(film);
  }
}

/* ──────────────────────────────── 响度（BS.1770-4） ────────────────────── */

async function measureLoudness() {
  const btn = document.getElementById('measureBtn');
  btn.disabled = true;
  btn.textContent = '离线混音中…';
  try {
    const total = warp.identity ? S.totalSeconds : warp.toFilm(S.totalSeconds);
    const rate = 48000;
    const off = new OfflineAudioContext(2, Math.ceil(total * rate), rate);

    const master = off.createGain();
    master.gain.value = dbToLin(S.truth.mix.master ?? 0);
    master.connect(off.destination);
    const laneGain = {};
    for (const lane of LANES) {
      const g = off.createGain();
      const muted = (S.truth.mix.muted || []).includes(lane);
      g.gain.value = muted ? 0 : dbToLin(S.truth.mix.layers[lane] ?? 0);
      g.connect(master);
      laneGain[lane] = g;
    }

    const { clips, triggers } = collectClips();
    for (const clip of clips) {
      const buf = await loadBuffer(off, clip.file);
      if (!buf) continue;
      const src = off.createBufferSource();
      src.buffer = buf;
      src.loop = !!clip.loop;
      // 变调素材已离线做成独立文件（src/shared/pitch.ts），这里原速播放，和渲染端一致
      const env = off.createGain();
      src.connect(env);
      env.connect(laneGain[clip.layer] || master);
      // 片段链上的增益不含层推子与 master（它们在后级），避免重复相乘
      const curve = envelopeCurveNoBus(clip, triggers);
      env.gain.setValueAtTime(curve[0], clip.startSec);
      if (curve.length >= 2) env.gain.setValueCurveAtTime(curve, clip.startSec, clip.durSec);
      src.start(clip.startSec, clip.offsetInFile, clip.loop ? undefined : clip.durSec);
    }

    const rendered = await off.startRendering();
    const { lufs, truePeak } = bs1770(rendered);
    document.getElementById('lufsVal').textContent = `${lufs.toFixed(1)} LUFS`;
    document.getElementById('peakVal').textContent = `真峰值 ${truePeak.toFixed(1)} dBFS ·`;
    const delta = lufs - (-14);
    document.getElementById('lufsDelta').textContent = `离目标 −14 还差 ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
    document.getElementById('meterBar').style.width =
      `${Math.max(0, Math.min(100, ((lufs + 40) / 40) * 100)).toFixed(1)}%`;
  } catch (e) {
    alert('响度测量失败: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '测响度';
  }
}

/** 片段包络（不含层推子与 master，它们在后级节点上） */
function envelopeCurveNoBus(clip, triggers, step = 0.02) {
  const n = Math.max(2, Math.ceil(clip.durSec / step) + 1);
  const arr = new Float32Array(n);
  const itemDb = S.truth.gains[clip.key] ?? 0;
  for (let i = 0; i < n; i++) {
    const local = Math.min(clip.durSec, i * step);
    let fade = fadeAt(local, clip.durSec, clip.fadeIn, clip.fadeOut);
    if (clip.kind === 'cue') {
      if (clip.xfadeIn > 0 && local < clip.xfadeIn) fade = equalPower(local / clip.xfadeIn).inGain;
      else if (clip.xfadeOut > 0 && local > clip.durSec - clip.xfadeOut) {
        fade = equalPower((local - (clip.durSec - clip.xfadeOut)) / clip.xfadeOut).outGain;
      }
    }
    const dk = duckAt(clip.startSec + local, clip.layer, triggers);
    arr[i] = Math.max(0, clip.baseVolume * dbToLin(itemDb) * fade * dk);
  }
  return arr;
}

/**
 * BS.1770-4：K 加权（高架 +4dB @ 1681.97Hz，高通 38.1Hz）
 * → 400ms 块、75% 重叠 → 绝对门限 −70 LUFS、相对门限 −10 LU
 */
function bs1770(buffer) {
  const rate = buffer.sampleRate;
  const chans = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    chans.push(kWeight(buffer.getChannelData(c).slice(), rate));
  }

  let truePeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const raw = buffer.getChannelData(c);
    for (let i = 0; i < raw.length; i++) truePeak = Math.max(truePeak, Math.abs(raw[i]));
  }

  const block = Math.round(rate * 0.4);
  const hop = Math.round(block * 0.25);
  const loudness = [];
  for (let start = 0; start + block <= chans[0].length; start += hop) {
    let sum = 0;
    for (const ch of chans) {
      let acc = 0;
      for (let i = start; i < start + block; i++) acc += ch[i] * ch[i];
      sum += acc / block; // 左右声道权重均为 1.0
    }
    loudness.push(-0.691 + 10 * Math.log10(Math.max(sum, 1e-12)));
  }
  if (loudness.length === 0) return { lufs: -Infinity, truePeak: -Infinity };

  const absGated = loudness.filter((l) => l > -70);
  if (absGated.length === 0) return { lufs: -Infinity, truePeak: 20 * Math.log10(Math.max(truePeak, 1e-9)) };
  const meanPow = (arr) =>
    arr.reduce((a, l) => a + Math.pow(10, (l + 0.691) / 10), 0) / arr.length;
  const relThresh = -0.691 + 10 * Math.log10(meanPow(absGated)) - 10;
  const gated = absGated.filter((l) => l > relThresh);
  const finalArr = gated.length ? gated : absGated;
  const lufs = -0.691 + 10 * Math.log10(meanPow(finalArr));

  return { lufs, truePeak: 20 * Math.log10(Math.max(truePeak, 1e-9)) };
}

/** K 加权：高架滤波 + 高通，系数按 BS.1770 在目标采样率上重算 */
function kWeight(x, rate) {
  // 1) 高架 +4dB @ 1681.97Hz, Q=1/√2
  x = biquad(x, shelfCoeffs(1681.97, 1 / Math.SQRT2, 4, rate));
  // 2) 高通 38.1Hz, Q=0.5
  x = biquad(x, highpassCoeffs(38.1, 0.5, rate));
  return x;
}

function shelfCoeffs(f0, Q, gainDb, rate) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / rate;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const sq = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cosw + sq);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cosw);
  const b2 = A * ((A + 1) + (A - 1) * cosw - sq);
  const a0 = (A + 1) - (A - 1) * cosw + sq;
  const a1 = 2 * ((A - 1) - (A + 1) * cosw);
  const a2 = (A + 1) - (A - 1) * cosw - sq;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function highpassCoeffs(f0, Q, rate) {
  const w0 = (2 * Math.PI * f0) / rate;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const b0 = (1 + cosw) / 2, b1 = -(1 + cosw), b2 = (1 + cosw) / 2;
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

function biquad(x, [b0, b1, b2, a1, a2]) {
  const out = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/* ──────────────────────────────── 真值写回 ─────────────────────────────── */

async function post(route, payload) {
  const res = await fetch(`/api/${route}?film=${filmId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ film: filmId, ...payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(`写入失败: ${err.error || res.status}`);
    return null;
  }
  return res.json();
}

/** 800ms 内对同一 key 的同一字段连续微调合并成一步 */
function pushUndo(entry) {
  const now = Date.now();
  if (lastEdit.key === entry.key && lastEdit.field === entry.field && now - lastEdit.at < 800) {
    lastEdit.at = now;
    return;
  }
  undoStack.push(entry);
  redoStack = []; // 新的改动之后，之前撤销掉的就不能再重做了
  if (undoStack.length > 80) undoStack.shift();
  lastEdit = { key: entry.key, field: entry.field, at: now };
}

/** 一步改动的当前值（撤销时存进重做栈） */
function currentValue(e) {
  if (e.field === 'offset') return S.truth.offsets[e.key] ?? 0;
  if (e.field === 'gain') return S.truth.gains[e.key] ?? 0;
  return JSON.parse(JSON.stringify(S.truth.music));
}

async function applyValue(e, value) {
  if (e.field === 'offset') {
    S.truth.offsets[e.key] = value;
    await post('offset', { key: e.key, offsetSec: value });
  } else if (e.field === 'gain') {
    S.truth.gains[e.key] = value;
    await post('gain', { key: e.key, gainDb: value });
  } else if (e.field === 'cueTable') {
    S.truth.music = value;
    await post('music/restore', { music: value });
  }
  renderAll();
  if (engine.playing) scheduleFrom(filmTimeNow());
}

async function undo() {
  const e = undoStack.pop();
  if (!e) return;
  lastEdit = { key: null, field: null, at: 0 };
  redoStack.push({ ...e, prev: currentValue(e) });
  await applyValue(e, e.prev);
}

async function redo() {
  const e = redoStack.pop();
  if (!e) return;
  lastEdit = { key: null, field: null, at: 0 };
  undoStack.push({ ...e, prev: currentValue(e) });
  await applyValue(e, e.prev);
}

/* ──────────────────────────────── 渲染 ────────────────────────────────── */

const fmt = (s) => {
  if (!isFinite(s)) return '00:00.00';
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};

function badge(id, text, cls) {
  const el = document.getElementById(id);
  el.textContent = text;
  el.className = 'badge' + (cls ? ' ' + cls : '');
}

function filmTotal() {
  return warp.identity ? S.totalSeconds : warp.toFilm(S.totalSeconds);
}

function drawPlayhead(filmSec) {
  const pct = (filmSec / filmTotal()) * 100;
  document.getElementById('playhead').style.left = `${Math.max(0, Math.min(100, pct))}%`;
  document.querySelectorAll('.lane-track').forEach((tr) => {
    let ph = tr.querySelector('.playhead');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'playhead';
      tr.appendChild(ph);
    }
    ph.style.left = `${Math.max(0, Math.min(100, pct))}%`;
  });
}

function renderRuler() {
  const total = filmTotal();
  const ruler = document.getElementById('ruler');
  ruler.innerHTML = '<div class="playhead" id="playhead" style="left:0"></div>';
  const shown = total / zoom;
  const step = shown > 120 ? 10 : shown > 40 ? 5 : shown > 12 ? 2 : 1;
  for (let t = 0; t <= total; t += step) {
    const d = document.createElement('div');
    d.className = 'tick';
    d.style.left = `${(t / total) * 100}%`;
    d.style.top = '14px';
    d.style.height = '40px';
    d.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.round(t % 60)).padStart(2, '0')}`;
    ruler.appendChild(d);
  }
  for (const sc of S.scenes) {
    const d = document.createElement('div');
    d.className = 'scene';
    d.style.left = `${((warp.identity ? sc.start : warp.toFilm(sc.start)) / total) * 100}%`;
    d.textContent = sc.label || sc.id;
    ruler.appendChild(d);
  }
  for (const h of S.hits) {
    const d = document.createElement('div');
    d.className = `hit ${h.priority}`;
    d.style.left = `${((warp.identity ? h.sec : warp.toFilm(h.sec)) / total) * 100}%`;
    d.title = `拍点 ${h.id}（${PRIORITY_LABEL[h.priority] || h.priority}）${h.note ? '：' + h.note : ''}`;
    ruler.appendChild(d);
  }

  // 配乐段落（前奏 / 起势 / 高潮 / 尾奏…），来自配乐的实测分析
  for (const a of analyses) {
    const cue = (S.truth.music.cues || []).find((c) => c.id === a.cueId);
    if (!cue || !Array.isArray(a.sections)) continue;
    for (const sec of a.sections) {
      const from = cue.in.sec + sec.startSec;
      const to = cue.in.sec + (sec.endSec ?? sec.startSec);
      if (from >= total) continue;
      const d = document.createElement('div');
      d.className = 'section' + (sec.kind === 'drop' ? ' drop' : '');
      d.style.left = `${(from / total) * 100}%`;
      d.style.width = `${(Math.max(0.2, Math.min(total, to) - from) / total) * 100}%`;
      d.textContent = SECTION_LABEL[sec.kind] || sec.kind;
      ruler.appendChild(d);
    }
  }

  // 节拍网格：每段配乐各画各的（不是只画第一段、也不是从 0 起算）
  for (const a of analyses) {
    const cue = (S.truth.music.cues || []).find((c) => c.id === a.cueId);
    if (!cue || a.source !== 'measured') continue;
    const base = cue.in.sec;
    for (const b of a.beats || []) {
      const sec = base + b;
      if (sec > total) break;
      const d = document.createElement('div');
      d.className = 'beat';
      d.style.left = `${(sec / total) * 100}%`;
      ruler.appendChild(d);
    }
    for (const b of a.downbeats || []) {
      const sec = base + b;
      if (sec > total) break;
      const d = document.createElement('div');
      d.className = 'beat bar';
      d.style.left = `${(sec / total) * 100}%`;
      ruler.appendChild(d);
    }
  }
}

/** 吸附目标：拍点、小节头、场景起点、邻段边界、播放头 */
function snapTargets(excludeCueId) {
  const total = filmTotal();
  const out = [];
  for (const sc of S.scenes) out.push({ sec: warp.identity ? sc.start : warp.toFilm(sc.start), kind: '幕 ' + sc.id });
  for (const h of S.hits) out.push({ sec: warp.identity ? h.sec : warp.toFilm(h.sec), kind: '拍点 ' + h.id });
  for (const a of analyses) {
    const cue = (S.truth.music.cues || []).find((c) => c.id === a.cueId);
    if (!cue || a.source !== 'measured') continue;
    for (const b of a.downbeats || []) out.push({ sec: cue.in.sec + b, kind: '小节头' });
  }
  for (const c of S.truth.music.cues || []) {
    if (c.id === excludeCueId) continue;
    out.push({ sec: c.in.sec, kind: '段 ' + c.id + ' 入' });
    out.push({ sec: c.out.sec, kind: '段 ' + c.id + ' 出' });
  }
  out.push({ sec: filmTimeNow(), kind: '播放头' });
  return out.filter((t) => t.sec >= 0 && t.sec <= total);
}

/** 7px 以内吸附；按住 ⌘ 关掉吸附 */
function snapSec(sec, pxPerSec, excludeCueId, noSnap) {
  if (noSnap) return { sec, snappedTo: null };
  const tolSec = 7 / Math.max(1e-6, pxPerSec);
  let best = null;
  for (const t of snapTargets(excludeCueId)) {
    const d = Math.abs(t.sec - sec);
    if (d <= tolSec && (!best || d < best.d)) best = { ...t, d };
  }
  return best ? { sec: best.sec, snappedTo: best.kind } : { sec, snappedTo: null };
}

/* ──────────────────────────── 缩放与视窗 ──────────────────────────── */

/** 时间轴轨道的像素宽：缩放 1 = 正好放满可见区域 */
function trackWidth() {
  const tl = document.getElementById('timeline');
  return Math.max(200, (tl.clientWidth - 160 - 14) * zoom);
}

function applyZoom() {
  document.getElementById('timeline').style.setProperty('--tlw', `${trackWidth()}px`);
}

/** 改缩放时让 anchorSec 留在原来的屏幕位置（缺省是播放头） */
function setZoom(z, anchorSec) {
  const tl = document.getElementById('timeline');
  const total = filmTotal();
  const at = anchorSec ?? filmTimeNow();
  const screenX = (at / total) * trackWidth() - tl.scrollLeft;
  zoom = Math.max(1, Math.min(16, z));
  document.getElementById('zoomRange').value = String(zoom);
  applyZoom();
  renderRuler();
  renderLanes();
  tl.scrollLeft = Math.max(0, (at / total) * trackWidth() - screenX);
  drawPlayhead(filmTimeNow());
}

/** 播放时播放头走出可见区就翻页 */
function followPlayhead(filmSec) {
  if (zoom <= 1 || !engine.playing) return;
  const tl = document.getElementById('timeline');
  const x = (filmSec / filmTotal()) * trackWidth();
  const view = tl.clientWidth - 160;
  if (x < tl.scrollLeft || x > tl.scrollLeft + view - 40) tl.scrollLeft = Math.max(0, x - view * 0.15);
}

/* ──────────────────────────── 候选素材（换音效） ──────────────────────────── */

let candAudio = null;

function slotOf(key) {
  const p = S.truth.plan.find((x) => x.key === key);
  return p ? p.slot || key.split('·')[0] : key.split('·')[0];
}

async function openCandidates() {
  if (!selected || selected.kind !== 'sfx') return;
  const sec = document.getElementById('candSec');
  sec.hidden = false;
  const slot = slotOf(selected.key);
  document.getElementById('candSlot').textContent = slot;
  const box = document.getElementById('candList');
  box.innerHTML = '<div class="hint">读候选…</div>';
  const r = await (await fetch(`/api/sfx/candidates?film=${filmId}&slot=${encodeURIComponent(slot)}`)).json();
  const list = r.candidates || [];
  if (!list.length) {
    box.innerHTML = '<div class="hint">这个槽还没有候选。点「再搜一批」，或在命令行跑 vw sfx search。</div>';
  } else {
    box.innerHTML = list
      .map((c, i) => {
        const bits = [c.source, c.durationSec ? c.durationSec.toFixed(2) + ' 秒' : '', c.score != null ? '匹配 ' + Number(c.score).toFixed(2) : '', c.license && /zero/.test(c.license) ? 'CC0' : '']
          .filter(Boolean).join(' · ');
        return `<div class="cand${c.current ? ' cur' : ''}" title="${escapeHtml((c.title || c.id) + '\n' + bits)}">
          <button class="btn" data-play="${i}" ${c.preview ? '' : 'disabled'} title="试听">▶</button>
          <div style="min-width:0"><div class="t">${escapeHtml(c.title || c.id)}</div><div class="meta">${escapeHtml(bits)}</div></div>
          ${c.current ? '<span class="tag">当前</span>' : `<button class="btn" data-use="${i}">换</button>`}
        </div>`;
      })
      .join('');
    box.querySelectorAll('[data-play]').forEach((b) => {
      b.onclick = () => {
        const c = list[Number(b.getAttribute('data-play'))];
        if (candAudio) candAudio.pause();
        candAudio = new Audio(c.preview);
        candAudio.play().catch(() => alert('这条没法试听（预览地址打不开）'));
      };
    });
    box.querySelectorAll('[data-use]').forEach((b) => {
      b.onclick = () => chooseCandidate(slot, list[Number(b.getAttribute('data-use'))]);
    });
  }
  sec.scrollIntoView({ block: 'nearest' });
}

async function chooseCandidate(slot, cand) {
  const hint = document.getElementById('candHint');
  if (!confirm(`把「${slot}」这一槽的素材换成「${cand.title}」？这一槽的所有音效都会换，并按新素材的峰位重新对齐。`)) return;
  await post('version/save', { tag: `换素材前-${slot}` });
  hint.textContent = '落定素材中…';
  const r = await post('sfx/choose', { slot, candId: cand.id });
  if (!r?.job) return;
  const j = await pollJob(r.job.id, renderJobs);
  if (!j || j.state !== 'done') { hint.textContent = '落定失败，见后台作业'; return; }
  hint.textContent = '重排音效计划中…';
  const p = await post('sfx/plan', {});
  await pollJob(p.job.id, renderJobs);
  engine.buffers.clear();
  await reload();
  hint.textContent = `已换成「${cand.title}」（换之前存了一个版本，可以回退）`;
  await openCandidates();
}

async function candJob(route, label) {
  if (!selected || selected.kind !== 'sfx') return;
  const slot = slotOf(selected.key);
  const hint = document.getElementById('candHint');
  hint.textContent = `${label}…`;
  const cur = (await (await fetch(`/api/sfx/candidates?film=${filmId}&slot=${encodeURIComponent(slot)}`)).json()).current;
  const r = await post(route, { slot, seedId: cur, first: 5 });
  if (r?.job) await pollJob(r.job.id, renderJobs);
  hint.textContent = r && r.ok === false ? `${label}失败：${r.error || ''}` : `${label}完成`;
  await openCandidates();
}

/* ──────────────────────────── 总线电平表 ──────────────────────────── */

let peakHold = { db: -Infinity, at: 0 };

function startBusMeter() {
  const cv = document.getElementById('busMeter');
  const g = cv.getContext('2d');
  const buf = new Float32Array(engine.analyser.fftSize);
  const X = (db) => Math.max(0, Math.min(1, (db + 60) / 60)) * cv.width;
  const tick = () => {
    engine.analyser.getFloatTimeDomainData(buf);
    let peak = 0, sum = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > peak) peak = a; sum += buf[i] * buf[i]; }
    const pk = 20 * Math.log10(Math.max(peak, 1e-6));
    const rms = 10 * Math.log10(Math.max(sum / buf.length, 1e-12));
    const now = performance.now();
    if (pk > peakHold.db || now - peakHold.at > 1500) peakHold = { db: pk, at: now };
    g.clearRect(0, 0, cv.width, cv.height);
    const grad = g.createLinearGradient(0, 0, cv.width, 0);
    grad.addColorStop(0, '#2DD4BF'); grad.addColorStop(0.8, '#FFB800'); grad.addColorStop(1, '#FF5A79');
    g.fillStyle = grad;
    g.globalAlpha = 0.45; g.fillRect(0, 4, X(pk), cv.height - 8);
    g.globalAlpha = 1; g.fillRect(0, 10, X(rms), cv.height - 20);
    g.fillStyle = '#fff'; g.fillRect(X(peakHold.db) - 1, 2, 2, cv.height - 4);
    document.getElementById('peakHold').textContent = isFinite(peakHold.db) && peakHold.db > -59 ? `峰值 ${peakHold.db.toFixed(1)} dB` : '峰值 —';
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ──────────────────────────── 顶栏状态 ──────────────────────────── */

function renderStatus() {
  const anchors = (S.truth.sync && S.truth.sync.anchors) || [];
  const locked = anchors.filter((a) => a.status === 'locked');
  const maxF = locked.length ? Math.max(...locked.map((a) => Math.round((Math.abs(a.errMs || 0) / 1000) * S.fps))) : 0;
  badge('syncBadge', anchors.length ? `对拍 ${locked.length}/${anchors.length}` : '对拍 未求解', anchors.length && locked.length === anchors.length ? 'ok' : anchors.length ? 'warn' : '');
  document.getElementById('syncBadge').title = anchors.length ? `${locked.length} 个拍点锁定，最大偏差 ${maxF} 帧（选中配乐段看明细）` : '还没对拍';
  const v = S.versionInfo || {};
  badge('verBadge', v.dirty ? '有未存的改动' : '已存', v.dirty ? 'warn' : 'ok');
  document.getElementById('verBadge').title = v.latest ? `上一版「${v.latest.tag}」` : '还没存过版本';
}

/** 上一个 / 下一个跳点：拍点 + 幕起点 */
function jumpMarker(dir) {
  const now = filmTimeNow();
  const pts = [
    ...S.hits.map((h) => (warp.identity ? h.sec : warp.toFilm(h.sec))),
    ...S.scenes.map((s) => (warp.identity ? s.start : warp.toFilm(s.start))),
    0,
  ].sort((a, b) => a - b);
  const t = dir < 0 ? [...pts].reverse().find((x) => x < now - 0.05) : pts.find((x) => x > now + 0.05);
  if (t !== undefined) seekTo(t);
}

function renderLanes() {
  const total = filmTotal();
  const host = document.getElementById('lanes');
  host.innerHTML = '';
  const { clips } = collectClips();

  for (const lane of visibleLanes()) {
    const row = document.createElement('div');
    row.className = 'lane-row';

    const meta = document.createElement('div');
    meta.className = 'lane-meta';
    const db = S.truth.mix.layers[lane] ?? 0;
    const muted = (S.truth.mix.muted || []).includes(lane);
    const count = clips.filter((c) => c.layer === lane).length;
    meta.innerHTML = `<span class="lane-name" style="color:var(--lane-${lane})">${LANE_LABEL[lane] || lane}</span><span class="lane-count" title="这一轨的片段数">${count}</span>`;

    const fader = document.createElement('input');
    fader.type = 'range';
    fader.className = 'lane-fader';
    fader.min = '-30'; fader.max = '6'; fader.step = '0.5'; fader.value = String(db);
    fader.title = `层音量 ${db} dB（双击回 0）`;
    // 层推子同样是「拖动预览、松手提交」（§18.3），拖的时候不写盘
    fader.oninput = () => {
      S.truth.mix.layers[lane] = Number(fader.value);
      applyLaneGains();
      fader.title = `${fader.value} dB`;
    };
    fader.onchange = async () => {
      S.truth.mix.layers[lane] = Number(fader.value);
      applyLaneGains();
      await post('mix', { layers: S.truth.mix.layers, muted: S.truth.mix.muted, master: S.truth.mix.master });
    };
    fader.ondblclick = async () => {
      fader.value = '0';
      S.truth.mix.layers[lane] = 0;
      applyLaneGains();
      fader.title = '0 dB';
      await post('mix', { layers: S.truth.mix.layers, muted: S.truth.mix.muted, master: S.truth.mix.master });
    };
    meta.appendChild(fader);

    const mBtn = document.createElement('div');
    mBtn.className = 'lane-btn' + (muted ? ' on-m' : '');
    mBtn.textContent = '静';
    mBtn.title = '静音（会进成片）';
    mBtn.onclick = async () => {
      const list = new Set(S.truth.mix.muted || []);
      list.has(lane) ? list.delete(lane) : list.add(lane);
      S.truth.mix.muted = [...list];
      applyLaneGains();
      renderLanes();
      await post('mix', { layers: S.truth.mix.layers, muted: S.truth.mix.muted, master: S.truth.mix.master });
    };
    meta.appendChild(mBtn);

    const sBtn = document.createElement('div');
    sBtn.className = 'lane-btn' + (engine.solo === lane ? ' on-s' : '');
    sBtn.textContent = '独';
    sBtn.title = '独奏（只在工作台里生效，不进成片）';
    sBtn.onclick = () => {
      engine.solo = engine.solo === lane ? null : lane;
      applyLaneGains();
      renderLanes();
    };
    meta.appendChild(sBtn);
    row.appendChild(meta);

    const track = document.createElement('div');
    track.className = 'lane-track';
    attachScrub(track);

    for (const clip of clips.filter((c) => c.layer === lane)) {
      const el = document.createElement('div');
      el.className = 'clip' + (selected && selected.key === clip.key ? ' sel' : '');
      el.style.left = `${(clip.startSec / total) * 100}%`;
      el.style.width = `${Math.max(0.6, (clip.durSec / total) * 100)}%`;
      el.style.setProperty('--clip-c', `var(--lane-${lane})`);
      el.title = `${clipLabel(clip)}\n${clipTitle(clip)}\n${clip.startSec.toFixed(3)}s 起 · ${clip.durSec.toFixed(3)}s`;
      // 太窄的片段只画波形，不塞字（字在悬停提示里）
      const px = (clip.durSec / total) * trackWidth();
      el.innerHTML = px >= 44 ? `<span>${clip.kind === 'cue' ? '♪ ' : clip.kind === 'vo' ? '🎙 ' : ''}${escapeHtml(clipLabel(clip))}</span>` : '';
      el.onclick = (ev) => {
        ev.stopPropagation();
        // 再点一次同一条：打开候选素材
        if (selected && selected.key === clip.key && clip.kind === 'sfx') return openCandidates();
        select(clip);
      };
      if (clip.kind === 'cue') attachCueEdgeDrag(el, clip, track, total);
      track.appendChild(el);
      drawWaveform(el, clip, lane, (clip.durSec / total) * trackWidth());
    }

    row.appendChild(track);
    host.appendChild(row);
  }
}

/**
 * 拖配乐段的边：7px 内吸附到拍点 / 小节头 / 场景 / 邻段 / 播放头；
 * 按住 ⌘ 关掉吸附；拖不过邻段。抬手后乐观更新，服务端拒绝时重载回滚。
 */
function attachCueEdgeDrag(el, clip, track, total) {
  const EDGE_PX = 8;
  el.addEventListener('mousedown', (ev) => {
    const rect = el.getBoundingClientRect();
    const nearLeft = ev.clientX - rect.left <= EDGE_PX;
    const nearRight = rect.right - ev.clientX <= EDGE_PX;
    if (!nearLeft && !nearRight) return;
    ev.preventDefault();
    ev.stopPropagation();

    const edge = nearLeft ? 'in' : 'out';
    const cues = [...S.truth.music.cues].sort((a, b) => a.in.sec - b.in.sec);
    const idx = cues.findIndex((c) => c.id === clip.cueId);
    const cue = cues[idx];
    const prev = cues[idx - 1];
    const next = cues[idx + 1];
    const pxPerSec = track.clientWidth / total;
    const origin = JSON.parse(JSON.stringify(S.truth.music));

    el.classList.add('dragging');
    const hint = document.createElement('div');
    hint.className = 'snap-hint';
    el.appendChild(hint);

    let finalSec = edge === 'in' ? cue.in.sec : cue.out.sec;

    const onMove = (m) => {
      const raw = ((m.clientX - track.getBoundingClientRect().left) / track.clientWidth) * total;
      const snapped = snapSec(raw, pxPerSec, cue.id, m.metaKey || m.ctrlKey);
      // 拖不过邻段，也不能把自己拖成负长度
      const lo = edge === 'in' ? (prev ? prev.in.sec + 0.2 : 0) : cue.in.sec + 0.2;
      const hi = edge === 'in' ? cue.out.sec - 0.2 : next ? next.out.sec - 0.2 : total;
      finalSec = Math.max(lo, Math.min(hi, snapped.sec));

      if (edge === 'in') {
        el.style.left = `${(finalSec / total) * 100}%`;
        el.style.width = `${Math.max(0.6, ((cue.out.sec - finalSec) / total) * 100)}%`;
      } else {
        el.style.width = `${Math.max(0.6, ((finalSec - cue.in.sec) / total) * 100)}%`;
      }
      hint.textContent = `${finalSec.toFixed(3)} 秒` + (snapped.snappedTo ? `  ← 吸到${snapped.snappedTo}` : '');
      hint.style.left = edge === 'in' ? '0' : 'auto';
      hint.style.right = edge === 'in' ? 'auto' : '0';
    };

    const onUp = async () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      el.classList.remove('dragging');
      hint.remove();

      pushUndo({ key: 'music', field: 'cueTable', prev: origin });
      // 乐观更新
      if (edge === 'in') cue.in.sec = finalSec;
      else cue.out.sec = finalSec;
      renderAll();

      const r = await post('music/cue', {
        op: 'move', cueId: cue.id, edge, newSec: finalSec,
      });
      if (r) S.truth.music = r.music;
      else await reload(); // 服务端拒绝 → 重载回滚
      renderAll();
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
}

function clipLabel(clip) {
  if (clip.kind === 'vo') {
    const l = (S.truth.voice?.lines || []).find((x) => x.id === clip.voId);
    return l ? l.text : clip.voId;
  }
  if (clip.kind === 'cue') {
    const c = S.truth.music.cues.find((x) => x.id === clip.cueId);
    return c ? c.label : clip.cueId;
  }
  const p = S.truth.plan.find((x) => x.key === clip.key);
  return p ? whatZh(p.what) : clip.key;
}

/** 音效计划里的动作类型代号 → 中文（「draw · x 轴」→「描线 · x 轴」） */
const KIND_LABEL = { draw: '描线', hero: '重拍', stamp: '盖章', morph: '形变', focus: '聚焦', reveal: '浮现', land: '落定', pop: '弹出', count: '计数' };
function whatZh(what) {
  return String(what).replace(/^(\w+) · /, (m, k) => (KIND_LABEL[k] ? KIND_LABEL[k] + ' · ' : m));
}

/** 片段用的素材名 */
function clipTitle(clip) {
  if (clip.kind === 'vo') return `口播 ${clip.voId}`;
  if (clip.kind === 'cue') {
    const c = S.truth.music.cues.find((x) => x.id === clip.cueId);
    return c && c.track ? `${c.track.title}${c.track.artist ? ' · ' + c.track.artist : ''}` : '未配曲';
  }
  const p = S.truth.plan.find((x) => x.key === clip.key);
  return p ? `${p.slot ?? ''} · ${p.title ?? p.file}` : clip.file;
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** 片段上画真实波形（峰值包络，轨道色），直接用已解码的 AudioBuffer；宽度按缩放后的像素算 */
async function drawWaveform(el, clip, lane, widthPx) {
  await ensureEngine();
  const buf = await loadBuffer(engine.ctx, clip.file);
  if (!buf) return;
  const canvas = document.createElement('canvas');
  const w = Math.max(8, Math.min(8000, Math.round(widthPx || 40)));
  canvas.width = w * 2;
  canvas.height = 60;
  const g = canvas.getContext('2d');
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(`--lane-${lane}`).trim() || '#fff';
  g.globalAlpha = 0.75;
  const data = buf.getChannelData(0);
  const from = Math.floor(clip.offsetInFile * buf.sampleRate);
  const len = Math.min(data.length - from, Math.floor(clip.durSec * buf.sampleRate));
  if (len <= 0) return;
  const per = Math.max(1, Math.floor(len / canvas.width));
  for (let x = 0; x < canvas.width; x++) {
    let peak = 0;
    const s0 = from + x * per;
    for (let i = s0; i < s0 + per && i < from + len; i++) peak = Math.max(peak, Math.abs(data[i]));
    const h = peak * canvas.height;
    g.fillRect(x, (canvas.height - h) / 2, 1, Math.max(1, h));
  }
  el.appendChild(canvas);
}

function renderInspector() {
  const kind = selected ? selected.kind : 'none';
  document.getElementById('ctxNone').hidden = kind !== 'none';
  document.getElementById('ctxSfx').hidden = kind !== 'sfx';
  document.getElementById('ctxVo').hidden = kind !== 'vo';
  document.getElementById('ctxCue').hidden = kind !== 'cue';
  if (kind !== 'sfx') document.getElementById('candSec').hidden = true;

  if (kind === 'none') {
    renderSummary();
    return;
  }

  if (kind === 'vo') {
    // 口播句：只读；改词或改时间编辑 audio/voice.json 后跑 vw voice film
    const l = (S.truth.voice?.lines || []).find((x) => x.id === selected.voId);
    if (!l) return;
    document.getElementById('voTitle').textContent = `口播 ${l.id}`;
    document.getElementById('voText').textContent = l.text;
    document.getElementById('voFrom').textContent = `${l.sec.toFixed(2)} 秒`;
    document.getElementById('voDur').textContent = `${(l.durSec ?? 0).toFixed(2)} 秒`;
    document.getElementById('voCheck').textContent = `${l.checked ? '✓ 转写核对通过' : '⚠ 转写核对没通过'} · 改词改时间：编辑 voice.json 后跑 vw voice film`;
    return;
  }

  if (kind === 'cue') {
    const c = S.truth.music.cues.find((x) => x.id === selected.cueId);
    if (!c) return;
    document.getElementById('cueId').textContent = c.label || c.id;
    const t = c.track;
    document.getElementById('cueTrackLine').textContent = t
      ? [t.title, t.bpm ? `每分钟 ${Math.round(t.bpm)} 拍` : '', t.key ? `调 ${t.key}` : ''].filter(Boolean).join(' · ')
      : '还没配曲';
    document.getElementById('cueRange').textContent = `${c.in.sec.toFixed(2)} – ${c.out.sec.toFixed(2)} 秒`;
    const vol = document.getElementById('cueVol');
    vol.value = String(c.volume);
    document.getElementById('cueVolTxt').textContent = `${(20 * Math.log10(Math.max(c.volume, 1e-6))).toFixed(1)} dB`;
    document.getElementById('cueJoin').value = (c.join && c.join.kind) || 'cut';
    return;
  }

  const p = S.truth.plan.find((x) => x.key === selected.key);
  if (!p) return;
  document.getElementById('clipKey').textContent = whatZh(p.what || p.key);
  document.getElementById('clipTitle').textContent = `${p.title ?? p.file}`;
  document.getElementById('clipTitle').title = `${p.slot ?? ''} · ${p.title ?? p.file}`;
  document.getElementById('clipFrom').textContent = `${p.fromSec.toFixed(2)} 秒`;
  const off = S.truth.offsets[p.key] ?? 0;
  document.getElementById('clipOffset').textContent = `${off >= 0 ? '+' : ''}${off.toFixed(3)} 秒`;
  const gain = S.truth.gains[p.key] ?? 0;
  document.getElementById('clipGain').value = String(gain);
  document.getElementById('clipGainTxt').textContent = `${gain.toFixed(1)} dB`;
  const fi = S.truth.fades.in[p.key] ?? p.fadeSec;
  const fo = S.truth.fades.out[p.key] ?? p.fadeSec;
  document.getElementById('clipFadeIn').value = String(fi);
  document.getElementById('clipFadeInTxt').textContent = `${fi.toFixed(2)} 秒`;
  document.getElementById('clipFadeOut').value = String(fo);
  document.getElementById('clipFadeOutTxt').textContent = `${fo.toFixed(2)} 秒`;
}

/** 没选中时：这部片的三个数 */
function renderSummary() {
  const total = filmTotal();
  const anchors = (S.truth.sync && S.truth.sync.anchors) || [];
  const locked = anchors.filter((a) => a.status === 'locked').length;
  const sfx = S.truth.plan.length;
  document.getElementById('filmSummary').innerHTML = [
    [`${total.toFixed(1)}`, '秒'],
    [`${sfx}`, '条音效'],
    [anchors.length ? `${locked}/${anchors.length}` : '—', '拍点锁定'],
  ].map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join('');
}

function renderSyncReport() {
  const sync = S.truth.sync || {};
  const rep = sync.report || {};
  document.getElementById('scoreSync').textContent = rep.scoreSync ?? '—';
  const nA = (sync.anchors || []).length;
  document.getElementById('anchorStat').textContent = nA ? `${rep.lockedCount ?? 0}/${nA} 锁定` : '未求解';
  const list = document.getElementById('anchorList');
  list.innerHTML = '';
  for (const a of sync.anchors || []) {
    const d = document.createElement('div');
    d.className = 'item';
    const mark = a.status === 'locked' ? '✓' : a.status === 'downgraded' ? '△' : '✗';
    d.textContent = `${mark} ${a.note || a.hit} · 差 ${a.errMs} 毫秒`;
    d.title = `${PRIORITY_LABEL[a.priority] || a.priority}拍点 ${a.hit}：画面 ${a.targetSec.toFixed(2)} 秒 → 配乐 ${a.musicSec.toFixed(2)} 秒`;
    list.appendChild(d);
  }
}

function renderInbox() {
  const list = document.getElementById('inboxList');
  const pending = (S.inbox || []).filter((x) => x.status === 'pending').length;
  document.getElementById('inboxCount').textContent = pending ? `${pending} 条待处理` : '';
  list.innerHTML = '';
  for (const it of S.inbox || []) {
    const d = document.createElement('div');
    d.className = 'item';
    d.textContent = `[${{ pending: '待处理', resolved: '已处理', wontfix: '不改' }[it.status] || it.status}] ${it.filmSec.toFixed(2)} 秒：${it.instruction}`;
    list.appendChild(d);
  }
}

function renderAll() {
  applyZoom();
  renderStatus();
  renderRuler();
  renderLanes();
  renderInspector();
  renderSyncReport();
  renderInbox();
  drawPlayhead(filmTimeNow());
  showTimecode(filmTimeNow());
}

/* ──────────────────────────────── 交互 ────────────────────────────────── */

function select(clip) {
  selected = clip.kind === 'cue' ? { kind: 'cue', key: clip.key, cueId: clip.cueId }
    : clip.kind === 'vo' ? { kind: 'vo', key: clip.key, voId: clip.voId }
    : { kind: 'sfx', key: clip.key };
  renderLanes();
  renderInspector();
}

/** 时间码：分:秒.百分秒 / 总长 · 第几帧（按片子的帧率） */
function showTimecode(filmSec) {
  const frame = Math.round(filmSec * S.fps);
  document.getElementById('timecode').textContent = `${fmt(filmSec)} / ${fmt(filmTotal())} · 第 ${frame} 帧`;
}

function seekTo(filmSec) {
  const v = video();
  if (!v) return;
  // 吸到整帧：拖到哪一帧就看哪一帧
  filmSec = Math.max(0, Math.min(filmTotal(), Math.round(filmSec * S.fps) / S.fps));
  v.currentTime = videoClock === 'film' || warp.identity ? filmSec : warp.toScore(filmSec);
  drawPlayhead(filmSec);
  showTimecode(filmSec);
  if (engine.playing) scheduleFrom(filmSec);
}

/**
 * 拖播放头：在标尺或轨道空白处按下拖动，画面跟着走到那一帧（播放中先暂停）。
 * 缩放后拖到可见区边缘，时间轴自动往那边滚。
 */
function attachScrub(el) {
  el.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    if (el.classList.contains('lane-track') && ev.target !== el) return; // 轨道上点到片段时交给片段
    ev.preventDefault();
    const v = video();
    if (v && !v.paused) v.pause();
    const tl = document.getElementById('timeline');
    let raf = 0;
    let lastX = ev.clientX;
    const secAt = (clientX) => {
      const r = el.getBoundingClientRect();
      return ((clientX - r.left) / r.width) * filmTotal();
    };
    const apply = () => {
      raf = 0;
      // 贴边自动滚动
      const tr = tl.getBoundingClientRect();
      if (zoom > 1) {
        if (lastX > tr.right - 30) tl.scrollLeft += 18;
        else if (lastX < tr.left + 160 + 30) tl.scrollLeft -= 18;
      }
      seekTo(secAt(lastX));
    };
    const onMove = (m) => {
      lastX = m.clientX;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('scrubbing');
    };
    document.body.classList.add('scrubbing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    seekTo(secAt(ev.clientX));
  });
}

/** 逐帧 / 逐秒步进 */
function stepFrames(n) {
  const v = video();
  if (v && !v.paused) v.pause();
  seekTo(filmTimeNow() + n / S.fps);
}

async function nudge(frames) {
  if (!selected || selected.kind !== 'sfx') return;
  const key = selected.key;
  const prev = S.truth.offsets[key] ?? 0;
  const next = Math.round((prev + frames / S.fps) * 10000) / 10000;
  pushUndo({ key, field: 'offset', prev });
  S.truth.offsets[key] = next;
  renderLanes();
  renderInspector();
  await post('offset', { key, offsetSec: next });
  if (engine.playing) scheduleFrom(filmTimeNow());
}

function bindEvents() {
  document.getElementById('playBtn').onclick = togglePlay;
  document.getElementById('measureBtn').onclick = measureLoudness;
  document.getElementById('undoBtn').onclick = undo;
  document.getElementById('undoTopBtn').onclick = undo;
  document.getElementById('redoBtn').onclick = redo;
  document.getElementById('prevBtn').onclick = () => jumpMarker(-1);
  document.getElementById('nextBtn').onclick = () => jumpMarker(1);
  document.getElementById('candBtn').onclick = openCandidates;
  attachScrub(document.getElementById('ruler'));
  document.getElementById('candSimilarBtn').onclick = () => candJob('similar', '找相似');
  document.getElementById('candMoreBtn').onclick = () => candJob('more', '再搜一批');

  // 缩放：滑块、适配、⌘ + 滚轮（以鼠标所在时刻为中心）
  document.getElementById('zoomRange').oninput = (e) => setZoom(Number(e.target.value));
  document.getElementById('fitBtn').onclick = () => setZoom(1, 0);
  const tl = document.getElementById('timeline');
  tl.addEventListener('wheel', (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    const rect = tl.getBoundingClientRect();
    const x = e.clientX - rect.left - 160 + tl.scrollLeft;
    const at = Math.max(0, (x / trackWidth()) * filmTotal());
    setZoom(zoom * (e.deltaY < 0 ? 1.25 : 0.8), at);
  }, { passive: false });
  window.addEventListener('resize', () => { applyZoom(); renderRuler(); renderLanes(); });

  // 倍速试听
  document.getElementById('speedSel').onchange = (e) => {
    engine.speed = Number(e.target.value);
    const v = video();
    if (v) v.playbackRate = engine.speed;
    if (engine.playing) scheduleFrom(filmTimeNow());
  };

  // 总线推子：拖动预览、松手写进 mix.json，双击回 0
  const mf = document.getElementById('masterFader');
  const showMaster = () => { document.getElementById('masterTxt').textContent = `${Number(S.truth.mix.master ?? 0).toFixed(1)} dB`; };
  mf.value = String(S.truth.mix.master ?? 0);
  showMaster();
  mf.oninput = () => { S.truth.mix.master = Number(mf.value); applyLaneGains(); showMaster(); };
  const commitMaster = () => post('mix', { layers: S.truth.mix.layers, muted: S.truth.mix.muted, master: S.truth.mix.master });
  mf.onchange = commitMaster;
  mf.ondblclick = () => { mf.value = '0'; S.truth.mix.master = 0; applyLaneGains(); showMaster(); commitMaster(); };

  /**
   * 参数行的交互（§18.3）：拖动只做本地预览，松手才提交，双击回缺省值。
   *
   * 之前绑的是 oninput —— 拖一次就往服务端打几十个写请求，
   * 每个都要重写真值 JSON。预览靠本地状态就够了，提交一次就行。
   */
  function bindParamSlider(id, opts) {
    const el = document.getElementById(id);
    const preview = (v) => {
      opts.apply(v);
      if (engine.playing) scheduleFrom(filmTimeNow());
    };
    el.oninput = (e) => {
      if (!opts.enabled()) return;
      preview(Number(e.target.value));
    };
    el.onchange = async (e) => {
      if (!opts.enabled()) return;
      const v = Number(e.target.value);
      opts.beforeCommit?.(v);
      preview(v);
      await opts.commit(v);
    };
    // 双击回缺省
    el.ondblclick = async () => {
      if (!opts.enabled()) return;
      el.value = String(opts.defaultValue);
      opts.beforeCommit?.(opts.defaultValue);
      preview(opts.defaultValue);
      await opts.commit(opts.defaultValue);
    };
  }

  bindParamSlider('clipGain', {
    enabled: () => selected && selected.kind === 'sfx',
    defaultValue: 0,
    beforeCommit: () => pushUndo({ key: selected.key, field: 'gain', prev: S.truth.gains[selected.key] ?? 0 }),
    apply: (db) => {
      S.truth.gains[selected.key] = db;
      document.getElementById('clipGainTxt').textContent = `${db.toFixed(1)} dB`;
    },
    commit: (db) => post('gain', { key: selected.key, gainDb: db }),
  });

  for (const [id, dir, txtId] of [
    ['clipFadeIn', 'in', 'clipFadeInTxt'],
    ['clipFadeOut', 'out', 'clipFadeOutTxt'],
  ]) {
    bindParamSlider(id, {
      enabled: () => selected && selected.kind === 'sfx',
      defaultValue: 0,
      apply: (sec) => {
        S.truth.fades[dir][selected.key] = sec;
        document.getElementById(txtId).textContent = `${sec.toFixed(2)} 秒`;
      },
      commit: (sec) => post('fade', { key: selected.key, direction: dir, fadeSec: sec }),
    });
  }

  document.getElementById('duckBtn').onclick = async () => {
    if (!selected || selected.kind !== 'sfx') return;
    const spec = { db: -5, preSec: 0.2, holdSec: 1.1, releaseSec: 0.8, layers: ['MUSIC'] };
    S.truth.ducks[selected.key] = spec;
    await post('duck', { key: selected.key, ...spec });
    renderAll();
    if (engine.playing) scheduleFrom(filmTimeNow());
  };

  bindParamSlider('cueVol', {
    enabled: () => selected && selected.kind === 'cue',
    defaultValue: 0.65,
    apply: (v) => {
      const c = S.truth.music.cues.find((x) => x.id === selected.cueId);
      if (!c) return;
      c.volume = v;
      document.getElementById('cueVolTxt').textContent = `${(20 * Math.log10(Math.max(v, 1e-6))).toFixed(1)} dB`;
    },
    commit: (v) => post('music/cfg', { cueId: selected.cueId, volume: v }),
  });

  document.getElementById('cueJoin').onchange = async (e) => {
    if (!selected || selected.kind !== 'cue') return;
    pushUndo({ key: 'music', field: 'cueTable', prev: JSON.parse(JSON.stringify(S.truth.music)) });
    const r = await post('music/cue', { op: 'join', cueId: selected.cueId, joinKind: e.target.value });
    if (r) { S.truth.music = r.music; renderAll(); }
  };

  document.getElementById('splitBtn').onclick = async () => {
    if (!selected || selected.kind !== 'cue') return;
    pushUndo({ key: 'music', field: 'cueTable', prev: JSON.parse(JSON.stringify(S.truth.music)) });
    const r = await post('music/cue', { op: 'split', cueId: selected.cueId, atSec: filmTimeNow() });
    if (r) { S.truth.music = r.music; renderAll(); }
  };

  document.getElementById('solveBtn').onclick = async () => {
    const r = await post('sync/solve', {});
    if (r) { await reload(); alert(`对拍完成：得分 ${r.report.scoreSync}（网格来自${r.report.gridSource === 'measured' ? '实测' : '推算'}）`); }
  };

  document.getElementById('abBtn').onclick = async () => {
    abMode = abMode === 'mix' ? 'identity' : 'mix';
    const btn = document.getElementById('abBtn');
    btn.textContent = abMode === 'identity' ? '对比：不拉伸' : '对比试听';
    btn.classList.toggle('on', abMode === 'identity');
    renderAll();
    if (engine.playing) scheduleFrom(filmTimeNow());
  };

  document.getElementById('clearSyncBtn').onclick = async () => {
    if (!confirm('取消对拍拉伸？画面和声音都回到乐谱时间（sync.json 清成恒等映射）。')) return;
    await post('sync/clear', {});
    await reload();
  };

  document.getElementById('syncChoreoBtn').onclick = async () => {
    const btn = document.getElementById('syncChoreoBtn');
    btn.disabled = true;
    btn.textContent = '同步中…';
    // 后端把它丢给子进程（§18.1 第 ③ 级），这里轮询进度 —— 服务不会被这几分钟卡住
    const r = await post('sync-choreo', {});
    if (!r?.job) { btn.disabled = false; btn.textContent = '同步编舞'; return; }
    await pollJob(r.job.id, (j) => {
      btn.textContent = j.progress ? `同步中…${j.progress.slice(0, 18)}` : '同步中…';
    });
    await reload();
    btn.disabled = false;
    btn.textContent = '同步编舞';
  };

  document.getElementById('saveVerBtn').onclick = async () => {
    const tag = prompt('给这个版本起个名字', '工作台') || '工作台';
    const r = await post('version/save', { tag });
    if (r) { await reload(); alert(`已存版本「${tag}」`); }
  };

  document.getElementById('inboxBtn').onclick = async () => {
    const text = document.getElementById('inboxText').value.trim();
    if (!text) return;
    await post('inbox', {
      instruction: text,
      filmSec: filmTimeNow(),
      targetType: selected ? (selected.kind === 'cue' ? 'audio' : 'audio') : 'global',
      audio: selected && selected.kind === 'sfx' ? { layer: laneOf(selected.key), itemKey: selected.key } : undefined,
    });
    document.getElementById('inboxText').value = '';
    await reload();
  };

  document.getElementById('filmSelect').onchange = (e) => {
    location.search = `?film=${e.target.value}`;
  };

  const v = video();
  v.addEventListener('playing', onPlaying);
  v.addEventListener('pause', onPause);
  v.addEventListener('timeupdate', onTimeUpdate);
  v.addEventListener('loadedmetadata', detectVideoClock);
  v.addEventListener('click', onVideoClick);

  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === ',') nudge(-1);
    else if (e.key === '.') nudge(1);
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrames(e.shiftKey ? -S.fps : -1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrames(e.shiftKey ? S.fps : 1); }
    else if (e.key === '[') jumpMarker(-1);
    else if (e.key === ']') jumpMarker(1);
    else if (e.key === 'Escape') { selected = null; renderLanes(); renderInspector(); }
    else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      document.getElementById('splitBtn').click();
    }
  });
}

function laneOf(key) {
  const p = S.truth.plan.find((x) => x.key === key);
  return p ? p.layer : 'UI';
}

async function onVideoClick(ev) {
  const v = video();
  const rect = v.getBoundingClientRect();
  const nx = (ev.clientX - rect.left) / rect.width;
  const ny = (ev.clientY - rect.top) / rect.height;

  const rip = document.createElement('div');
  rip.className = 'ripple';
  rip.style.left = `${ev.clientX - rect.left - 9}px`;
  rip.style.top = `${ev.clientY - rect.top - 9}px`;
  document.getElementById('viewport').appendChild(rip);
  setTimeout(() => rip.remove(), 600);

  const filmSec = filmTimeNow();
  const scoreSec = warp.identity ? filmSec : warp.toScore(filmSec);
  const scene = [...S.scenes].reverse().find((s) => scoreSec >= s.start) || S.scenes[0];
  const text = prompt(`在 ${filmSec.toFixed(2)} 秒（${scene.label || scene.id}）写一句批注：`);
  if (!text) return;
  await post('inbox', {
    instruction: text,
    filmSec,
    targetType: 'visual',
    visual: {
      sceneId: scene.id,
      sceneFile: `src/films/${filmId}/scenes/Scenes.tsx`,
      sceneLocalSec: Math.round((scoreSec - scene.start) * 1000) / 1000,
      boxNormalized: [Math.max(0, nx - 0.05), Math.max(0, ny - 0.05), 0.1, 0.1],
    },
  });
  await reload();
}

/** 轮询一个子进程作业直到结束；每次状态变化回调一次 */
async function pollJob(id, onTick) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 1200));
    let j;
    try {
      j = (await (await fetch(`/api/job/${id}`)).json())?.job;
    } catch (_) {
      continue; // 网络抖一下不算失败
    }
    if (!j) return null;
    onTick?.(j);
    if (j.state !== 'running') {
      if (j.state === 'failed') {
        alert(`后台作业失败（退出码 ${j.exitCode}）：\n` + j.tail.slice(-8).join('\n'));
      }
      return j;
    }
  }
}

/* ──────────────────────────── 曲库与改编 ──────────────────────────────── */

let musicCands = [];
let selectedCandId = null;

/* ── 段落偏好（§18.3）：在原曲波形上拖选，吸附到小节头 ── */
let prefSource = null; // { durationSec, downbeats, sections, peaks, dropSec }
let prefRegions = []; // [{ fromSec, toSec, preference: 'more' | 'less' }]
let prefDrag = null; // { a, b } 拖选中的两端（秒）

const SECTION_TINT = {
  intro: 'rgba(255,255,255,0.05)', verse: 'rgba(255,255,255,0.03)', build: 'rgba(255,184,0,0.08)',
  drop: 'rgba(255,90,121,0.16)', bridge: 'rgba(45,212,191,0.06)', outro: 'rgba(255,255,255,0.08)',
};

/** 吸附到最近的小节头 —— 改编接口按小节剪，偏好区卡在小节线上才有意义 */
function snapToBar(sec) {
  const d = (prefSource && prefSource.downbeats) || [];
  if (!d.length) return sec;
  let best = d[0];
  for (const x of d) if (Math.abs(x - sec) < Math.abs(best - sec)) best = x;
  return best;
}

/**
 * drop 段和尾奏不许设成「少用」（§18.3）。
 * 后端命令行也会再查一遍，这里先拦，给出即时提示。
 */
function guardedHit(from, to) {
  if (!prefSource) return null;
  const zones = (prefSource.sections || []).filter((x) => x.kind === 'drop' || x.kind === 'outro');
  // 和后端 validatePreferences 同一口径：drop 不在段落边界上时也要保护 drop 点起 4 小节
  // 放在最前面：同时压到 drop 和尾奏时，先告诉人更要紧的那个
  if (prefSource.dropSec > 0 && prefSource.barSec > 0) {
    zones.unshift({
      kind: 'drop',
      startSec: prefSource.dropSec,
      endSec: Math.min(prefSource.durationSec, prefSource.dropSec + 4 * prefSource.barSec),
    });
  }
  return zones.find((x) => from < x.endSec && to > x.startSec);
}

function drawPrefs() {
  const cv = document.getElementById('prefCanvas');
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  // 画自己的底色，不靠页面背景 —— 否则导出 / 截图时透明底上白色波形全看不见
  g.fillStyle = '#0B0D12';
  g.fillRect(0, 0, W, H);
  if (!prefSource) {
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.font = '22px sans-serif';
    g.fillText('先选曲，再点「载入原曲」', 16, H / 2 + 8);
    return;
  }
  const dur = prefSource.durationSec || 1;
  const X = (sec) => (sec / dur) * W;

  // 段落底色 + 名称
  for (const sec of prefSource.sections || []) {
    g.fillStyle = SECTION_TINT[sec.kind] || 'transparent';
    g.fillRect(X(sec.startSec), 0, X(sec.endSec) - X(sec.startSec), H);
    // 段太窄就不写名字，否则相邻的名字挤成一团
    if (X(sec.endSec) - X(sec.startSec) > 64) {
      g.fillStyle = sec.kind === 'drop' ? '#FF859D' : 'rgba(255,255,255,0.45)';
      g.font = '18px sans-serif';
      g.fillText(SECTION_LABEL[sec.kind] || sec.kind, X(sec.startSec) + 4, 20);
    }
  }
  // 波形
  const p = prefSource.peaks || [];
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < p.length; i++) {
    const x = (i / p.length) * W;
    const h = p[i] * (H - 30);
    g.fillRect(x, (H + 24) / 2 - h / 2, Math.max(1, W / p.length), h);
  }
  // drop 点及其保护区（drop 点起 4 小节，和后端同口径）
  if (prefSource.dropSec > 0) {
    const a = X(prefSource.dropSec), b = X(Math.min(dur, prefSource.dropSec + 4 * prefSource.barSec));
    g.fillStyle = 'rgba(255,90,121,0.18)';
    g.fillRect(a, 0, b - a, H);
    g.fillStyle = '#FF5A79';
    g.fillRect(a, 0, 2, H);
    g.font = '18px sans-serif';
    g.fillText('高潮', a + 5, H - 12);
  }
  // 小节头
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (const d of prefSource.downbeats || []) g.fillRect(X(d), H - 8, 1, 8);
  // 已设的偏好区
  for (const r of prefRegions) {
    g.fillStyle = r.preference === 'more' ? 'rgba(45,212,191,0.32)' : 'rgba(120,120,130,0.45)';
    g.fillRect(X(r.fromSec), 26, X(r.toSec) - X(r.fromSec), H - 34);
  }
  // 拖选中
  if (prefDrag) {
    const a = Math.min(prefDrag.a, prefDrag.b), b = Math.max(prefDrag.a, prefDrag.b);
    g.strokeStyle = '#FFB800';
    g.lineWidth = 2;
    g.strokeRect(X(a), 26, X(b) - X(a), H - 34);
  }
}

function bindPrefCanvas() {
  const cv = document.getElementById('prefCanvas');
  const hint = document.getElementById('prefHint');
  const secAt = (ev) => {
    const r = cv.getBoundingClientRect();
    return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * ((prefSource && prefSource.durationSec) || 0);
  };

  cv.onmousedown = (ev) => {
    if (!prefSource) return;
    const t = secAt(ev);
    // 点在已有的段上 = 删除它
    const idx = prefRegions.findIndex((r) => t >= r.fromSec && t <= r.toSec);
    if (idx >= 0) {
      prefRegions.splice(idx, 1);
      saveCueMemory();
      drawPrefs();
      return;
    }
    prefDrag = { a: snapToBar(t), b: snapToBar(t) };
    drawPrefs();
  };
  cv.onmousemove = (ev) => {
    if (!prefDrag) return;
    prefDrag.b = snapToBar(secAt(ev));
    drawPrefs();
  };
  window.addEventListener('mouseup', () => {
    if (!prefDrag) return;
    const from = Math.min(prefDrag.a, prefDrag.b), to = Math.max(prefDrag.a, prefDrag.b);
    prefDrag = null;
    if (to - from < 0.05) return drawPrefs(); // 没拖开，当作误点
    const preference = document.getElementById('prefMode').value;
    const bad = preference === 'less' && guardedHit(from, to);
    if (bad) {
      hint.textContent = `不能把${bad.kind === 'drop' ? '高潮段' : '尾奏'}（${bad.startSec.toFixed(1)}–${bad.endSec.toFixed(1)} 秒）设成少用`;
      return drawPrefs();
    }
    prefRegions.push({ fromSec: from, toSec: to, preference });
    prefRegions.sort((x, y) => x.fromSec - y.fromSec);
    hint.textContent = `${prefRegions.length} 段偏好（改编时一起提交）`;
    saveCueMemory();
    drawPrefs();
  });

  document.getElementById('prefClearBtn').onclick = () => {
    prefRegions = [];
    saveCueMemory();
    drawPrefs();
  };

  document.getElementById('prefLoadBtn').onclick = async () => {
    const track = selectedCandId || '';
    hint.textContent = '分析原曲中…';
    try {
      const res = await fetch(`/api/music/source?film=${filmId}&cue=${currentCueId()}&track=${encodeURIComponent(track)}`);
      const j = await res.json();
      if (!res.ok) {
        hint.textContent = j.error || '载入失败';
        return;
      }
      prefSource = j;
      hint.textContent = `原曲 ${j.durationSec.toFixed(1)} 秒 · 每分钟 ${j.bpm} 拍 · ${j.sections.length} 段 · 高潮在 ${j.dropSec.toFixed(1)} 秒`;
      drawPrefs();
    } catch (e) {
      hint.textContent = '载入失败：' + e.message;
    }
  };
  drawPrefs();
}

/**
 * 本地记忆（§18.3）：高潮落点、第二高潮、各项开关，按「片 : 段」记。
 * 只是输入习惯，不是真值 —— 真值永远在 music.json 里，
 * 所以放 localStorage，换台机器从头填也不影响成片。
 */
const memKey = (cue) => `vw:music:${filmId}:${cue}`;

function loadCueMemory() {
  const cue = currentCueId();
  let m = {};
  try {
    m = JSON.parse(localStorage.getItem(memKey(cue)) || '{}');
  } catch (_) {
    m = {};
  }
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v !== undefined && v !== null) {
      if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = v;
    }
  };
  set('adaptDrop', m.dropAtSec);
  set('adaptDrop2', m.drop2AtSec);
  set('optGridFit', m.gridFit !== undefined ? m.gridFit : true);
  set('optContinuity', m.continuity);
  set('optAutoPrepare', m.autoPrepare);
  set('optLimit', m.limit || 12);
  if (m.pool) document.getElementById('adaptPool').value = String(m.pool);
  prefRegions = Array.isArray(m.prefs) ? m.prefs : [];
  drawPrefs();
}

function saveCueMemory() {
  const num = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  };
  const on = (id) => document.getElementById(id).checked;
  try {
    localStorage.setItem(
      memKey(currentCueId()),
      JSON.stringify({
        dropAtSec: num('adaptDrop'),
        drop2AtSec: num('adaptDrop2'),
        gridFit: on('optGridFit'),
        continuity: on('optContinuity'),
        autoPrepare: on('optAutoPrepare'),
        limit: num('optLimit'),
        pool: Number(document.getElementById('adaptPool').value),
        prefs: prefRegions,
      })
    );
  } catch (_) {
    /* 隐私模式下写不了，忽略 */
  }
}

/**
 * 当前配乐段：时间轴上选中了某个 cue 片段就用它，否则落到第一段。
 * selected 的形状是 { kind, key, cueId… }（见 buildClips）。
 */
function currentCueId() {
  if (selected && selected.kind === 'cue' && selected.cueId) return selected.cueId;
  const cues = (S.truth && S.truth.music && S.truth.music.cues) || [];
  return (cues[0] && cues[0].id) || 'c1';
}

function renderMusicCands() {
  const box = document.getElementById('musicCands');
  if (!musicCands.length) {
    box.innerHTML = '<div class="hint">还没有候选，点「搜」或「找相似」。</div>';
    return;
  }
  box.innerHTML = musicCands
    .map((c, i) => {
      const on = c.id === selectedCandId ? ' style="color:var(--gold)"' : '';
      const bits = [c.artist, c.bpm ? '每分钟 ' + c.bpm + ' 拍' : '', Math.round(c.durationSec) + ' 秒',
        c.mscore != null ? '匹配 ' + c.mscore : ''].filter(Boolean).join(' · ');
      return `<div class="item pick" data-cand="${c.id}"${on}>[${i}] ${c.title}<br><span class="hint">${bits}</span></div>`;
    })
    .join('');
  box.querySelectorAll('[data-cand]').forEach((el) => {
    el.onclick = () => {
      selectedCandId = el.getAttribute('data-cand');
      renderMusicCands();
    };
  });
}

/** 曲库总览：读盘，不调接口 */
async function reloadLibrary() {
  let lib;
  try {
    lib = await (await fetch(`/api/music/library?film=${filmId}`)).json();
  } catch (_) {
    return;
  }
  const cueId = currentCueId();
  const row = (lib.cues || []).find((c) => c.id === cueId);
  const t = row && row.track;
  document.getElementById('adaptTrack').title = t ? t.title : '';
  document.getElementById('adaptTrack').textContent = t
    ? `${t.title}${t.artist ? ' · ' + t.artist : ''} · 每分钟 ${t.bpm} 拍${t.key ? ' · 调 ' + t.key : ''}${t.adapted ? ' · 已改编' : ''}`
    : '未绑定';

  const p = row && row.prepared;
  document.getElementById('adaptPrepared').textContent = p
    ? `有（高潮实测 ${Number(p.actualDropSec).toFixed(2)} 秒，试算对拍得分 ${p.dryScoreSync}）`
    : '无';

  const rl = document.getElementById('recipeList');
  const recipes = (row && row.recipes) || [];
  rl.innerHTML = recipes.length
    ? recipes
        .map((r) => `<div class="item pick" data-recipe="${r.recipe}">配方 ${r.recipe} <span class="hint">得分 ${r.score != null ? r.score : '—'} · 点这里换用</span></div>`)
        .join('')
    : '<div class="hint">还没有比选出来的版本。选「比选 3 / 6 个配方」改编一次，就会留下每个配方的版本。</div>';
  rl.querySelectorAll('[data-recipe]').forEach((el) => {
    el.onclick = async () => {
      const recipe = el.getAttribute('data-recipe');
      if (!confirm(`把本段换成配方 ${recipe} 这一版？`)) return;
      const { job } = await post('music/choose', { cue: currentCueId(), recipe });
      await pollJob(job.id, renderJobs);
      await reload();
      await reloadLibrary();
    };
  });
}

/** 作业名（命令代号）→ 中文 */
function jobLabel(label) {
  const [kind, , arg] = String(label).split(':');
  const NAME = {
    'sfx-pick': '落定音效', 'sfx-plan': '重排音效计划', 'sfx-more': '再搜一批音效', 'music-search': '检索配乐', 'music-similar': '找相似配乐',
    'music-pick': '选定配乐', 'music-adapt': '改编配乐', 'music-prepare': '预改编', 'music-full': '用原曲整首', 'music-choose': '换配方', 'sync-choreo': '同步编舞',
  };
  return `${NAME[kind] || kind}${arg ? ' · ' + arg : ''}`;
}

/** 后台作业与预改编队列 */
async function renderJobs() {
  let data;
  try {
    data = await (await fetch('/api/jobs')).json();
  } catch (_) {
    return;
  }
  const q = data.queue || { running: 0, waiting: 0 };
  const head = `<div class="hint">预改编队列：在跑 ${q.running} / 等待 ${q.waiting}（上限 2）</div>`;
  const rows = (data.jobs || [])
    .slice(0, 8)
    .map((j) => {
      const mark = j.state === 'running' ? '▶ 进行中' : j.state === 'done' ? '✓ 完成' : '✗ 失败';
      return `<div class="item">${mark} · ${jobLabel(j.label)}<br><span class="hint">${j.progress || ''}</span></div>`;
    })
    .join('');
  const jobs = data.jobs || [];
  const running = jobs.filter((j) => j.state === 'running').length;
  document.getElementById('jobsSec').hidden = !jobs.length;
  document.getElementById('jobCount').textContent = running ? `${running} 个在跑` : '';
  document.getElementById('jobList').innerHTML = (q.running || q.waiting ? head : '') + rows;
}

function bindMusicEvents() {
  /**
   * 检索与相似都走子进程作业：MCP 客户端是同步 curl，
   * 直接在后端里调会把整个服务阻塞十几秒。
   */
  async function runCandidateJob(route, payload, label) {
    const hint = document.getElementById('musicLibHint');
    hint.textContent = label + '…（子进程，服务不会卡）';
    try {
      const { job } = await post(route, payload);
      const done = await pollJob(job.id, renderJobs);
      if (!done || done.state !== 'done') {
        hint.textContent = label + '失败：' + ((done && done.tail.slice(-1)[0]) || '原因不明');
        return;
      }
      const r = await (await fetch(`/api/music/candidates?film=${filmId}`)).json();
      musicCands = r.candidates || [];
      selectedCandId = musicCands[0] && musicCands[0].id;
      hint.textContent = `${musicCands.length} 条（前 6 条的试听已缓存）`;
    } catch (e) {
      hint.textContent = label + '失败：' + e.message;
    }
    renderMusicCands();
  }

  document.getElementById('musicSearchBtn').onclick = async () => {
    saveCueMemory();
    await runCandidateJob(
      'music/search',
      {
        cue: currentCueId(),
        q: document.getElementById('musicQ').value.trim(),
        gridFit: document.getElementById('optGridFit').checked,
        continuity: document.getElementById('optContinuity').checked,
        limit: Number(document.getElementById('optLimit').value) || 12,
      },
      '检索中'
    );
    // 「搜索即预改编」：搜完直接把首位排进预改编队列（缺省关）
    if (document.getElementById('optAutoPrepare').checked && selectedCandId) {
      document.getElementById('prepareBtn').click();
    }
  };

  document.getElementById('musicSimilarBtn').onclick = () =>
    runCandidateJob('music/similar', { cue: currentCueId(), trackId: selectedCandId }, '找相似中');

  document.getElementById('musicRemoveBtn').onclick = async () => {
    if (!confirm('解绑本段的曲目？这一段的对拍锚点也会清掉。')) return;
    await post('music/remove', { cue: currentCueId() });
    await reload();
    await reloadLibrary();
  };

  document.getElementById('prepareBtn').onclick = async () => {
    const cand = musicCands.find((c) => c.id === selectedCandId);
    saveCueMemory();
    const r = await post('music/prepare', {
      cue: currentCueId(),
      trackId: selectedCandId,
      title: cand && cand.title,
      artist: cand && cand.artist,
    });
    document.getElementById('adaptHint').textContent =
      `已入队 ${r.queued.filter((x) => x.queued).length} 个（在跑 ${r.status.running} / 等待 ${r.status.waiting}）`;
    renderJobs();
  };

  document.getElementById('adaptBtn').onclick = async () => {
    saveCueMemory();
    const pool = Number(document.getElementById('adaptPool').value);
    const { job } = await post('music/adapt', {
      cue: currentCueId(),
      trackId: selectedCandId || undefined,
      pool,
      prefs: prefRegions,
    });
    document.getElementById('adaptHint').textContent = '改编中，1–3 分钟…';
    await pollJob(job.id, renderJobs);
    document.getElementById('adaptHint').textContent = '改编完成。';
    await reload();
    await reloadLibrary();
  };

  document.getElementById('fullBtn').onclick = async () => {
    const { job } = await post('music/full', { cue: currentCueId() });
    await pollJob(job.id, renderJobs);
    await reload();
    await reloadLibrary();
  };

  bindPrefCanvas();
  loadCueMemory();
  // 作业面板常驻刷新；没有在跑的作业时也只是一次很轻的读盘
  setInterval(renderJobs, 2500);
}

/* ──────────────────────────────── 启动 ────────────────────────────────── */

async function reload() {
  const res = await fetch(`/api/state?film=${filmId}`);
  S = await res.json();
  filmId = S.filmId;
  warp = buildWarp(S.truth.sync);
  // 拉各段配乐的真实网格，用来画拍网格和做吸附
  try {
    const a = await post('sync/analyze', {});
    analyses = a?.analyses ?? [];
  } catch (_) {
    analyses = [];
  }
  renderAll();
  applyLaneGains();
}

async function boot() {
  films = await (await fetch('/api/films')).json();
  const sel = document.getElementById('filmSelect');
  // 没带 ?film= 时用服务端的缺省片（vw studio <片> 启动时指定的那部），不是列表里的第一部
  await reload();
  sel.innerHTML = films.map((f) => `<option value="${f.id}"${f.id === filmId ? ' selected' : ''}>${f.title}（${f.id}）</option>`).join('');

  const v = video();
  if (S.videoUrl) {
    v.src = S.videoUrl;
    document.getElementById('videoMsg').textContent =
      `母片 ${S.videoUrl.split('/').pop()} · 点画面打点写批注`;
  } else {
    document.getElementById('videoMsg').textContent =
      `还没有母片：先跑 vw render ${filmId} --mode=master`;
  }

  bindEvents();
  bindMusicEvents();
  renderMusicCands();
  await reloadLibrary();
  await renderJobs();
  detectVideoClock();
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="padding:24px;color:#FF859D">工作台启动失败: ${e.message}\n${e.stack || ''}</pre>`;
});
