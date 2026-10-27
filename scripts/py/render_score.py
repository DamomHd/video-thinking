"""配乐渲染（本工程 → lemo-opuscar 采样器 / 拨弦物理建模 / 内置合成）

stdin：{"events": [...], "dur": 秒, "out": wav 路径, "room": {"size": .., "mix": ..}}
  每个事件 {t, inst, pitch, dur, vel, pan, gain?, attack?, release?, var?}；无音高的打击乐 pitch 写变体名或 null。
  inst 三种：
    采样乐器名（violins、piano、marimba…）→ 上游 sampler
    pluck:<preset>（guqin、pipa、shamisen、koto、banjo、harp、kalimba、music_box…）→ 上游 pluck（物理建模，需要 numba）
    synth:<voice>（pad / bass / pluck / bell / plonk / sub）→ 本文件里的 numpy 合成
stdout：{"credits": [...], "instruments": [...]}（署名行由上游 sampler.credits 生成：CC0 致谢 + 需要署名的 CC BY 声明）
由 scripts/composer/sampled.ts（本地作曲 · 采样演奏）和 scripts/composer/score-film.ts（按片作曲）调用；
在 vendor/lemo-opuscar 目录下运行（上游按仓库根目录的相对路径找采样库）。
"""
import sys, json, os
sys.path.insert(0, os.getcwd())
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
from core.audio import sampler as S
from core.audio.sfx import add, SR


def _midi(p):
    return S.midi(p if p is not None else 'A3')


def _hz(p):
    return 440.0 * 2 ** ((_midi(p) - 69) / 12)


def _env(n, attack, release, sustain_n):
    """线性起音 + 保持 + 指数释放（全部按采样点）"""
    a = max(1, int(attack * SR))
    e = np.ones(n, np.float32)
    e[:min(a, n)] = np.linspace(0, 1, min(a, n))
    if sustain_n < n:
        k = n - sustain_n
        e[sustain_n:] *= np.exp(-np.arange(k) / (release * SR / 5 + 1))
    return e


def _saw(f, n, phase=0.0):
    t = np.arange(n) / SR
    return (2 * ((t * f + phase) % 1.0) - 1).astype(np.float32)


def synth(voice, pitch, dur, vel, attack=None, release=None):
    """内置合成音色：单声道 float32。音高按 pitch，长度 = dur + release"""
    dur = max(0.05, dur or 0.5)
    f = _hz(pitch)
    rng = np.random.default_rng(int(_midi(pitch) * 100) % 9973)
    if voice == 'pad':  # 三个失谐锯齿 + 慢起音 + 低通：暖垫
        att, rel = attack or 0.6, release or 1.2
        n = int((dur + rel) * SR)
        x = sum(_saw(f * 2 ** (c / 1200), n, rng.random()) for c in (-7, 0, 6)) / 3
        x = sosfilt(butter(2, min(2400, f * 6), 'low', fs=SR, output='sos'), x)
        return (x * _env(n, att, rel, int(dur * SR)) * 0.35 * vel).astype(np.float32)
    if voice == 'bass':  # 锯齿 + 次八度正弦，低通：合成贝斯（带 2、3 次谐波，小音箱也听得见）
        att, rel = attack or 0.01, release or 0.15
        n = int((dur + rel) * SR)
        t = np.arange(n) / SR
        x = 0.6 * _saw(f, n) + 0.5 * np.sin(2 * np.pi * f / 2 * t)
        x = sosfilt(butter(2, min(900, f * 5), 'low', fs=SR, output='sos'), x)
        return (x * _env(n, att, rel, int(dur * SR)) * 0.5 * vel).astype(np.float32)
    if voice in ('pluck', 'bell', 'plonk'):
        # 衰减类：pluck 低通锯齿；bell FM 钟；plonk 正弦 + FM（调制深度随力度：木 → 金属）
        rel = release or {'pluck': 0.6, 'bell': 2.5, 'plonk': 0.9}[voice]
        n = int((dur + rel) * SR)
        t = np.arange(n) / SR
        decay = np.exp(-t / ({'pluck': 0.25, 'bell': 1.2, 'plonk': 0.35}[voice]))
        if voice == 'pluck':
            x = sosfilt(butter(2, min(5000, f * 8), 'low', fs=SR, output='sos'), _saw(f, n))
        elif voice == 'bell':
            x = np.sin(2 * np.pi * f * t + 2.0 * np.exp(-t * 3) * np.sin(2 * np.pi * f * 3.5 * t))
        else:
            idx = 0.3 + 2.5 * vel
            x = np.sin(2 * np.pi * f * t + idx * np.exp(-t * 6) * np.sin(2 * np.pi * f * 2 * t))
        x = x * decay * np.minimum(1, t / 0.002)
        return (x * 0.5 * vel).astype(np.float32)
    if voice == 'sub':  # 纯低频正弦（落版的「咚」、段落的托底）
        att, rel = attack or 0.02, release or 0.4
        n = int((dur + rel) * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * f * t)
        return (x * _env(n, att, rel, int(dur * SR)) * 0.6 * vel).astype(np.float32)
    raise ValueError(f'没有这个合成音色：synth:{voice}（有 pad / bass / pluck / bell / plonk / sub）')


