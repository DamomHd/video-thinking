# lemo-opuscar 的 Python 工具链（收录）

- 来源：<https://github.com/lemomo-ai/lemo-opuscar>，commit `413a6bd`（2026-10-24），LemoLab。
- 授权：MIT，见同目录 `LICENSE`。
- 收录日期：2026-10-26。

## 收了什么（原样，没改动）
- `core/audio/`：`sampler.py`（采样乐器）、`pluck.py`（拨弦物理建模）、`sfx.py`（程序化音效与混音辅助）、`INSTRUMENTS.md`（乐器表与采样库授权）。
- `core/tts/`：`tts.py`（Kokoro 离线配音）、`tts_zh.py`（edge-tts）、`asr_check.py`（faster-whisper 逐句核对 + 逐词时间戳）。
- `core/render/`：`srt.py`（字幕导出）；`readcheck.mjs`、`mux.sh` 只作对照参考（本工程的对应：`scripts/guard/readcheck.ts`、`scripts/render/master.ts`）。
- `tools/assets.json`、`tools/fetch.sh`：上游素材包清单与下载脚本（本工程用 `vw py fetch` 下载，读同一份清单）。

## 本工程加的
- `requirements.txt`：本工程锁定的 Python 依赖（精确版本、发布满两周；Python 3.11）；`requirements.lock.txt` 是装好后的完整冻结清单。
- 素材包（采样库、Kokoro 模型）和 Whisper 模型都在 `out/opuscar/`（缓存，不进源码），从这里的 `core/audio/instruments`、`core/tts/*.onnx|*.bin` 软链过去；由 `scripts/py/opuscar.ts` 下载、校验 sha256、建链接。

## 素材授权
- 采样库：VSCO 2 CE、VCSL、FreePats、Karoryfer 是 CC0；Salamander 钢琴（`piano`）CC BY 3.0、MuldjordKit 鼓组（`drum_kit`）CC BY 4.0，用到就要署名（`sampler.credits()` 生成署名行，写进 `music.json` 的 `track.license`，`vw review` 核对）。
- Kokoro 模型：Apache 2.0。edge-tts 是微软的在线服务，商用前自行确认条款。

## 规矩
- 这里的上游文件保持原样；本工程的接法在 `scripts/py/`、`scripts/composer/sampled.ts`、`scripts/guard/readcheck.ts`、`scripts/render/master.ts`。
