# video-workbench

在本机运行的**程序化影片工作室**：React 写画面，Remotion 逐帧渲染；three.js 做实时 3D，Blender 做照片级预渲染；自建的配音平台负责音效、配乐、对拍和混音；最后由 ffmpeg 三段式出片。个人探索项目，仓库私有。

## 快速开始

```bash
npm install
npx tsx bin/vw.ts --help      # 统一命令行 vw
npm test                      # 单元测试
npm run typecheck             # 类型检查
vw py setup                   # （可选）Python 环境：采样配乐 / 配音 / 转写核对
vw studio <片>                # 工作台（127.0.0.1:5177）：调混音、换素材、指着画面提批注
```

做一部新片：`vw init <片>` → 写决策单 `director.md` → `vw brief <片>`（内容策划）→ 画面 / 声音 → `vw check <片>` → `vw render <片> --mode=final` → `vw review <片>`。

## 先看哪个文件

| 你想… | 看 |
|---|---|
| 改这个仓库（加能力、修 bug、写工具） | [`AGENTS.md`](AGENTS.md)（规矩、命令、仓库地图、踩过的坑） |
| 做一部片（导演、编排、混音） | [`skills/video-workbench/SKILL.md`](skills/video-workbench/SKILL.md) |
| 知道现在能做什么、哪些验证过 | [`docs/capabilities.md`](docs/capabilities.md) |
| 设计方法与视觉语言 | [`docs/method/`](docs/method/)、[`docs/library/`](docs/library/) |
| 挑一个风格 | [`src/styles/README.md`](src/styles/README.md)（`vw style gallery --open` 有总览页） |
| 片子目录怎么组织 | [`src/films/README.md`](src/films/README.md) |
| 前人的经验 | [`docs/experience.md`](docs/experience.md)（`vw learn`） |
| 最初的设计和方案（部分已过时） | [`docs/history/`](docs/history/) |

## 不在仓库里的东西

大媒体和业务资料只留在本机（`.gitignore` 里有分组和说明）：生成的配乐 / 音效 / 口播 WAV、封存的旧版本、参考成片、真实业务数据的片子、第三方基准文档 `architecture.html`、`.env`（密钥）。换机时这些要自己带。