req = json.load(sys.stdin)
S.seed(7)  # 轮换取样的随机数固定：同一份谱每次渲出来一样
n = int(round(req['dur'] * SR))
sampled, other = [], []
for e in req['events']:
    (other if ':' in e['inst'] else sampled).append(e)

events = []
for e in sampled:
    d = dict(t=e['t'], inst=e['inst'], pitch=e.get('pitch'), dur=e.get('dur'), vel=e.get('vel', .8), pan=e.get('pan', 0))
    for k in ('attack', 'release', 'var'):
        if k in e: d[k] = e[k]
    if 'gain' in e: d['gain'] = e['gain']
    events.append(d)
# 只有采样乐器时和原来一样由采样器做总线限幅；混了合成 / 拨弦时最后统一处理
mix = S.render(events, dur=req['dur'], master=not other) if events else np.zeros((n, 2), np.float32)
if len(mix) < n: mix = np.vstack([mix, np.zeros((n - len(mix), 2), dtype=mix.dtype)])
mix = mix[:n].copy()

P = None
for e in other:
    kind, name = e['inst'].split(':', 1)
    vel = e.get('vel', .8)
    if kind == 'synth':
        x = synth(name, e.get('pitch'), e.get('dur'), vel, e.get('attack'), e.get('release'))
    elif kind == 'pluck':
        if P is None:
            try:
                from core.audio import pluck as P
            except ImportError as err:
                sys.exit(f'拨弦物理建模需要 numba（{err}）。Intel Mac 上 numba 最后一个能装的版本要求 numpy < 2.4，和本工程锁的 numpy 2.4.6 冲突；换成采样乐器（harp、guitar_nylon、dan_tranh…）或 synth:pluck')
        x = P.pluck(name, e.get('pitch') if e.get('pitch') is not None else 'A3', e.get('dur'), vel)
    else:
        raise ValueError(f'认不出的乐器：{e["inst"]}')
    add(mix, x, e['t'], e.get('gain', 1.0) if e.get('gain') is not None else 1.0, e.get('pan', 0.0) or 0.0)

room = req.get('room')
if room: mix = S.room(mix, size=room.get('size', .45), mix=room.get('mix', .18))
mix = mix[:n]
peak = float(np.max(np.abs(mix))) or 1.0
if peak > .95: mix = mix * (.95 / peak)
sf.write(req['out'], mix, SR, subtype='PCM_16')
names = sorted({e['inst'] for e in sampled})
cr = S.credits(names) if names else []
print(json.dumps({'credits': cr if isinstance(cr, list) else str(cr).splitlines(), 'instruments': sorted({e['inst'] for e in req['events']})}, ensure_ascii=False))
