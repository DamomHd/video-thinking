#!/usr/bin/env node

/**
 * 视频工作台统一命令行入口 (vw / om)
 * 交互外壳继承自 huashu-motion，制作内核运行于 LoomCare 第二代架构
 */

import fs from 'node:fs';
import path from 'node:path';
import { listFilms, getFilm } from '../src/films.js';
import { runGuardChecks } from '../scripts/guard/index.js';
import { runRenderPipeline } from '../scripts/render/pipeline.js';
import { InboxService } from '../scripts/spot/inbox.js';
import { exportPhoneTrack } from '../scripts/blender/phone-track.js';
import { runBlenderRender } from '../scripts/blender/render.js';
import { TruthManager } from '../scripts/spot/truth.js';
import { swapSlotAsset } from '../scripts/spot/swap.js';
import { VersionService } from '../scripts/spot/version.js';
import { matchMusicForFilm } from '../scripts/sync/match.js';
import { generateFilmScoreWav } from '../scripts/composer/engine.js';
import { buildSfxPlan, migrateParamsToPlan } from '../scripts/spot/plan.js';
import {
  searchSlots,
  promoteCandidate,
  readPool,
  searchSimilarForSlot,
  backfillSlots,
} from '../scripts/spot/search.js';
import type { SfxSource } from '../scripts/epidemic/provider.js';
import { pickAll } from '../scripts/spot/pick.js';
import { EpidemicMusicService } from '../scripts/epidemic/music.js';

const args = process.argv.slice(2);
const command = args[0];
const subArgs = args.slice(1);

function parseFlags(items: string[]): { positional: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (const item of items) {
    if (item.startsWith('--')) {
      const [key, ...rest] = item.slice(2).split('=');
      flags[key] = rest.length > 0 ? rest.join('=') : true;
    } else {
      positional.push(item);
    }
  }
  return { positional, flags };
}

/**
 * 影片位归一化（配合附录 B 的 VW_FILM / SFX_FILM）。
 *
 * `vw music cue <film> list` 这类命令里影片在第二位，省略它会让后面的参数整体前移，
 * 'list' 就被当成了影片名。所以只在**确定错位**时才补：
 * 环境变量指定了影片，而影片位上的 token 不是任何一个已注册影片 —— 那它只能是被挤过来的参数。
 * 判不准就不动，让原来的报错照常出现。
 */
function normalizeFilmSlot(positional: string[], slot: number, registered: Set<string>): void {
  const fromEnv = process.env.VW_FILM || process.env.SFX_FILM;
  if (!fromEnv || !registered.has(fromEnv)) return;
  const at = positional[slot];
  if (at === undefined || !registered.has(at)) {
    positional.splice(slot, 0, fromEnv);
  }
}

function showHelp() {
  console.log(`
程序化影片工作室 (video-workbench) · CLI 速查

用法:
  vw <command> [args] [options]

影片与质检:
  hw                               查看本机硬件档位（apple / intel）及按档位取的缺省参数
  list                             列出所有已注册的影片
  init <film>                      脚手架初始化新影片目录与真值
  check <film>                     6 道质检守门（类型 / 确定性 / 拍点 / 幕表 / 弹性区 / 抽帧）[--qa-frames]
                                   --variant=trailer|short 改查衍生片（镜头表 / cue 槽 / 拍网格）
  brief <film>                     内容策划：按时长算信息容量、查结论出现时刻和每个点的时长，输出纸面稿（读决策单「内容策划」信息表 + 口播）
  review <film>                    导演自检：决策单 / 决策↔实现 / 音效调内 / 声音疏密 / 最长静止 / 许可证 / 设计评审（只提示不拦）
  critic <film> [--frames=a.png,b.png]  冷看包：只打包观众看得到、听得到的（抽帧、能量最高处连拍、每秒能量 / 响度、口播原文）→ out/<film>/critic/；
                                   再另起一个不带上下文的子代理读 critic/PROMPT.md，回答写到 out/<film>/critic.md（vw review 读回）

看画面与经验（设计评审用，方法见 docs/method/taste.md）:
  still <合成> --at=1.2,3.4        按秒抽静帧（片子或任意合成；只打包一次）→ out/<合成>/stills/ [--out=目录]
               --strip=2.0:2.5     连拍：这段的每一帧拼成一张（看动作、跳帧、抖动、转场）
               --crop=x,y,w,h      局部放大：每帧只取这块、原分辨率（看脸、手、接触点）；可配 --at / --strip
  sheet <film|mp4> [--n=12]        成片缩略图（均匀抽帧拼一张）→ out/<film>/sheet.png [--cols=4]
  ref <视频> --out=<目录> [--n=8]   参考片抽帧 + 缩略图 + 观察笔记模板（学为什么好，不是对齐目标）
  learn [主题…]                    读经验（docs/experience.md），用户偏好排最前
  learn add "<内容>" --kind=preference|observed|verified --topics=a,b --evidence="…"
  render <film>                    出片：--mode=master (静音母片) | final (1080p60 三段式成片)
                                   --variant=trailer|short 出衍生片（封装加 alimiter 兜峰值）
                                   --no-warp 母片按乐谱时间渲（工作台播放时再模拟变速）
                                   --play 成片之外再出一份限峰 20Mbps 的播放副本

风格库:
  py setup | fetch instruments <库|all> | fetch voice   lemo-opuscar 的 Python 环境（.venv）与素材包（采样库、Kokoro 模型 → out/opuscar/）
  voice final <film>               成片里的口播还听得清吗（混音后逐句再核对，出片时有口播会自动跑）
  voice film <film> [--engine=]    一部片的口播（可选层，片子有 audio/voice.json 才有；要不要口播先问用户）：配音 → 核对 → 字幕
  voice tts|check|srt …            配音（Kokoro 离线 / edge-tts）· Whisper 逐句核对 + 逐词时间戳 · 导出字幕
  storyboard <film> --shots=<json>  分镜（用户要了才做）：6–9 个关键镜头一张图，每格标镜头号 / 景别 / 时长 / 台词
  font fetch "<字体>" [--weights=] [--italic] [--film=<片>]   风格点名的字体从 Google Fonts 取到本地（中日韩字体按片子取子集）
  credits <film>                   交付用的 CREDITS（第三方素材来源与授权）→ out/<片>/CREDITS.md（出片时自动生成）
  readcheck <film> [--step=0.2]    读字检查：每段字完整可读的时间够不够读完（中文 字数÷4.5+1.5s）→ out/<片>/readcheck.json
  style gallery [--open] [--videos] 风格库总览页 out/styles/gallery.html：按分类排海报，点开内嵌播放上游样片、看 STYLE.md；--videos 把样片缓存到本地离线播
  style index                      生成风格索引 src/styles/README.md（按分类，自有风格在前；挑风格时贴给用户）
  style list                       列出风格（src/styles/<id>/）：自有风格（用户认可后沉淀）+ 收录的 lemo-opuscar 66 个风格。片子默认不选
  style sheet <id>                 渲风格样张：色板、字号阶梯、墨线、图框 → out/styles/<id>-sheet.png
  style demo <id>                  收录风格的样片源码 → out/styles/<id>/demo/（读来学手法）
  style fork <底子> --id= | fork --blank --technique=<底子> --id=   改成你自己的风格：起草稿（out/style-drafts/<id>/）
  style vs <底子帧> <新帧>          风格帧并排（左底子、右新风格）
  style keep <id>                  用户点头后：草稿进风格库并登记
  style save <film> --id=<风格id> [--label=]   把用户认可的片子主题沉淀成风格（色板 / 字体 / 图框 + README 模板 + 参考帧）

代码动画 × AI 视频（混合拼接）:
  handoff <film> --at=<放映秒>      导出交接帧 PNG（给视频模型当首帧），并换算出幕内乐谱秒 [--label=]
  insert add <film> --clip=<mp4>   规整导入片段 → public/inserts/<片>/（1920×1080 h264 无音轨）[--label=] [--at=]
  seam <film> --clip= --at= [--return=]   接缝比对：SSIM + 亮度差 → 硬切 / 软遮罩 / 重生成

封存版本（改版前后对比）:
  archive save <film>              封存当前成片 → public/archive/<片>/<标签>.mp4（只读）[--label=] [--src=]
                                   Studio 出现 <片>-Archive-<标签>（回放）与 <片>-Compare-<标签>（旧新并排）
  archive list [film]              列出封存
  archive remove <film> <标签>      解除误封存

Blender 预渲染:
  blender track <film>             从机位单源 careRig 导出轨迹 + 签名 JSON
  blender render <film>            后台 Cycles 预渲染，按真实帧数写 complete [--force]
                                   没有机身场景时按 PHONE_SPECS 程序化建 public/models/phone.blend
                                   采样数按硬件档位（apple 128 / intel 32，BLENDER_SAMPLES 可覆盖）；无 Metal GPU 时自动走 CPU
                                   预计超过档位上限（intel 30 分钟）时要加 --accept-slow 才开渲
  blender rays <film> --comp=<剪影合成>   剪影序列 → Blender 合成器体积光 → public/blender/<片>/rays/
                                   [--source=x,y 左上原点] [--length=] [--color=r,g,b] [--gain=] [--force]
  blender scene --spec=<json>      场景 JSON（物体 / 材质预设 / 灯光预设 / 相机 / 定格）→ .blend
                                   [--still=<秒> 渲一张预览] [--samples=] [--res=960x540]；示例 blender/scene/examples/
  blender flight --module=<ts> --export=<名>   漫游路线（FlightPlan）→ 轨迹 JSON + Blender 相机关键帧 .blend
                                   参考点投影比对 three ↔ Blender，偏差 > 0.5px 退出 [--fps=60] [--blend=场景] [--out=]
  blender glb [<.blend>]           导出 glb + 尺寸单源 JSON（默认 public/models/phone.blend）
                                   [--out=public/models/x.glb] [--meta=src/assets/models/x.json]

音效链路:
  sfx search <film> [槽…]          走 provider 检索候选并按声学画像打分
                                   [--local] [--keep=8 每轮新增几条] [--preview=6 几条拉预览做画像]
                                   [--source=freesound|kenney|local|epidemic 指定来源；CC0 来源带许可证进 manifest]
  sfx pick <film> [槽…]            落定素材到 public/sfx-lib + 写 manifest [--local] [--source=…]
  sfx freesound auth [--code=]     Freesound 授权（取原始无损文件）；status 看授权状态
  sfx kenney sync [包…]            下载 Kenney CC0 音效包到 out/kenney 并建索引（缺省 interface-sounds ui-audio impact-sounds digital-audio）
  sfx plan <film>                  按真实包络生成 sfxPlan.json（峰归一 −6dBFS / peak-onset 对齐）
  sfx use <film> <槽> <候选id>      把某个候选顶到首位
  sfx swap <film> <槽> <新文件>     换素材并反向累加 offset 保位置
  sfx tune <film> <key>            微调混音 [--offset=] [--gain=] [--fade-in=] [--fade-out=]
  sfx candidates <film> [槽]        查看候选池
  sfx add <film> <槽> "<标题>"      按标题把候选顶到首位（use 是按 id）
  sfx similar <film> <槽>           以首位为种子找相似音效，追加到池尾 [--seed=] [--first=]
  sfx backfill <film>              只给候选不足的槽补搜 [--min=4]
  sfx probe <film>                 看采购单 / 候选池 / 素材三者对不对得上

配乐链路:
  music search <film> <段id>        检索配乐候选并按 mscore 排序（需 Epidemic 凭据）
  music match <film>               全链匹配：bpmfit → Adapt 闭环 → 真实分析 → 对拍求解 [--local] [--bpm=108|100-112]
                                   [--local --sampled[=cinematic|mallets|chamber]] 本地作曲用真实乐器采样演奏（vw py setup + vw py fetch instruments vsco2ce / vcsl）
  music score <film>               按片作曲：渲染片子的 audio/score.ts（画面锁在配乐网格上），写回 music.json、对拍清成恒等
                                   [--source=freesound --brief="minimal piano, calm"] 从 Freesound 取 CC0 配乐（剪到段长、高潮钉 P0），取不到退回本地作曲
  music compose <film>             本地 ABC 作曲引擎生成配乐
  music cue <film> list|split|merge|join …   配乐段操作
  music similar <film> <段id>       以段上曲目为种子找相似曲目 [--track=] [--first=] [--json]
  music prepare <film> <段id>       预改编：r8 闭环 + 干跑求解，缓存起来不写 sync.json
  music adapt <film> <段id>         改编落定；命中预改编缓存时不调接口 [--pool=N 比选] [--track=]
  music choose <film> <段id>        换用比选产物里的另一个配方 --recipe=r16-peak
  music full <film> <段id>          落原曲整首并清掉本段对拍（需原始素材下载权）
  music remove <film> <段id>        解绑本段曲目，锚点一并清掉
  music gc <film>                   删掉没有任何地方引用的音频 [--apply]
  music short <film>               衍生片配乐：先出配乐再实测 drop，写进 short/music.json
                                   [--bpm=108] [--bars=10] [--src=] [--drop=]
  music plan <film>                按幕表与 P0 拍点排出缺省配乐段 [--min=8] [--apply]
  music align <film>               把段入点吸附到配乐小节头 [--apply]
  music cut <film>                 离线剪配乐（按 jumpCost 找接缝，ffmpeg 采样级拼接）
                                   --src= --out= --len= --drop= [--bpm=]

对拍:
  sync analyze <film>              对各段配乐做真实多频带分析
  sync scan-bpm <film>             速度可行性与推荐窗口
  sync mscore <film>               选曲打分演算 [--bpm=] [--key=] [--vocals]
  sync solve <film>                对拍求解并写回 sync.json
  sync clear <film>                清空为恒等映射

质检与诊断:
  qa odd <film>                    孤帧扫描（只看三帧窗口里孤立的那一帧）[--region=x,y,w,h]
  qa audio <film>                  音效反查：计划里的点类音效落点，在成片音轨里是否真响了、起音偏移多少 ms（需先出片）
  qa flicker <film>                闪帧扫描（8×5 灰度逐帧比，标出是否落在转场上）
  spot sheet <film>                生成 spot-sheet.txt（按时间通读）与 spot-palette.txt（采购单）
  spot video <film>                纯画面信号：运动面积 / 帧差 / 亮度 / 切镜 + 召回噪音对账
  diff                             逐帧灰度比对新旧成片 --old= --new= [--fps=30]
                                   报出哪几帧变了 + 差异最大那一帧的 A|B 对比图
  ab <film>                        开关 A/B 静帧对比（先测底噪再判显著性）
                                   --frame= --comp= --a='{}' --b='{"ssaa":2}'
  bake <film>                      烘焙纹理（渲某一帧当 WebGL 纹理，文件名带内容指纹）
                                   --comp= --frame=40 --scale=2 --name=

编舞同步 / 批注 / 版本:
  spot sync-choreo <film>          编舞增量同步（比对 → 补素材 → 迁移调参 → 重解析）
  inbox list|resolve <film> [id]   工作台批注单
  version save|list|restore <film> 混音版本快照
  studio <film>                    启动本地混音与批注工作台 (127.0.0.1:5177)
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  const { positional, flags } = parseFlags(subArgs);

  /**
   * 影片位在不同命令里不一样：
   *   check / render / studio …        第 0 位
   *   sfx / music / sync / spot / qa …  第 1 位（第 0 位是动作）
   * 设了 VW_FILM / SFX_FILM 时按这个布局把影片补回去。
   */
  const registeredIds = new Set(listFilms().map((f) => f.id));
  const FILM_AT_1 = new Set(['sfx', 'music', 'sync', 'spot', 'qa', 'ab', 'diff', 'inbox', 'version', 'archive', 'insert']);
  normalizeFilmSlot(positional, FILM_AT_1.has(command) ? 1 : 0, registeredIds);
  const forceLocal = Boolean(flags['local']);

  switch (command) {
    case 'list': {
      const films = listFilms();
      console.log(`\n已注册影片 (${films.length}):`);
      films.forEach((f) =>
        console.log(`  - ${f.id} (${f.title}, ${f.width}x${f.height}@${f.fps}fps)`)
      );
      break;
    }

    case 'init': {
      const id = positional[0];
      if (!id) {
        console.error('错误: 请提供新影片名称，例如: vw init my-product');
        process.exit(1);
      }
      if (!/^[a-z][a-z0-9-]*$/.test(id)) {
        console.error(`错误: 影片 ID 只能用小写字母、数字和连字符（当前: ${id}）`);
        process.exit(1);
      }
      const targetDir = path.join(process.cwd(), 'src', 'films', id);
      if (fs.existsSync(targetDir)) {
        console.error(`错误: 影片目录已存在: ${targetDir}`);
        process.exit(1);
      }

      /**
       * 只复制**正片骨架**：timeline / index / scenes / theme / audio。
       * 不复制 trailer/ 与 short/ —— 衍生片是逐片的创作，原语都在 shared/ 和 components/ 里，
       * 复制过来只会留下一堆指向旧片的常量。three/ 同理（机身管线是 loomcare 专有的）。
       */
      const srcDir = path.join(process.cwd(), 'src', 'films', 'us');
      const COPY = ['timeline.ts', 'index.tsx', 'theme.ts', 'scenes', 'shots', 'audio'];
      fs.mkdirSync(targetDir, { recursive: true });
      for (const entry of COPY) {
        const from = path.join(srcDir, entry);
        if (!fs.existsSync(from)) continue;
        fs.cpSync(from, path.join(targetDir, entry), { recursive: true });
      }

      // 标识符改名：Pascal 化的片名 + filmId + 常量前缀
      const pascal = id
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join('');
      const upper = id.replace(/-/g, '_').toUpperCase();

      const rewrites: [RegExp, string][] = [
        [/\bUsAdapter\b/g, `${pascal}Adapter`],
        [/\bUsFilm\b/g, `${pascal}Film`],
        [/\bUsFilmProps\b/g, `${pascal}FilmProps`],
        [/\bUS_THEME\b/g, `${upper}_THEME`],
        [/\bUS_TRUTH\b/g, `${upper}_TRUTH`],
        [/\bUS_TYPINGS\b/g, `${upper}_TYPINGS`],
        [/filmId = 'us'/g, `filmId = '${id}'`],
        [/music\/us-theme-main\.wav/g, `music/${id}-theme-main.wav`],
        [/music\/us-short\.wav/g, `music/${id}-short.wav`],
      ];

      let rewritten = 0;
      const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          if (!/\.(tsx?|json)$/.test(e.name)) continue;
          const before = fs.readFileSync(full, 'utf-8');
          let after = before;
          for (const [re, to] of rewrites) after = after.replace(re, to);
          if (after !== before) { fs.writeFileSync(full, after, 'utf-8'); rewritten++; }
        }
      };
      walk(targetDir);

      // 真值清空成干净起点：计划与调参表归零，保留结构
      const audioDir = path.join(targetDir, 'audio');
      const blanks: Record<string, unknown> = {
        'sfxPlan.json': [],
        'sfxOffsets.json': {},
        'sfxGains.json': {},
        'sfxFades.json': { in: {}, out: {} },
        'sfxDucks.json': {},
        'manifest.json': {},
        'music.json': { version: 2, cues: [] },
        'sync.json': {
          knots: [[0, 0]],
          anchors: [],
          report: { scoreSync: 0, lockedCount: 0, downgradedCount: 0, droppedCount: 0 },
        },
      };
      for (const [f, v] of Object.entries(blanks)) {
        const target = path.join(audioDir, f);
        if (fs.existsSync(target)) fs.writeFileSync(target, JSON.stringify(v, null, 2) + '\n', 'utf-8');
      }

      // 引擎按目录自动发现片子（shared/film-root.ts）：film.json（Node 侧）+ root.tsx（Remotion 侧），不用再去总注册里加一行
      fs.writeFileSync(
        path.join(targetDir, 'film.json'),
        JSON.stringify({ id, title: id, fps: 60, width: 1920, height: 1080 }, null, 2) + '\n',
        'utf-8'
      );
      fs.writeFileSync(
        path.join(targetDir, 'root.tsx'),
        `import type { FilmRoot } from '../../shared/film-root';\nimport { FILM_PLAN } from './timeline';\nimport { ${pascal}Film, ${upper}_TRUTH, ${upper}_TYPINGS } from './index';\n\n/** 给 Remotion 的这一份：幕表、画面、真值、打字表（目录约定见 shared/film-root.ts） */\nexport const filmRoot: FilmRoot = { timeline: FILM_PLAN, component: ${pascal}Film, truth: ${upper}_TRUTH, typings: ${upper}_TYPINGS };\n`,
        'utf-8'
      );

      console.log(`\n[vw init] 已装配正片骨架 → src/films/${id}/`);
      console.log(`  复制: ${COPY.join(' / ')}（不含 trailer / short —— 衍生片是逐片创作，原语在 shared/）`);
      console.log(`  生成: film.json（片名 / 帧率 / 宽高，竖屏片在这里改成 1080×1920）+ root.tsx（已自动登记，不用改 films.ts / Root.tsx）`);
      console.log(`  改名: ${pascal}Adapter / ${pascal}Film / ${upper}_THEME，filmId='${id}'（改写 ${rewritten} 个文件）`);
      console.log(`  真值: 九张 JSON 已清成干净起点`);
      console.log(`\n  下一步：`);
      console.log(`    1. 改 film.json 的 title；改 timeline.ts 的幕表、audio/adapter.ts 的 palette / spots / hits / zones`);
      console.log(`    2. vw sfx search ${id} → sfx pick → sfx plan → 写 audio/score.ts、music score（按片作曲）→ check → render\n`);
      break;
    }

    case 'check': {
      const id = requireFilm(positional[0]);
      const variant = flags['variant'] as 'trailer' | 'short' | undefined;

      if (variant) {
        const ok = await checkVariantFilm(id, variant);
        process.exit(ok ? 0 : 1);
      }

      const res = await runGuardChecks(id, { qaFrames: Boolean(flags['qa-frames']) });
      process.exit(res.passed ? 0 : 1);
      break;
    }

    case 'still': {
      // 任意合成都行（片子、方向帧、对比合成…），合成名由 Remotion 校验
      const id = positional[0];
      if (!id) {
        console.error('用法: vw still <合成名> --at=1.2,3.4 [--out=目录]');
        process.exit(1);
      }
      const at = String(flags['at'] ?? '').split(',').map(Number).filter((n) => Number.isFinite(n));
      const strip = flags['strip'] ? String(flags['strip']).split(':').map(Number) : null;
      const crop = flags['crop'] ? String(flags['crop']).split(',').map(Number) : null;
      if ((!at.length && !strip) || (strip && (strip.length !== 2 || strip.some((n) => !Number.isFinite(n)))) || (crop && (crop.length !== 4 || crop.some((n) => !Number.isFinite(n))))) {
        console.error('用法: vw still <合成名> --at=1.2,3.4 | --strip=2.0:2.5 [--crop=x,y,w,h] [--cols=6] [--w=320] [--entry=src/probe/index.ts] [--out=目录]');
        process.exit(1);
      }
      const { renderStills, tileImages } = await import('../scripts/look/stills.js');
      const outDir = flags['out'] ? path.resolve(String(flags['out'])) : path.join(process.cwd(), 'out', id, strip ? 'strips' : 'stills');
      const entry = flags['entry'] ? String(flags['entry']) : /Probe/.test(id) ? 'src/probe/index.ts' : undefined;
      const files = await renderStills({ composition: id, secs: at, outDir, entry, strip: strip ? [strip[0], strip[1]] : undefined });
      if (strip || crop) {
        const tag = strip ? `strip-${strip[0]}-${strip[1]}` : `crop-${at.join('_')}`;
        const sheet = tileImages(files, path.join(outDir, `${id}-${tag}${crop ? '-crop' : ''}.png`), {
          cols: flags['cols'] ? Number(flags['cols']) : strip ? 6 : Math.min(files.length, 3),
          width: flags['w'] ? Number(flags['w']) : crop ? Math.min(640, crop[2]) : 320,
          crop: crop ? [crop[0], crop[1], crop[2], crop[3]] : undefined,
        });
        console.log(`\n[vw still] ${files.length} 帧 → ${sheet}${strip ? `\n  从左到右、从上到下：${(files.length - 1) > 0 ? `${strip[0]}s → ${strip[1]}s 每一帧` : ''}` : ''}\n`);
      } else console.log(`\n[vw still] ${files.length} 张 →\n${files.map((f) => '  ' + f).join('\n')}\n`);
      break;
    }

    case 'sheet': {
      const target = positional[0];
      if (!target) {
        console.error('用法: vw sheet <film|mp4> [--n=12] [--cols=4]');
        process.exit(1);
      }
      const { contactSheet } = await import('../scripts/look/stills.js');
      const isFile = /\.(mp4|mov|webm|mkv)$/i.test(target);
      const video = isFile ? path.resolve(target) : path.join(process.cwd(), 'out', target, 'final-60.mp4');
      if (!fs.existsSync(video)) {
        console.error(`[vw sheet] 找不到 ${video}${isFile ? '' : '（先出片：vw render ' + target + ' --mode=final）'}`);
        process.exit(1);
      }
      const out = isFile ? video.replace(/\.[^.]+$/, '-sheet.png') : path.join(process.cwd(), 'out', target, 'sheet.png');
      const res = contactSheet(video, out, { n: flags['n'] ? Number(flags['n']) : 12, cols: flags['cols'] ? Number(flags['cols']) : 4 });
      console.log(`\n[vw sheet] ${res.file}\n  各格时刻（从左到右、从上到下）: ${res.times.map((t) => t.toFixed(1) + 's').join(' · ')}\n`);
      break;
    }

    case 'ref': {
      const video = positional[0];
      const outArg = flags['out'];
      if (!video || !outArg) {
        console.error('用法: vw ref <视频> --out=<目录> [--n=8]   例: --out=docs/library/exemplars/<id>');
        process.exit(1);
      }
      const { extractRef } = await import('../scripts/look/stills.js');
      const res = extractRef(path.resolve(video), path.resolve(String(outArg)), { n: flags['n'] ? Number(flags['n']) : 8 });
      console.log(`\n[vw ref] ${res.frames.length} 帧 + 缩略图 ${res.sheet}\n  观察笔记: ${res.notes}（观察和推测分开写；原则见 docs/method/taste.md）\n`);
      break;
    }

    case 'learn': {
      const L = await import('../scripts/look/learn.js');
      if (positional[0] === 'add') {
        const kind = String(flags['kind'] ?? '') as 'preference' | 'observed' | 'verified';
        if (!['preference', 'observed', 'verified'].includes(kind)) {
          console.error('用法: vw learn add "<内容>" --kind=preference|observed|verified --topics=a,b --evidence="…"');
          process.exit(1);
        }
        const topics = String(flags['topics'] ?? '').split(',').map((t) => t.trim()).filter(Boolean);
        const line = L.addEntry(kind, topics, positional.slice(1).join(' '), String(flags['evidence'] ?? ''), new Date().toISOString().slice(0, 10));
        console.log(`[vw learn] 已记入 docs/experience.md\n  ${line}`);
        break;
      }
      const entries = L.selectEntries(L.readEntries(), positional);
      console.log(`\n[vw learn] ${positional.length ? '主题 ' + positional.join(' / ') : '全部'} · ${entries.length} 条\n`);
      for (const e of entries) console.log(`  ${e.line.replace(/^- /, '')}`);
      console.log('');
      break;
    }

    case 'brief': {
      const id = requireFilm(positional[0]);
      const adapter = await getFilm(id).getAdapter();
      const { runBrief } = await import('../scripts/guard/brief.js');
      const r = runBrief(id, adapter.timeline.totalSeconds);
      const mark = { ok: '✓', hint: '·', warn: '!' } as const;
      console.log(`\n[vw brief] ${id}\n`);
      for (const it of r.items) console.log(`  ${mark[it.level]} ${it.text}`);
      console.log(`\n—— 纸面稿（不看画面，这份稿子要能讲通那一句话）——\n${r.paper}\n`);
      break;
    }

    case 'critic': {
      const id = requireFilm(positional[0]);
      const { buildCriticPack } = await import('../scripts/guard/critic.js');
      const frames = typeof flags['frames'] === 'string' ? String(flags['frames']).split(',').map((f) => path.resolve(f.trim())).filter(Boolean) : undefined;
      const r = await buildCriticPack({ root: process.cwd(), filmId: id, frames });
      console.log(`\n[vw critic] ${path.relative(process.cwd(), r.dir)}/`);
      console.log(`  下一步：另起一个子代理（不给它决策单、脚本或任何制作说明），只让它读 ${path.relative(process.cwd(), r.prompt)} 并照做`);
      console.log(`  回答写到 out/${id}/critic.md，vw review 会把它复述的一句话和信息表的结论并排给出\n`);
      break;
    }

    case 'review': {
      const id = requireFilm(positional[0]);
      const { runReview } = await import('../scripts/guard/review.js');
      const items = await runReview(id);
      const mark = { ok: '✓', hint: '·', warn: '!' } as const;
      console.log(`\n[vw review] ${id}\n`);
      for (const it of items) console.log(`  ${mark[it.level]} ${it.topic}：${it.text}`);
      const w = items.filter((i) => i.level === 'warn').length;
      const h = items.filter((i) => i.level === 'hint').length;
      console.log(`\n  ${w} 条要处理 · ${h} 条请再想一想 —— 处理结果写进 director.md「自检记录」\n`);
      break;
    }

    case 'render': {
      const id = requireFilm(positional[0]);
      const mode = (flags['mode'] as 'master' | 'final') || 'master';
      const variant = flags['variant'] as 'trailer' | 'short' | undefined;
      const out = await runRenderPipeline({
        filmId: id,
        mode,
        variant,
        noWarp: Boolean(flags['no-warp']),
        play: Boolean(flags['play']),
        // 不传则按硬件档位取（vw hw）
        concurrency: flags['concurrency'] ? Number(flags['concurrency']) : undefined,
        crf: flags['crf'] ? Number(flags['crf']) : mode === 'final' ? 16 : 18,
      });
      console.log(`\n[vw render] 渲染完成，产物:\n  ${out}\n`);
      break;
    }

    case 'blender': {
      const action = positional[0];
      // glb 不挂在某部片上：参数是 .blend 路径
      if (action === 'glb') {
        const { exportGlb } = await import('../scripts/blender/assets.js');
        const blend = positional[1] || 'public/models/phone.blend';
        const r = exportGlb({ blend, out: flags['out'] as string | undefined, meta: flags['meta'] as string | undefined });
        console.log(`[vw blender glb] → ${path.relative(process.cwd(), r.glb)}  尺寸单源 → ${path.relative(process.cwd(), r.meta)}`);
        break;
      }
      // 场景搭建：场景 JSON → .blend（+ 预览帧），不挂在某部片上
      if (action === 'scene') {
        const { buildScene } = await import('../scripts/blender/scene.js');
        if (!flags['spec']) {
          console.error('用法: vw blender scene --spec=<场景 json> [--still=<秒>] [--samples=] [--res=960x540] [--out=x.blend]');
          process.exit(1);
        }
        const res = typeof flags['res'] === 'string' ? (String(flags['res']).split('x').map(Number) as [number, number]) : undefined;
        const r = buildScene({
          spec: String(flags['spec']),
          out: flags['out'] as string | undefined,
          still: flags['still'] !== undefined ? Number(flags['still']) : undefined,
          samples: flags['samples'] ? Number(flags['samples']) : undefined,
          res,
        });
        console.log(`[vw blender scene] → ${path.relative(process.cwd(), r.blend)}${r.png ? `，预览 ${path.relative(process.cwd(), r.png)}` : ''}`);
        break;
      }
      // 漫游机位：参数是模块路径 + 导出名，不挂在某部片的配置上
      if (action === 'flight') {
        const { runFlightExport } = await import('../scripts/blender/flight.js');
        if (!flags['module'] || !flags['export']) {
          console.error('用法: vw blender flight --module=<ts 文件> --export=<FlightPlan 导出名> [--fps=60] [--blend=场景.blend] [--out=x.blend]');
          process.exit(1);
        }
        const r = await runFlightExport({
          module: String(flags['module']),
          exportName: String(flags['export']),
          fps: flags['fps'] ? Number(flags['fps']) : undefined,
          blend: flags['blend'] as string | undefined,
          out: flags['out'] as string | undefined,
        });
        console.log(`[vw blender flight] 签名 ${r.sig}${r.blendPath ? ` → ${path.relative(process.cwd(), r.blendPath)}` : ''}`);
        break;
      }
      const id = requireFilm(positional[1]);
      if (action === 'rays') {
        const { renderRays } = await import('../scripts/blender/assets.js');
        const nums = (v: unknown, n: number) => {
          if (typeof v !== 'string') return undefined;
          const a = v.split(',').map(Number);
          return a.length === n && a.every(Number.isFinite) ? a : undefined;
        };
        if (!flags['comp']) {
          console.error('用法: vw blender rays <film> --comp=<剪影合成> [--source=0.5,0.35] [--length=0.25] [--color=1,0.85,0.55] [--gain=1.6] [--force]');
          process.exit(1);
        }
        const m = await renderRays({
          filmId: id,
          comp: String(flags['comp']),
          source: nums(flags['source'], 2) as [number, number] | undefined,
          length: flags['length'] ? Number(flags['length']) : undefined,
          color: nums(flags['color'], 3) as [number, number, number] | undefined,
          gain: flags['gain'] ? Number(flags['gain']) : undefined,
          force: Boolean(flags['force']),
        });
        console.log(`[vw blender rays] complete=${m.complete} (${m.frames} 帧) 指纹 ${m.sig}`);
        break;
      }
      if (action === 'track') {
        const p = await exportPhoneTrack(id);
        console.log(`[vw blender track] → ${p}`);
      } else if (action === 'render') {
        const res = await runBlenderRender({ filmId: id, force: Boolean(flags['force']), acceptSlow: Boolean(flags['accept-slow']) });
        console.log(
          `[vw blender render] complete=${res.complete} (${res.renderedFrames}/${res.expectedFrames} 帧), 签名 ${res.sig}` +
            (res.blenderFound ? '' : '，未检测到 Blender')
        );
      } else {
        console.log(`[vw blender] 支持: track | render | rays | glb | flight | scene`);
      }
      break;
    }

    case 'hw': {
      const { hwProfile, formatProfile } = await import('../scripts/hw/profile.js');
      console.log(`\n[vw hw] 本机硬件档位（缺省参数按它取；命令行参数与环境变量优先，VW_HW_TIER=apple|intel 可强制）\n`);
      console.log(formatProfile(hwProfile()) + '\n');
      break;
    }

    case 'py': {
      // lemo-opuscar 的 Python 工具链：环境与素材包
      const { pySetup, fetchPack, LIBS } = await import('../scripts/py/opuscar.js');
      const action = positional[0];
      if (action === 'setup') pySetup();
      else if (action === 'fetch' && positional[1] === 'instruments' && positional[2]) {
        const libs = positional[2] === 'all' ? [...LIBS] : [positional[2]];
        for (const l of libs) fetchPack(`instruments-${l}`);
      } else if (action === 'fetch' && (positional[1] === 'voice' || positional[1] === 'hdri')) fetchPack(positional[1]);
      else console.log(`[vw py] 支持: setup | fetch instruments <${LIBS.join('|')}|all> | fetch voice | fetch hdri`);
      break;
    }

    case 'voice': {
      const { voiceTts, voiceCheck, voiceSrt } = await import('../scripts/py/opuscar.js');
      const action = positional[0];
      if (action === 'tts' && positional[1]) {
        const out = typeof flags['out'] === 'string' ? flags['out'] : path.join('out', 'voice', path.basename(positional[1], '.json'));
        console.log(voiceTts(positional[1], out, flags['engine'] === 'edge' ? 'edge' : 'kokoro'));
        console.log(`[vw voice] → ${out}（下一步：vw voice check ${positional[1]} ${out}）`);
      } else if (action === 'check' && positional[1] && positional[2]) {
        const r = voiceCheck(positional[1], positional[2], typeof flags['lang'] === 'string' ? flags['lang'] : 'auto');
        console.log(r.report);
        if (!r.ok) process.exitCode = 1;
      } else if (action === 'film' && positional[1]) {
        // 一部片的口播（可选层：片子有 audio/voice.json 才有口播）
        const { voiceFilm } = await import('../scripts/py/voice-film.js');
        const id = requireFilm(positional[1]);
        const engine = flags['engine'] === 'edge' || flags['engine'] === 'kokoro' ? (flags['engine'] as 'edge' | 'kokoro') : undefined;
        const r = await voiceFilm(id, { engine });
        console.log(`\n[vw voice film] ${id}：${r.voice.lines.length} 句（${r.voice.engine}），核对未过 ${r.failed.length} 句${r.failed.length ? '：' + r.failed.join('、') : ''}；字幕 → ${path.relative(process.cwd(), r.srt)}`);
        if (r.overlaps.length) console.log(`  ⚠ 这些句子前一句没念完后一句就开口：${r.overlaps.map(([a, b]) => `${a} → ${b}`).join('、')}`);
        console.log(`  接进片子：index.tsx 的真值加 voice（import voiceData from './audio/voice.json'），FilmAudio 会播放口播、配乐自动让位\n`);
        if (r.failed.length) process.exitCode = 1;
      } else if (action === 'final' && positional[1]) {
        // 成片里的口播还听得清吗（混音之后再逐句核对一遍）
        const { voiceFinalCheck } = await import('../scripts/py/voice-film.js');
        const r = voiceFinalCheck(requireFilm(positional[1]));
        if (!r) console.log('[vw voice final] 这部片没有口播');
        else {
          console.log(r.report);
          console.log(r.ok ? '[vw voice final] 成片里每句口播都听得清' : `[vw voice final] 混音后这几句被盖住或读不清：${r.failed.join('、')}（把配乐 / 音效在口播时压低，或抬口播层）`);
          if (!r.ok) process.exitCode = 1;
        }
      } else if (action === 'srt' && positional[1] && positional[2]) {
        voiceSrt(positional[1], positional[2]);
        console.log(`[vw voice] 字幕 → ${positional[2]}`);
      } else console.log('[vw voice] 支持: film <片> [--engine=edge|kokoro] | final <片> | tts <lines.json> [--out=] [--engine=kokoro|edge] | check <lines.json> <目录> [--lang=zh|en|auto] | srt <cues.json> <out.srt>');
      break;
    }

    case 'storyboard': {
      // 分镜：用户要了才做（开工前问答里问），出图后等用户点头
      const id = positional[0];
      const shotsFile = typeof flags['shots'] === 'string' ? flags['shots'] : '';
      if (!id || !shotsFile) {
        console.error('用法: vw storyboard <片> --shots=<shots.json>（[{ at, framing, dur, line }]，6–9 格）[--cols=3]');
        process.exit(1);
      }
      const { storyboard } = await import('../scripts/look/storyboard.js');
      const r = await storyboard(id, JSON.parse(fs.readFileSync(shotsFile, 'utf-8')), { cols: flags['cols'] ? Number(flags['cols']) : undefined });
      console.log(`[vw storyboard] → ${path.relative(process.cwd(), r.file)}${r.withText ? '' : '（没有 Chrome：不带字的拼图，文字在 storyboard.md）'}。发给用户，等点头再继续`);
      break;
    }

    case 'font': {
      const action = positional[0];
      if (action === 'fetch' && positional[1]) {
        const { fetchFont } = await import('../scripts/look/fonts.js');
        const weights = flags['weights'] ? String(flags['weights']).split(',').map(Number).filter(Boolean) : undefined;
        const r = fetchFont(positional[1], { weights, italic: Boolean(flags['italic']), film: typeof flags['film'] === 'string' ? flags['film'] : undefined });
        console.log(`[vw font] ${positional[1]} → public/fonts/${r.slug}/（${r.faces.length} 个文件${r.subset ? `，子集 ${r.subset} 个字` : ''}；授权 ${r.license ?? '⚠ 没取到授权文件，确认是 OFL / Apache 再用'}）`);
        console.log(`  片子里：useLocalFonts(['${r.slug}'])（components/fonts），CSS 里用 "${positional[1]}"`);
      } else if (action === 'list') {
        const dir = path.join(process.cwd(), 'public/fonts');
        for (const d of fs.readdirSync(dir)) if (fs.existsSync(path.join(dir, d, 'faces.json'))) console.log(`  ${d}`);
      } else console.log('[vw font] 支持: fetch "<字体名>" [--weights=400,700] [--italic] [--film=<片>（中日韩字体必填，只取这部片用到的字）] | list');
      break;
    }

    case 'credits': {
      const { buildCredits } = await import('../scripts/render/credits.js');
      const c = buildCredits(requireFilm(positional[0]));
      console.log(`[vw credits] → ${path.relative(process.cwd(), c.file)}${c.ccby.length ? `（${c.ccby.length} 项 CC BY 要署名）` : ''}`);
      break;
    }

    case 'readcheck': {
      const id = requireFilm(positional[0]);
      const { runReadcheck } = await import('../scripts/guard/readcheck.js');
      const res = await runReadcheck(id, { step: flags['step'] ? Number(flags['step']) : undefined });
      console.log(`\n[vw readcheck] ${id}：${res.runs.length} 段字，${res.violations.length} 段停留不够读完 → ${path.relative(process.cwd(), res.file)}`);
      for (const v of res.violations) console.log(`  · ${v.from.toFixed(1)}–${v.to.toFixed(1)}s 停 ${v.held.toFixed(1)}s，要 ${v.need.toFixed(1)}s：${v.text.slice(0, 40)}`);
      for (const c of res.covers) console.log(`  ⚠ ${c.from.toFixed(1)}–${c.to.toFixed(1)}s 字幕压住了：${c.text.slice(0, 40)}`);
      console.log('');
      break;
    }

    case 'style': {
      const { listStyles, renderStyleSheet } = await import('../scripts/style/cli.js');
      const action = positional[0];
      if (action === 'list') {
        console.log('\n[vw style] 风格库（src/styles/）\n');
        listStyles().forEach((l) => console.log('  ' + l));
        console.log('');
      } else if (action === 'sheet' && positional[1]) {
        const out = renderStyleSheet(positional[1]);
        console.log(`[vw style] 样张 → ${path.relative(process.cwd(), out)}`);
      } else if (action === 'fork' && (positional[1] || flags['blank']) && typeof flags['id'] === 'string') {
        // 改成你自己的风格（docs/method/style-workshop.md）：先起草稿，用户点头后 keep
        const { forkStyle } = await import('../scripts/style/workshop.js');
        const id = String(flags['id']);
        const label = typeof flags['label'] === 'string' ? flags['label'] : id;
        const dir = flags['blank'] ? forkStyle(null, id, label, { technique: String(flags['technique'] ?? '') }) : forkStyle(positional[1], id, label);
        console.log(`[vw style] 草稿 → ${path.relative(process.cwd(), dir)}（STYLE.md / CHANGES.md / style.ts / README.md）。按 docs/method/style-workshop.md 和用户一题一题定，再出风格帧`);
      } else if (action === 'vs' && positional[1] && positional[2]) {
        const { styleVs } = await import('../scripts/style/workshop.js');
        const out = styleVs(positional[1], positional[2], typeof flags['out'] === 'string' ? flags['out'] : path.join(path.dirname(positional[2]), 'styleframe-vs-base.png'));
        console.log(`[vw style] 并排（左底子、右新风格）→ ${out}`);
      } else if (action === 'keep' && positional[1]) {
        const { keepStyle } = await import('../scripts/style/workshop.js');
        const dst = keepStyle(positional[1]);
        console.log(`[vw style] 已进风格库 → ${path.relative(process.cwd(), dst)}，已登记到 src/styles/index.ts。以后说「用 ${positional[1]} 风格做…」就行`);
      } else if (action === 'gallery') {
        const { buildGallery, fetchGalleryVideos } = await import('../scripts/style/gallery.js');
        if (flags['videos']) {
          // 网页版样片下到本地（约 59 支、每支几 MB），离线也能在总览页里播
          const v = fetchGalleryVideos();
          console.log(`[vw style] 样片缓存 → out/opuscar/films/：新下 ${v.fetched}，已有 ${v.skipped}${v.failed.length ? `，失败 ${v.failed.join('、')}` : ''}`);
        }
        const r = buildGallery();
        console.log(`[vw style] 风格库总览（${r.count} 个）→ ${path.relative(process.cwd(), r.file)}（浏览器直接打开）`);
        if (flags['open']) (await import('node:child_process')).execFileSync('open', [r.file]);
      } else if (action === 'index') {
        const { writeStyleIndex } = await import('../scripts/style/index-md.js');
        console.log(`[vw style] 风格索引 → ${path.relative(process.cwd(), writeStyleIndex())}`);
      } else if (action === 'demo' && positional[1]) {
        // 收录风格（lemo-opuscar）的样片源码：读来学手法，不在本工程里渲
        const { fetchDemo } = await import('../scripts/style/import-opuscar.js');
        const dir = fetchDemo(positional[1]);
        console.log(`[vw style] 样片源码 → ${path.relative(process.cwd(), dir)}（入口 index.html；配乐 / 混音脚本、字体、CREDITS 都在里面）`);
      } else if (action === 'save' && positional[1] && typeof flags['id'] === 'string') {
        const { saveStyle } = await import('../scripts/style/save.js');
        const film = requireFilm(positional[1]);
        const id = String(flags['id']);
        const res = await saveStyle(film, id, typeof flags['label'] === 'string' ? flags['label'] : id);
        console.log(`\n[vw style] 已沉淀 ${film} 的主题 → ${path.relative(process.cwd(), res.dir)}（参考帧 ${res.refs} 张${res.refs ? '' : '：还没出片，出片后再补'}），已登记到 src/styles/index.ts`);
        console.log(`  下一步：按成片和用户的话写满 STYLE.md 十一节、CHANGES.md、README.md，挑一帧存成 refs/styleframe.png，再 vw style sheet ${id} 看样张，最后 vw style index 更新索引\n`);
      } else {
        console.log('[vw style] 支持: list | sheet <id> | demo <id> | fork <底子> --id= [--label=] | fork --blank --technique=<底子> --id= | vs <底子帧> <新帧> | keep <id> | save <film> --id=');
      }
      break;
    }

    case 'handoff': {
      const { handoff } = await import('../scripts/hybrid/splice.js');
      const id = requireFilm(positional[0]);
      if (flags['at'] === undefined) {
        console.error('用法: vw handoff <film> --at=<放映秒> [--label=]');
        process.exit(1);
      }
      const r = await handoff(id, Number(flags['at']), flags['label'] as string | undefined);
      console.log(`[vw handoff] 交接帧 → ${path.relative(process.cwd(), r.out)}（喂给视频模型当首帧）`);
      console.log(`             这一刻在幕 [${r.sceneId}] 的第 ${r.localScoreSec}s（乐谱 ${r.scoreSec.toFixed(3)}s）—— VideoInsert 的 at 写这个`);
      break;
    }

    case 'insert': {
      const { insertAdd, locateFilmSec } = await import('../scripts/hybrid/splice.js');
      const action = positional[0];
      const id = requireFilm(positional[1]);
      if (action !== 'add' || !flags['clip']) {
        console.error('用法: vw insert add <film> --clip=<mp4> [--label=] [--at=<放映秒>]');
        process.exit(1);
      }
      const r = insertAdd(id, String(flags['clip']), flags['label'] as string | undefined);
      console.log(`[vw insert] 已规整导入 → public/${r.src}（${r.durSec}s，1920×1080，h264，无音轨）`);
      if (flags['at'] !== undefined) {
        const loc = await locateFilmSec(id, Number(flags['at']));
        console.log(`             在幕 [${loc.sceneId}] 里放：<VideoInsert src="${r.src}" at={${loc.localScoreSec}} durSec={${r.durSec}} />`);
        console.log(`             片段区间建议在适配器 zones() 里划成 'video'（刚性），对拍时不拉伸它周围的编舞`);
      }
      break;
    }

    case 'seam': {
      const { seam } = await import('../scripts/hybrid/splice.js');
      const id = requireFilm(positional[0]);
      if (!flags['clip'] || flags['at'] === undefined) {
        console.error('用法: vw seam <film> --clip=<mp4> --at=<放映秒> [--return=<放映秒>]');
        process.exit(1);
      }
      const r = await seam(id, String(flags['clip']), Number(flags['at']), flags['return'] !== undefined ? Number(flags['return']) : undefined);
      const icon = (l: string) => (l === 'ok' ? '✓' : l === 'mask' ? '⚠' : '✗');
      console.log(`[vw seam] 进场接缝 ${icon(r.in.level)} ${r.in.note}`);
      if (r.out) console.log(`[vw seam] 出场接缝 ${icon(r.out.level)} ${r.out.note}`);
      console.log(`          对比图在 out/${id}/seam/`);
      break;
    }

    case 'archive': {
      const { archiveSave, archiveRemove, readArchiveIndex } = await import('../scripts/render/archive.js');
      const action = positional[0];
      if (action === 'save') {
        const id = requireFilm(positional[1]);
        const e = archiveSave({ film: id, label: flags['label'] as string | undefined, src: flags['src'] as string | undefined });
        console.log(`[vw archive] 已封存 ${e.film}「${e.label}」→ public/${e.file}（${e.durationSec}s @${e.fps}fps，sha1 ${e.sha1}，只读）`);
        console.log(`             Studio 里看 ${e.film}-Archive-${e.label} / ${e.film}-Compare-${e.label}`);
      } else if (action === 'list') {
        const entries = readArchiveIndex().entries.filter((e) => !positional[1] || e.film === positional[1]);
        if (!entries.length) console.log('[vw archive] 还没有封存');
        for (const e of entries) console.log(`  ${e.film}  ${e.label.padEnd(16)} ${e.durationSec}s  ${e.savedAt.slice(0, 16)}  ${e.file}`);
      } else if (action === 'remove') {
        const id = requireFilm(positional[1]);
        const label = positional[2];
        if (!label) {
          console.error('用法: vw archive remove <film> <标签>');
          process.exit(1);
        }
        console.log(archiveRemove(id, label) ? `[vw archive] 已解除封存 ${id}「${label}」` : `[vw archive] 没有这份封存`);
      } else {
        console.log('[vw archive] 支持: save <film> [--label=] [--src=] | list [film] | remove <film> <标签>');
      }
      break;
    }

    case 'sfx': {
      const action = positional[0];
      if (action === 'kenney') {
        const { syncKenney, KENNEY_PACKS } = await import('../scripts/epidemic/cc0.js');
        if (positional[1] !== 'sync') {
          console.error('用法: vw sfx kenney sync [包…]');
          process.exit(1);
        }
        const res = syncKenney(positional.length > 2 ? positional.slice(2) : KENNEY_PACKS);
        console.log(`\n[vw sfx kenney] 已索引 ${res.files} 个文件，来自 ${res.packs.join(', ')}` + (res.skipped.length ? `\n  跳过：${res.skipped.join('；')}` : '') + '\n');
        break;
      }
      if (action === 'freesound') {
        const fsAuth = await import('../scripts/epidemic/cc0.js');
        if (positional[1] === 'auth' && flags['code']) {
          const r = fsAuth.freesoundAuthorize(String(flags['code']));
          console.log(`\n[vw sfx freesound] 授权成功，令牌已存 .env.freesound-oauth.json（权限 600），访问令牌到 ${new Date(r.expiresAt).toLocaleString()}，过期自动续期\n`);
        } else if (positional[1] === 'auth') {
          console.log(`\n[vw sfx freesound] 在浏览器里打开下面的地址、点 Authorize，页面会显示授权码（10 分钟内有效）：\n\n  ${fsAuth.freesoundAuthUrl()}\n\n然后运行: vw sfx freesound auth --code=<授权码>\n`);
        } else if (positional[1] === 'status') {
          console.log(`[vw sfx freesound] ${fsAuth.freesoundAuthStatus()}`);
        } else {
          console.error('用法: vw sfx freesound auth [--code=<授权码>] | status');
          process.exit(1);
        }
        break;
      }
      const id = requireFilm(positional[1]);
      const rest = positional.slice(2);
      const film = getFilm(id);
      const adapter = await film.getAdapter();
      const truthMgr = new TruthManager(id);

      if (action === 'search') {
        const res = searchSlots(adapter, rest, {
          forceLocal,
          source: flags['source'] as SfxSource | undefined,
          keep: flags['keep'] ? Number(flags['keep']) : undefined,
          preview: flags['preview'] ? Number(flags['preview']) : undefined,
        });
        console.log(`\n[vw sfx search] provider=${res.provider}，共处理 ${Object.keys(res.bySlot).length} 个槽\n`);
      } else if (action === 'pick') {
        const res = pickAll(adapter, rest, { forceLocal, source: flags['source'] as SfxSource | undefined });
        console.log(
          `\n[vw sfx pick] provider=${res.provider}，落定 ${Object.keys(res.picked).length} 个槽` +
            (res.missing.length ? `，缺素材 ${res.missing.join(', ')}` : '') +
            `\n  下一步: vw sfx plan ${id}\n`
        );
      } else if (action === 'plan') {
        const truth = truthMgr.readAll();
        /**
         * SPOT_NO_PLAN=1：不把上一版计划当成已挂载（附录 B）。
         * 平时要带 prevPlan —— 同 key 沿用上一版文件、手动调的偏移/增益按 key 迁移。
         * 想从零重排（比如换了一整套素材）才关掉它。
         */
        const noPrevPlan = process.env.SPOT_NO_PLAN === '1' || process.env.SPOT_NO_PLAN === 'true';
        if (noPrevPlan) console.log('[vw sfx plan] SPOT_NO_PLAN=1：忽略上一版计划，从零重排');
        const { plan, skippedCovered, skippedUnpurchased, byLayer } = buildSfxPlan(adapter, {
          prevPlan: noPrevPlan ? undefined : truth.plan,
          // 音效桥要看 music.json 里哪些段的衔接是 bridge
          music: truth.music,
        });
        const { dropped } = migrateParamsToPlan(plan, truth);
        truthMgr.write('plan', plan);
        truthMgr.write('offsets', truth.offsets);
        truthMgr.write('gains', truth.gains);
        truthMgr.write('fades', truth.fades);
        truthMgr.write('ducks', truth.ducks);
        console.log(`\n[vw sfx plan] 影片 ${id}`);
        console.log(`  ✓ ${plan.length} 条计划 (${Object.entries(byLayer).map(([l, n]) => `${l} ${n}`).join(' / ')})`);
        console.log(`  - 跳过已覆盖 ${skippedCovered.length} 条；未采购 ${skippedUnpurchased.length} 条；清理孤儿调参 ${dropped.length} 项`);
        for (const item of plan) {
          console.log(
            `    · ${item.key} @ ${item.fromSec}s +${item.durSec}s ` +
              `vol ${item.volume} startFrom ${item.startFromSec}s${item.loop ? ' (loop)' : ''}`
          );
        }
        console.log('');
      } else if (action === 'use') {
        const [slot, candId] = rest;
        if (!slot || !candId) {
          console.error('用法: vw sfx use <film> <槽> <候选id>');
          process.exit(1);
        }
        const ok = promoteCandidate(id, slot, candId);
        console.log(ok ? `[vw sfx use] 已把 ${candId} 顶到槽 ${slot} 首位` : `[vw sfx use] 没找到该候选`);
      } else if (action === 'add') {
        // §15.3 的 add <槽> "<标题>"：按标题把候选顶到首位（use 是按 id）
        const slot = rest[0];
        const title = rest.slice(1).join(' ').trim();
        if (!slot || !title) {
          console.error('用法: vw sfx add <film> <槽> "<标题>"');
          process.exit(1);
        }
        const list = readPool(id)[slot] ?? [];
        const needle = title.toLowerCase();
        const exact = list.filter((c) => c.title.toLowerCase() === needle);
        const fuzzy = exact.length ? exact : list.filter((c) => c.title.toLowerCase().includes(needle));
        if (fuzzy.length === 0) {
          console.error(`[vw sfx add] 槽 ${slot} 里没有标题含「${title}」的候选（共 ${list.length} 条）`);
          process.exit(1);
        }
        if (fuzzy.length > 1) {
          // 多条命中时不替人做主，列出来让人用 use 指定 id
          console.error(`[vw sfx add] 「${title}」命中 ${fuzzy.length} 条，请用 vw sfx use 指定 id：`);
          fuzzy.forEach((c) => console.error(`    ${c.id}  ${c.title}`));
          process.exit(1);
        }
        promoteCandidate(id, slot, fuzzy[0].id);
        console.log(`[vw sfx add] 已把「${fuzzy[0].title}」顶到槽 ${slot} 首位`);
      } else if (action === 'similar') {
        const slot = rest[0];
        if (!slot) {
          console.error('用法: vw sfx similar <film> <槽> [--seed=<候选id>] [--first=12]');
          process.exit(1);
        }
        const r = searchSimilarForSlot(adapter, slot, {
          forceLocal,
          seedId: flags['seed'] as string | undefined,
          first: flags['first'] ? Number(flags['first']) : undefined,
        });
        console.log(r.ok
          ? `[vw sfx similar] 槽 ${slot}: 新增 ${r.added} 条，共 ${r.total} 条（追加在末尾，不动首位）`
          : `[vw sfx similar] ${r.error}`);
      } else if (action === 'backfill') {
        const min = flags['min'] ? Number(flags['min']) : 4;
        const r = backfillSlots(adapter, {
          forceLocal,
          min,
          keep: flags['keep'] ? Number(flags['keep']) : undefined,
          preview: flags['preview'] ? Number(flags['preview']) : undefined,
        });
        console.log(`\n[vw sfx backfill] 扫 ${r.scanned} 个槽，候选少于 ${min} 条的补搜:`);
        if (r.refilled.length === 0) console.log('  没有需要补的槽');
        r.refilled.forEach((x) => console.log(`  ${x.slot}: ${x.before} → ${x.after}`));
        console.log('');
      } else if (action === 'probe') {
        // §15.3 的 probe：看一眼采购单、候选池、素材是否对得上
        const pool = readPool(id);
        const slots = Object.keys(adapter.palette);
        let noCand = 0;
        let noAsset = 0;
        console.log(`\n[vw sfx probe] 影片 ${id}，采购单 ${slots.length} 个槽:`);
        for (const slot of slots) {
          const spec = adapter.palette[slot];
          const n = pool[slot]?.length ?? 0;
          const files = Array.from({ length: spec.variants }, (_, i) =>
            spec.variants > 1
              ? `sfx-lib/epidemic/${slot}-${i + 1}.wav`
              : `sfx-lib/epidemic/${slot}.wav`
          );
          const have = files.filter((f) => fs.existsSync(path.join(process.cwd(), 'public', f))).length;
          if (n === 0) noCand++;
          if (have < spec.variants) noAsset++;
          console.log(
            `  ${slot.padEnd(22)} 层=${String(spec.layer).padEnd(7)} 候选=${String(n).padStart(3)} ` +
              `素材=${have}/${spec.variants}${n === 0 ? '  ⚠ 没候选' : ''}${have < spec.variants ? '  ⚠ 缺素材' : ''}`
          );
        }
        console.log(`\n  合计: ${noCand} 个槽没候选，${noAsset} 个槽缺素材\n`);
      } else if (action === 'swap') {
        const [slot, newFile] = rest;
        if (!slot || !newFile) {
          console.error('用法: vw sfx swap <film> <槽> <新文件>');
          process.exit(1);
        }
        await swapSlotAsset(id, slot, newFile);
      } else if (action === 'tune') {
        const key = rest[0];
        if (!key) {
          console.error('用法: vw sfx tune <film> <key> [--offset=] [--gain=] [--fade-in=] [--fade-out=]');
          process.exit(1);
        }
        const truth = truthMgr.readAll();
        if (!truth.plan.some((p) => p.key === key)) {
          console.error(`[vw sfx tune] 计划里没有 key '${key}'（避免写出孤儿调参）`);
          process.exit(1);
        }
        if (flags['offset'] !== undefined) {
          truth.offsets[key] = Number(flags['offset']);
          truthMgr.write('offsets', truth.offsets);
          console.log(`  ✓ offset: ${key} = ${flags['offset']}s`);
        }
        if (flags['gain'] !== undefined) {
          truth.gains[key] = Number(flags['gain']);
          truthMgr.write('gains', truth.gains);
          console.log(`  ✓ gain: ${key} = ${flags['gain']}dB`);
        }
        if (flags['fade-in'] !== undefined) {
          truth.fades.in[key] = Number(flags['fade-in']);
          truthMgr.write('fades', truth.fades);
          console.log(`  ✓ fadeIn: ${key} = ${flags['fade-in']}s`);
        }
        if (flags['fade-out'] !== undefined) {
          truth.fades.out[key] = Number(flags['fade-out']);
          truthMgr.write('fades', truth.fades);
          console.log(`  ✓ fadeOut: ${key} = ${flags['fade-out']}s`);
        }
      } else if (action === 'candidates') {
        const pool = readPool(id);
        const slots = rest.length ? rest : Object.keys(pool);
        for (const slot of slots) {
          const list = pool[slot] ?? [];
          console.log(`\n[${slot}] ${list.length} 条候选:`);
          list.slice(0, 10).forEach((c, i) =>
            console.log(
              `  ${i === 0 ? '▶' : ' '} [${i}] ${c.title} 分=${c.score}` +
                (c.feat ? ` (起音 ${c.feat.attackMs}ms / 亮度 ${c.feat.bright} / 起势 ${c.feat.rise})` : '')
            )
          );
        }
        console.log('');
      } else {
        console.log(`[vw sfx] 支持: search | pick | plan | use | swap | tune | candidates`);
      }
      break;
    }

    case 'music': {
      const action = positional[0];
      const id = requireFilm(positional[1]);
      const rest = positional.slice(2);

      if (action === 'match') {
        await matchMusicForFilm(id, {
          forceLocal,
          source: flags['source'] === 'freesound' ? 'freesound' : undefined,
          brief: typeof flags['brief'] === 'string' ? flags['brief'] : undefined,
          orchestra: flags['sampled'] ? ((typeof flags['sampled'] === 'string' ? flags['sampled'] : 'cinematic') as 'cinematic' | 'mallets' | 'chamber') : undefined,
          // --bpm=108 定速；--bpm=100-112 限定范围（在范围里按画面拍点拟合）
          bpmRange: typeof flags['bpm'] === 'string' || typeof flags['bpm'] === 'number'
            ? (String(flags['bpm']).split('-').map(Number).concat(Number(String(flags['bpm']).split('-').pop()))).slice(0, 2) as [number, number]
            : undefined,
        });
      } else if (action === 'score') {
        const { renderFilmScore } = await import('../scripts/composer/score-film.js');
        const r = await renderFilmScore(id);
        for (const p of r.problems) console.warn(`  ! ${p}`);
        console.log(`[vw music score] ${id}：${r.notes} 个音 · ${r.grid.spec.bpm} BPM · 调 ${r.grid.spec.key} · ${r.durSec.toFixed(2)} 秒 → public/${r.file}`);
        console.log(`  乐器：${r.instruments.join('、')}`);
        console.log(`  music.json 已写回（来源：按片作曲），对拍映射已清成恒等（${r.grid.spec.lock === false ? '谱贴着画面写' : '画面锁在网格上'}）。下一步：vw sfx plan ${id} → vw check ${id}\n`);
      } else if (action === 'compose') {
        const res = await generateFilmScoreWav(id);
        console.log(`[vw music compose] → ${res.outputPath}`);
      } else if (action === 'search') {
        const cueId = rest[0] ?? 'c1';
        const film = getFilm(id);
        const adapter = await film.getAdapter();
        const truth = new TruthManager(id).readAll();
        const cue = truth.music.cues.find((c) => c.id === cueId);
        if (!cue) {
          console.error(`[vw music search] 没有配乐段 '${cueId}'`);
          process.exit(1);
        }
        const svc = new EpidemicMusicService();
        if (!svc.available()) {
          console.error(
            `[vw music search] 需要 EPIDEMIC_SOUND_API_KEY（环境变量或 .env）。` +
              `\n  没有凭据时为这部片写 audio/score.ts、跑 'vw music score ${id}'（按片作曲）；'vw music match ${id} --local' 是通用模板，只作兜底。`
          );
          process.exit(1);
        }
        const hits = adapter.hits();
        // --q 覆盖段的 brief（工作台的检索框走这条）
        const term = (flags['q'] as string) || cue.brief || cue.label;
        /**
         * --no-grid-fit 关掉「按拍点选速度」（§18.3 的开关）：
         *   开着时用网格代价挑速度，关掉就退回朴素的 bpm 接近度。
         * --continuity 把**上一段**的曲目作为接续参考（速度 / 调性 / 同艺人）。
         */
        const prevCue = truth.music.cues[truth.music.cues.findIndex((c) => c.id === cueId) - 1];
        const wantContinuity = Boolean(flags['continuity']) && Boolean(prevCue?.track);
        const cands = svc.search(term, {
          targetDurationSec: cue.out.sec - cue.in.sec,
          useGridFit: flags['no-grid-fit'] ? false : true,
          gridHits: hits,
          dropSec: cue.climax?.sec ?? cue.in.sec,
          limit: flags['limit'] ? Number(flags['limit']) : undefined,
          prevTrack: wantContinuity
            ? {
                id: prevCue!.track!.id,
                title: prevCue!.track!.title,
                artist: prevCue!.track!.artist,
                bpm: prevCue!.track!.bpm,
                key: prevCue!.track!.key,
                durationSec: prevCue!.track!.durationSec,
              }
            : undefined,
        });
        if (flags['continuity'] && !wantContinuity) {
          console.warn(`  （上一段没有曲目，接续参考跳过）`);
        }
        // 顺手把前几名的预览缓存下来，之后比选改编要靠它分析原曲段落
        cands.slice(0, 6).forEach((c) => svc.cachePreview(c.id, c.previewUrl));

        /**
         * --json：把候选写到 out/<片>/music-search.json。
         * 工作台走这条路 —— MCP 客户端是同步 curl，在单线程的后端里直调会
         * 把整个服务阻塞十几秒（实测 14.7s，期间连 /api/state 都拿不到）。
         * 丢给子进程、前端读文件，服务就不会卡。
         */
        if (flags['json']) {
          const out = path.join(process.cwd(), 'out', id, 'music-search.json');
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(
            out,
            JSON.stringify({ cue: cueId, at: new Date().toISOString(), candidates: cands }, null, 2),
            'utf-8'
          );
          console.log(`✓ 候选 ${cands.length} 条 → out/${id}/music-search.json`);
          break;
        }

        console.log(`\n[vw music search] 段 ${cueId} 候选 ${cands.length} 首:`);
        cands.slice(0, 12).forEach((c, i) =>
          console.log(`  [${i}] ${c.title}${c.artist ? ` · ${c.artist}` : ''} mscore=${c.mscore} (${c.durationSec.toFixed(1)}s)`)
        );
        console.log('');
      } else if (
        action === 'prepare' ||
        action === 'adapt' ||
        action === 'choose' ||
        action === 'full' ||
        action === 'remove' ||
        action === 'gc'
      ) {
        await handleMusicLibrary(action, id, rest, flags);
      } else if (action === 'similar') {
        // 相似选曲：以段上曲目（或 --track）为种子
        const cueId2 = rest[0] ?? 'c1';
        const truth2 = new TruthManager(id).readAll();
        const cue2 = truth2.music.cues.find((c) => c.id === cueId2);
        if (!cue2) {
          console.error(`[vw music similar] 没有配乐段 '${cueId2}'`);
          process.exit(1);
        }
        const seed = (flags['track'] as string) ?? cue2.track?.id;
        if (!seed) {
          console.error(`[vw music similar] 段 ${cueId2} 没绑曲目，用 --track=<id> 指定种子`);
          process.exit(1);
        }
        const svc2 = new EpidemicMusicService();
        const sim = svc2.searchSimilar(seed, {
          targetDurationSec: cue2.out.sec - cue2.in.sec,
          limit: flags['first'] ? Number(flags['first']) : 20,
        });
        sim.slice(0, 6).forEach((c) => svc2.cachePreview(c.id, c.previewUrl));
        if (flags['json']) {
          const out = path.join(process.cwd(), 'out', id, 'music-search.json');
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(
            out,
            JSON.stringify({ cue: cueId2, at: new Date().toISOString(), candidates: sim }, null, 2),
            'utf-8'
          );
          console.log(`✓ 相似 ${sim.length} 条 → out/${id}/music-search.json`);
          break;
        }
        // --track 指定种子时不能显示段上旧曲目的名字，那是另一首
        const seedName = seed === cue2.track?.id ? cue2.track.title : seed.slice(0, 8);
        console.log(`\n[vw music similar] 以「${seedName}」为种子，${sim.length} 条:`);
        sim.slice(0, 12).forEach((c, i) =>
          console.log(`  [${i}] ${c.title}${c.artist ? ' · ' + c.artist : ''} · ${c.bpm}bpm · ${c.durationSec.toFixed(0)}s`)
        );
        console.log('');
      } else if (action === 'cue') {
        await handleCueOps(id, rest, flags);
      } else if (action === 'short') {
        // 衍生片配乐：先出配乐、实测它的 drop，画面的小节网格再跟着排
        const { buildShortMusic } = await import('../scripts/music/short-music.js');
        const bpm = flags['bpm'] ? Number(flags['bpm']) : 108;
        const bars = flags['bars'] ? Number(flags['bars']) : 10;
        const targetSec = Math.round(((60 / bpm) * 4 * bars) * 10000) / 10000;
        await buildShortMusic({
          filmId: id,
          targetSec,
          bpm,
          srcRel: (flags['src'] as string) || `music/${id}-theme-main.wav`,
          preferDropSec: flags['drop'] ? Number(flags['drop']) : (60 / bpm) * 4 * 4,
          outRel: `music/${id}-short.wav`,
        });
      } else if (action === 'plan') {
        // §16.7 P4：按幕表 + P0 拍点排出一套缺省配乐段
        const { defaultMusicPlan } = await import('../scripts/spot/music-plan.js');
        const film = getFilm(id);
        const adapter = await film.getAdapter();
        const truthMgr = new TruthManager(id);
        const planned = defaultMusicPlan(adapter, {
          minCueSec: flags['min'] ? Number(flags['min']) : 8,
        });
        console.log(`\n[vw music plan] 按幕表与 P0 拍点排出 ${planned.cues.length} 段:`);
        planned.cues.forEach((c) =>
          console.log(
            `  [${c.id}] ${c.in.sec.toFixed(2)}→${c.out.sec.toFixed(2)}s  ` +
              `in=${c.in.ref} out=${c.out.ref}  高潮=${c.climax?.ref ?? '—'}` +
              `  第二=${c.climax2?.ref ?? '—'}  衔接=${c.join?.kind ?? 'cut'}`
          )
        );
        if (flags['apply']) {
          // 已有段的曲目信息要保住，只换区间与高潮绑定
          const old = truthMgr.readAll().music;
          for (const c of planned.cues) {
            const prev = old.cues.find((o) => o.id === c.id);
            if (prev?.track) c.track = prev.track;
          }
          truthMgr.write('music', planned);
          console.log(`\n  ✓ 已写回 music.json（原有曲目绑定保留）\n`);
        } else {
          console.log(`\n  （这是预览；加 --apply 才写回 music.json）\n`);
        }
      } else if (action === 'align') {
        // §16.7 P4：把段入点吸附到配乐的小节头
        const { alignAllCues } = await import('../scripts/spot/music-plan.js');
        const { analyzeCue } = await import('../scripts/sync/analyze.js');
        const truthMgr = new TruthManager(id);
        const truth = truthMgr.readAll();
        const { music, reports } = alignAllCues(truth.music, (cue) =>
          analyzeCue(id, cue.id, cue.track?.file, cue.track?.bpm ?? 108, cue.out.sec - cue.in.sec)
        );
        console.log(`\n[vw music align] 段入点对齐首小节:`);
        reports.forEach((r) =>
          console.log(
            `  [${r.cueId}] startFrom ${r.fromSec} → ${r.alignedSec}` +
              `（位移 ${(r.deltaSec * 1000).toFixed(0)}ms，吸附到${r.snappedTo === 'bar' ? '小节头' : r.snappedTo === 'beat' ? '拍' : '未吸附'}）` +
              (r.reason ? `  ${r.reason}` : '')
          )
        );
        if (flags['apply']) {
          truthMgr.write('music', music);
          console.log(`\n  ✓ 已写回 music.json\n`);
        } else {
          console.log(`\n  （这是预览；加 --apply 才写回）\n`);
        }
      } else if (action === 'cut') {
        const { cutMusic } = await import('../scripts/music/cut.js');
        const res = cutMusic({
          srcRel: String(flags['src'] ?? `music/${id}-theme-main.wav`),
          outRel: String(flags['out'] ?? `music/${id}-cut.wav`),
          targetSec: Number(flags['len'] ?? 30),
          dropAtSec: Number(flags['drop'] ?? 8),
          nominalBpm: flags['bpm'] ? Number(flags['bpm']) : 108,
        });
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(
          `[vw music] 支持: search | similar | match | compose | cue | plan | align | short | cut\n` +
            `           prepare | adapt | choose | full | remove | gc`
        );
      }
      break;
    }

    case 'sync': {
      const action = positional[0] || 'solve';
      const id = requireFilm(positional[1]);
      const film = getFilm(id);
      const adapter = await film.getAdapter();
      const truthMgr = new TruthManager(id);
      const truth = truthMgr.readAll();

      const { analyzeCue } = await import('../scripts/sync/analyze.js');
      const { solveCues, toSyncFile } = await import('../scripts/sync/solve.js');
      const { scanBpmGrid } = await import('../scripts/sync/bpmfit.js');
      const { computeMscore } = await import('../scripts/sync/mscore.js');

      const hits = adapter.hits();
      const dropHit = hits.find((h) => h.want === 'drop') || hits[0];
      const dropSec = dropHit ? dropHit.filmSec ?? dropHit.sec : 0;

      if (action === 'analyze') {
        console.log(`\n[vw sync analyze] 影片 ${id}`);
        for (const cue of truth.music.cues) {
          const g = analyzeCue(id, cue.id, cue.track?.file, cue.track?.bpm ?? 108, cue.out.sec - cue.in.sec);
          console.log(`\n  段 ${cue.id} (${cue.track?.file ?? '未配曲'}) 来源=${g.source}`);
          console.log(`    - BPM ${g.bpm}（拍 ${(g.beatSec * 1000).toFixed(1)}ms / 小节 ${g.barSec.toFixed(3)}s）`);
          if (g.periodR !== undefined) console.log(`    - 自相关 r=${g.periodR}，首拍相位 ${g.beatOffsetSec}s`);
          console.log(`    - drop ${g.dropSec}s；拍 ${g.beats.length} / 小节头 ${g.downbeats.length}`);
          if (g.sections) {
            console.log(`    - 段落 ${g.sections.length} 段: ${g.sections.map((s) => `${s.kind}@${s.startSec}s(${s.bars}小节,能量${s.energy})`).join(' → ')}`);
          }
          if (g.jumps?.length) console.log(`    - 强跃升候选: ${g.jumps.join(', ')}s`);
          if (g.source === 'synthetic') console.log(`    ⚠ 没有可解码的音频，以上是合成等距网格`);
        }
        console.log('');
      } else if (action === 'scan-bpm') {
        const scan = scanBpmGrid(hits, dropSec);
        console.log(`\n[vw sync scan-bpm] 影片 ${id}，高潮原点 ${dropSec.toFixed(2)}s，视觉拍点 ${hits.length} 个`);
        scan.bestCandidates.forEach((c, i) =>
          console.log(
            `  TOP ${i + 1}: BPM ${c.bpm} 拟合 ${c.fitScore} 分（代价 ${c.gridCostFrames} 帧），窗口 ${c.window[0]}–${c.window[1]}`
          )
        );
        console.log('');
      } else if (action === 'mscore') {
        const b = computeMscore(
          {
            id: 'probe',
            title: '选曲打分演算',
            artist: '',
            bpm: flags['bpm'] ? Number(flags['bpm']) : 108,
            key: (flags['key'] as string) || '8A',
            durationSec: adapter.timeline.totalSeconds + 10,
            hasVocals: Boolean(flags['vocals']),
          },
          {
            useGridFit: true,
            gridHits: hits,
            dropSec,
            targetDurationSec: adapter.timeline.totalSeconds,
          }
        );
        console.log(`\n[vw sync mscore] 综合 ${b.mscore} = 情绪 ${b.mood}·0.3 + 流派 ${b.genre}·0.15 + 速度 ${b.speed}·0.2 + 长度 ${b.length}·0.15 + 排名 ${b.rank}·0.2 − 人声 ${b.vocalPenalty}\n`);
      } else if (action === 'solve') {
        const report = solveCues(
          truth.music.cues,
          hits,
          (cue) => analyzeCue(id, cue.id, cue.track?.file, cue.track?.bpm ?? 108, cue.out.sec - cue.in.sec),
          adapter.zones(),
          30
        );
        truth.sync = toSyncFile(report, hits, truth.music.cues);
        truthMgr.write('sync', truth.sync);

        console.log(`\n[vw sync solve] 影片 ${id}（网格来源 ${report.gridSource}）`);
        console.log(`  - scoreSync ${report.scoreSync}；拍点 ${report.totalHits} 个`);
        console.log(`  - 锚定 ${report.matchedCount} / 降级 ${report.downgradedCount} / 放弃 ${report.droppedCount}`);
        report.anchors.forEach((a) =>
          console.log(
            `    ✓ [${a.priority}] ${a.hitId}: 乐谱 ${a.filmSec.toFixed(2)}s → 音乐 ${a.musicSec.toFixed(2)}s ` +
              `(位移 ${(a.deltaSec * 1000).toFixed(0)}ms, 残差 ${(a.residualSec * 1000).toFixed(0)}ms) [${a.matchedKind}]${a.downgraded ? ' 降级' : ''}`
          )
        );
        report.droppedHits.forEach((d) => console.log(`    ⚠ 放弃 [${d.priority}] ${d.hitId}: ${d.reason}`));
        if (report.zoneReport) {
          console.log(`  - 弹性用量: 最大比率 ${(report.zoneReport.maxRatio * 100).toFixed(2)}%，总位移 ${report.zoneReport.totalDeltaSec}s`);
          report.zoneReport.zones
            .filter((z) => Math.abs(z.deltaSec) > 1e-6)
            .forEach((z) => console.log(`    · ${z.name} (${z.kind}): ${z.deltaSec}s，比率 ${(z.ratio * 100).toFixed(2)}% / 上限 ${(z.cap * 100).toFixed(0)}%`));
        }
        console.log(`  ✓ 已写回 src/films/${id}/audio/sync.json\n`);
      } else if (action === 'surgery') {
        /**
         * 乐句重排 (§16.4)：Adapt 之后用，把「第二高潮」也挪到画面要的位置上。
         * 一插一删的整小节重排 —— 主 drop 不动，只在 drop 之后动刀。
         */
        const { runSurgery } = await import('../scripts/sync/surgery.js');
        const cueId = positional[2] ?? 'c1';
        const cue = truth.music.cues.find((c) => c.id === cueId);
        if (!cue?.track?.file) {
          console.error(`[vw sync surgery] 段 ${cueId} 还没配曲`);
          process.exit(1);
        }
        // 目标：段内的第二高潮位置（climax2），没写就用 --at
        const targetSec =
          flags['at'] !== undefined
            ? Number(flags['at'])
            : cue.climax2
              ? cue.climax2.sec - cue.in.sec
              : NaN;
        if (Number.isNaN(targetSec)) {
          console.error(
            `[vw sync surgery] 段 ${cueId} 没有 climax2，用 --at=<段内秒> 指定第二高潮要落在哪`
          );
          process.exit(1);
        }

        const r = runSurgery(cue.track.file, targetSec, { nominalBpm: cue.track.bpm });
        if (!r.ok) {
          console.error(`[vw sync surgery] 没做: ${r.reason}`);
          process.exit(1);
        }
        console.log(`\n[vw sync surgery] 段 ${cueId} 第二高潮 → ${targetSec.toFixed(2)}s`);
        console.log(`  刀口 ${r.recipe?.cutSec.toFixed(3)}s，${r.recipe?.barsDelta} 小节` +
          `（${(r.recipe?.barsDelta ?? 0) > 0 ? '插入' : '删除'}）`);
        console.log(`  验证: 主 drop 误差 ${r.dropErrBeats} 拍，第二高潮误差 ${r.secondErrBeats} 拍` +
          `，接缝在历史跳变的第 ${r.seamPercentile} 百分位`);
        console.log(`  产物 ${r.file}`);

        if (flags['apply'] && r.file) {
          cue.track.file = r.file;
          cue.track.surgeryApplied = true;
          truthMgr.write('music', truth.music);
          console.log(`  ✓ 已写回 music.json（段 ${cueId} 改用重排后的文件）\n`);
        } else {
          console.log(`  （加 --apply 才写回 music.json）\n`);
        }
      } else if (action === 'clear') {
        const { clearSync } = await import('../scripts/sync/solve.js');
        clearSync(id, adapter.timeline.totalSeconds);
        console.log(`[vw sync clear] 影片 '${id}' 已恢复恒等映射。`);
      } else {
        console.log(`[vw sync] 支持: analyze | scan-bpm | mscore | solve | surgery | clear`);
      }
      break;
    }

    case 'spot': {
      const action = positional[0];
      const id = requireFilm(positional[1]);
      if (action === 'sync-choreo' || action === 'sync') {
        const { syncChoreography } = await import('../scripts/spot/sync-choreo.js');
        await syncChoreography(id, { forceLocal });
      } else if (action === 'sheet') {
        const { writeSpotSheet } = await import('../scripts/spot/sheet.js');
        const film = getFilm(id);
        const adapter = await film.getAdapter();
        const r = writeSpotSheet(adapter);
        console.log(`\n[vw spot sheet] ${r.spotCount} 条标注 / ${r.slotCount} 个槽`);
        console.log(`  spot 清单 → ${path.relative(process.cwd(), r.sheetPath)}`);
        console.log(`  采购单   → ${path.relative(process.cwd(), r.palettePath)}\n`);
      } else if (action === 'video') {
        // 纯画面信号：只看、不进计划
        const { analyzeVideo, videoSpots, compareWithPlan, writeAnalysis } = await import(
          '../scripts/spot/video.js'
        );
        const master = path.join(process.cwd(), 'out', id, 'master-mute.mp4');
        const a = analyzeVideo(master, { fps: 10 });
        if (!a) {
          console.error(`[vw spot video] 读不到母片: ${master}（先跑 vw render ${id} --mode=master）`);
          process.exit(1);
        }
        const p = writeAnalysis(id, a);
        console.log(`\n[vw spot video] ${a.frames} 帧 @${a.fps}fps`);
        console.log(
          `  阈值（按本片帧差分布自标定）: 单格 ${a.thresholds.cellDelta.toFixed(1)}  ` +
            `硬切 ${a.thresholds.cutDiff.toFixed(1)}  运动面积 ${a.thresholds.motionArea}` +
            `  [中位 ${a.thresholds.basis.median} / p75 ${a.thresholds.basis.p75} / p99 ${a.thresholds.basis.p99}]`
        );
        console.log(`  硬切 ${a.cuts.length} 处: ${a.cuts.slice(0, 12).join(', ')}${a.cuts.length > 12 ? ' …' : ''}`);
        console.log(`  运动区段 ${a.motions.length} 段:`);
        a.motions.slice(0, 12).forEach((m) =>
          console.log(`    ${m.fromSec.toFixed(2)}–${m.toSec.toFixed(2)}s  面积峰值 ${m.peakArea}`)
        );

        const truth = new TruthManager(id).readAll();
        const cmp = compareWithPlan(a, truth.plan);
        console.log(`\n  召回 / 噪音对账（诊断，不参与守门）:`);
        console.log(`    画面在动已配声: ${cmp.coveredMotions}/${cmp.totalMotions}`);
        cmp.recall.slice(0, 8).forEach((m) =>
          console.log(`    ⚠ 在动但没配声: ${m.fromSec.toFixed(2)}–${m.toSec.toFixed(2)}s (面积 ${m.peakArea})`)
        );
        cmp.noise.slice(0, 8).forEach((n) =>
          console.log(`    ⚠ 配了声但画面没动静: ${n.key} @ ${n.fromSec}s`)
        );

        const cand = videoSpots(a, id);
        console.log(`\n  候选 spot（仅供参考，不写进计划）: ${cand.length} 条`);
        console.log(`  信号摘要已落盘 → ${path.relative(process.cwd(), p)}\n`);
      } else {
        console.log(`[vw spot] 支持: sheet | sync-choreo | video`);
      }
      break;
    }

    case 'qa': {
      const action = positional[0];
      const id = requireFilm(positional[1]);
      if (action === 'audio') {
        const { runAudioAudit } = await import('../scripts/guard/audio-audit.js');
        const mark = { ok: '✓', hint: '·', warn: '!' } as const;
        console.log(`\n[vw qa audio] ${id}\n`);
        for (const it of await runAudioAudit(id)) console.log(`  ${mark[it.level]} ${it.text}`);
        console.log('');
        break;
      }
      const outDir = path.join(process.cwd(), 'out', id);
      const variant = flags['variant'] ? `${flags['variant']}-` : '';
      const target =
        (flags['file'] as string) ||
        [`${variant}final-60.mp4`, `${variant}master-mute.mp4`, `${variant}video-60-muted.mp4`]
          .map((n) => path.join(outDir, n))
          .find((p) => fs.existsSync(p)) || '';

      if (!target) {
        console.error(`[vw qa] 找不到可扫描的成片/母片（out/${id}/ 下）`);
        process.exit(1);
      }
      console.log(`\n[vw qa ${action}] ${path.relative(process.cwd(), target)}`);

      if (action === 'odd') {
        const { scanOdd } = await import('../scripts/guard/scan-odd.js');
        const region = flags['region']
          ? (String(flags['region']).split(',').map(Number) as [number, number, number, number])
          : undefined;
        const r = scanOdd(target, { fps: 30, region });
        if (!r.ran) {
          console.error(`  ✗ ${r.reason}`);
          process.exit(1);
        }
        console.log(`  扫描 ${r.frames} 帧${region ? `，只看区域 ${JSON.stringify(region)}` : ''}`);
        if (r.odds.length === 0) {
          console.log(`  ✓ 没有孤帧\n`);
        } else {
          console.warn(`  ⚠ ${r.odds.length} 处孤帧（偶发渲染问题，重渲那一段即可，不用改代码）:`);
          r.odds.slice(0, 20).forEach((o) =>
            console.warn(`    帧 ${o.frame} (${o.sec}s)  孤立度 ${o.oddness}  前${o.diffPrev}/后${o.diffNext}/跨${o.diffAcross}`)
          );
          console.log('');
        }
      } else if (action === 'flicker') {
        const { scanFlicker, scoreToFilmFor } = await import('../scripts/guard/scan-flicker.js');
        const film = getFilm(id);
        const adapter = await film.getAdapter();
        const r = scanFlicker(target, adapter.timeline, {
      fps: 30,
      // 成片按放映时间渲，幕边界要经 sync.json 映射
      toFilm: scoreToFilmFor(adapter.filmId),
    });
        if (!r.ran) {
          console.error(`  ✗ ${r.reason}`);
          process.exit(1);
        }
        console.log(`  扫描 ${r.frames} 帧，硬切 ${r.hits.length} 处（意外 ${r.unexpected.length} 处）`);
        r.unexpected.slice(0, 20).forEach((h) => console.warn(`    ⚠ ${h.sec}s 差值 ${h.maxDelta}`));
        if (r.unexpected.length === 0) console.log(`  ✓ 硬切全部落在幕表转场上\n`);
      } else {
        console.log(`[vw qa] 支持: odd | flicker   [--variant=] [--file=] [--region=x,y,w,h]`);
      }
      break;
    }

    case 'diff': {
      const { compareRenders } = await import('../scripts/render/compare.js');
      const a = String(flags['old'] ?? '');
      const b = String(flags['new'] ?? '');
      if (!a || !b) {
        console.error(`用法: vw diff --old=<旧成片> --new=<新成片> [--fps=30]`);
        process.exit(1);
      }
      const r = compareRenders(a, b, { fps: flags['fps'] ? Number(flags['fps']) : 30 });
      if (!r.ok) {
        console.error(`[vw diff] ✗ ${r.reason}`);
        process.exit(1);
      }
      console.log(`\n[vw diff] 逐帧灰度比对（${r.comparedFrames} 帧 @${r.fps}fps）`);
      if (r.reason) console.warn(`  ⚠ ${r.reason}`);
      console.log(`  全片平均差 ${r.overallMean}（0 = 逐帧一致）`);
      if (r.changed.length === 0) {
        console.log(`  ✓ 没有帧的平均差超过门限 —— 两条片在这个精度上一致\n`);
      } else {
        console.log(`  变了 ${r.changed.length} 帧（按差异降序，最多列 40）:`);
        r.changed.slice(0, 20).forEach((c) =>
          console.log(`    帧 ${String(c.frame).padStart(5)} (${c.sec}s)  平均差 ${c.mean}  单格最大 ${c.max}`)
        );
        if (r.contactSheet) {
          console.log(`  差异最大那一帧的 A|B 对比图 → ${path.relative(process.cwd(), r.contactSheet)}`);
        }
        console.log('');
      }
      break;
    }

    case 'ab': {
      const id = requireFilm(positional[0]);
      const { stillsAb } = await import('../scripts/render/stills-ab.js');
      const frame = Number(flags['frame'] ?? 0);
      const key = String(flags['key'] ?? 'ssaa');
      const a = JSON.parse(String(flags['a'] ?? '{}'));
      const b = JSON.parse(String(flags['b'] ?? `{"${key}":2}`));
      const comp = String(flags['comp'] ?? id);

      console.log(`\n[vw ab] 合成 ${comp} 第 ${frame} 帧：A=${JSON.stringify(a)}  B=${JSON.stringify(b)}`);
      console.log(`  先测底噪（同参数重复渲染之间的差），再判 A/B 差异是否显著…`);
      const r = stillsAb({ compositionId: comp, frame, propsA: a, propsB: b });
      if (!r.ok) {
        console.error(`  ✗ ${r.reason}`);
        process.exit(1);
      }
      console.log(`  底噪      ${r.noiseFloor}`);
      console.log(`  A/B 差异  ${r.abDiff}`);
      console.log(
        r.significant
          ? `  ✓ 差异显著：这个开关确实改了画面`
          : `  · 差异不显著（在底噪范围内）：这个开关对这一帧没有可见影响`
      );
      console.log(`  A: ${path.relative(process.cwd(), r.files.a)}`);
      console.log(`  B: ${path.relative(process.cwd(), r.files.b)}\n`);
      break;
    }

    case 'bake': {
      const id = requireFilm(positional[0]);
      const { bakeAll } = await import('../scripts/render/bake.js');
      /**
       * 烘焙目标：--scene=<幕> 烘那一幕的单幕合成 <片>-S-<幕>；--comp 可以指定任意合成。
       * 原来缺省是 `<片>-bake`，这个合成从来没注册过，不带 --comp 就跑不起来。
       */
      const scene = flags['scene'] as string | undefined;
      if (!scene && !flags['comp']) {
        console.error(`用法: vw bake ${id} --scene=<幕id> [--frame=40] [--scale=2] [--name=…]  或  --comp=<合成id>`);
        process.exit(1);
      }
      const comp = String(flags['comp'] ?? `${id}-S-${scene}`);
      const frame = Number(flags['frame'] ?? 40);
      const scale = Number(flags['scale'] ?? 2);
      const name = String(flags['name'] ?? (scene ? `${id}-${scene}` : 'texture'));
      console.log(`\n[vw bake] 合成 ${comp} 第 ${frame} 帧 @${scale}× → public/bake/\n`);
      const { map } = bakeAll([
        { compositionId: comp, frame, scale, outDirRel: 'bake', baseName: name },
      ]);
      console.log(`\n  纹理清单: ${JSON.stringify(map, null, 2)}\n`);
      break;
    }

    case 'inbox': {
      const action = positional[0];
      const id = requireFilm(positional[1]);
      const inbox = new InboxService(id);
      if (action === 'list') {
        const items = inbox.list(flags['status'] as any);
        console.log(`\n[vw inbox] 影片 '${id}' 批注单 (${items.length} 条):`);
        if (items.length === 0) console.log(`  (收件箱暂无批注)`);
        items.forEach((it) =>
          console.log(`  - [${it.status.toUpperCase()}] ID=${it.id} (${it.filmSec}s): "${it.instruction}"`)
        );
        console.log('');
      } else if (action === 'resolve') {
        const inboxId = positional[2];
        if (!inboxId) {
          console.error(`用法: vw inbox resolve <film> <inboxId> --note="..."`);
          process.exit(1);
        }
        const ok = inbox.resolve(inboxId, (flags['note'] as string) || '已由 Agent 修复');
        console.log(ok ? `[vw inbox] ${inboxId} 已结单。` : `[vw inbox] 未找到 ${inboxId}`);
      } else {
        console.log(`[vw inbox] 支持: list | resolve`);
      }
      break;
    }

    case 'version': {
      const action = positional[0];
      const id = requireFilm(positional[1]);
      const svc = new VersionService(id);
      if (action === 'save') {
        const meta = svc.save((flags['tag'] as string) || 'manual', (flags['note'] as string) || '');
        console.log(`[vw version save] 快照: ${meta.id}`);
      } else if (action === 'list') {
        const list = svc.list();
        console.log(`\n[vw version list] '${id}' 快照 (${list.length} 个):`);
        list.forEach((v) => console.log(`  - [${v.tag}] ${v.id} (${v.createdAt}) ${v.note ? `"${v.note}"` : ''}`));
        console.log('');
      } else if (action === 'restore') {
        const vid = positional[2];
        if (!vid) {
          console.error(`用法: vw version restore <film> <versionId>`);
          process.exit(1);
        }
        console.log(svc.restore(vid) ? `[vw version restore] 已恢复 ${vid}` : `[vw version restore] 失败`);
      } else if (action === 'update') {
        const vid = positional[2];
        if (!vid) {
          console.error(`用法: vw version update <film> <versionId> [--tag=…] [--note=…]`);
          process.exit(1);
        }
        const meta = svc.update(vid, {
          tag: flags['tag'] !== undefined ? String(flags['tag']) : undefined,
          note: flags['note'] !== undefined ? String(flags['note']) : undefined,
        });
        console.log(meta ? `[vw version update] ${meta.id} → [${meta.tag}] ${meta.note ?? ''}` : '失败');
      } else if (action === 'delete') {
        const vid = positional[2];
        if (!vid) {
          console.error(`用法: vw version delete <film> <versionId>`);
          process.exit(1);
        }
        console.log(svc.delete(vid) ? `[vw version delete] 已删除 ${vid}` : `[vw version delete] 失败`);
      } else {
        console.log(`[vw version] 支持: save | list | update | restore | delete`);
      }
      break;
    }

    case 'motion': {
      // 运动连续性体检：可以直接给文件，也可以给影片 id（取它的成片）
      const { checkMotion, formatMotionSummary } = await import('../scripts/guard/motion-guard.js');
      const arg = positional[0];
      if (!arg) {
        console.error('用法: vw motion <影片id | 视频文件>');
        process.exit(1);
      }
      const target = fs.existsSync(arg)
        ? arg
        : path.join(process.cwd(), 'out', arg, 'final-60.mp4');
      const r = checkMotion(target);
      console.log(`\n[vw motion] ${path.basename(target)}  ${r.durationSec}s @${r.fps}fps`);
      console.log(`  ${formatMotionSummary(r)}`);
      if (r.actions.length > 0) {
        const longest = [...r.actions].sort((a, b) => b.durSec - a.durSec)[0];
        console.log(`  最长动作段 ${longest.durSec.toFixed(2)}s @ ${longest.fromSec.toFixed(2)}s`);
      }
      console.log('');
      r.errors.forEach((e) =>
        e.split('\n').forEach((line, i) => console.error(i === 0 ? `  ✗ ${line}` : `    ${line.trim()}`))
      );
      r.warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
      console.log(r.ok ? '\n  ✓ 运动连续性达标\n' : '\n  （不达标不影响出片，但观感会偏硬）\n');
      break;
    }

    case 'studio': {
      const id = requireFilm(positional[0]);
      console.log(`[vw studio] 启动工作台: 影片=${id}`);
      const { startStudio } = await import('../tools/studio/server.js');
      await startStudio(id);
      break;
    }

    default: {
      console.log(`[vw] 未知命令: ${command}`);
      showHelp();
      break;
    }
  }
}

/** 衍生片守门：镜头表 / cue 槽 / 入点是否落在整拍上 */
async function checkVariantFilm(id: string, variant: 'trailer' | 'short'): Promise<boolean> {
  const { checkVariant } = await import('../scripts/guard/variant-guard.js');
  console.log(`\n[vw check] 衍生片守门: ${id} · ${variant}\n`);

  let report;
  if (variant === 'trailer') {
    const tl = await import('../src/films/us/trailer/timeline.js');
    const au = await import('../src/films/us/trailer/audio.js');
    report = checkVariant({
      filmId: id,
      variant,
      grid: tl.GRID,
      shots: tl.TRAILER.shots,
      localOf: tl.localOf,
      totalSec: tl.TRAILER_LENGTH,
      cues: au.buildTrailerCues(),
      musicFile: tl.TRAILER_MUSIC,
    });
  } else {
    const tl = await import('../src/films/us/short/timeline.js');
    const au = await import('../src/films/us/short/audio.js');
    report = checkVariant({
      filmId: id,
      variant,
      grid: tl.GRID,
      shots: tl.SHORT.shots,
      localOf: tl.localOf,
      totalSec: tl.SHORT_LENGTH,
      cues: au.buildShortCues(),
      musicFile: tl.SHORT_MUSIC,
    });
  }

  console.log(`  镜头 / 段: ${report.shotCount}   cue: ${report.cueCount}` +
    (report.musicDurSec ? `   配乐 ${report.musicDurSec.toFixed(2)}s` : ''));
  report.warnings.forEach((w) => console.warn(`  ⚠ ${w}`));
  if (report.valid) {
    console.log(`  ✓ 镜头表、cue 槽、拍网格全部通过\n`);
  } else {
    console.error(`  ✗ ${report.errors.length} 处问题:`);
    report.errors.forEach((e) => console.error(`    - ${e}`));
    console.log('');
  }
  return report.valid;
}

/** 影片 ID 必须显式给出：避免悄悄落到某个默认片上 */
/**
 * 解析影片 ID。
 * 省略时落到 VW_FILM / SFX_FILM（附录 B 的「平台选片」）——
 * 一直在同一部片上来回敲命令时不用每条都带 id。
 * 两个都没有才报错：这里不设硬编码缺省，猜错片子会把真值写到别人家里。
 */
function requireFilm(id: string | undefined): string {
  const fromEnv = process.env.VW_FILM || process.env.SFX_FILM;
  if (!id && fromEnv) {
    console.log(`[vw] 未指定影片，按环境变量用 '${fromEnv}'`);
    id = fromEnv;
  }
  if (!id) {
    const ids = listFilms().map((f) => f.id);
    console.error(
      `错误: 必须显式指定影片 ID（或设 VW_FILM / SFX_FILM）。已注册: ${ids.join(', ')}`
    );
    process.exit(1);
  }
  getFilm(id); // 不存在时抛错
  return id;
}

async function handleCueOps(
  id: string,
  rest: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const op = rest[0] || 'list';
  const truthMgr = new TruthManager(id);
  const truth = truthMgr.readAll();
  const { applyCueOp } = await import('../scripts/spot/music-cues-ops.js');
  const { refreshStateUnlessSuppressed } = await import('../tools/studio/state.js');

  /** 改完段就刷新工作台投影；CUE_NO_EXPORT=1 可以关掉（附录 B） */
  const refresh = async () => {
    const done = await refreshStateUnlessSuppressed(id);
    if (done) console.log(`  ✓ 已刷新 out/${id}/state.json`);
  };

  if (op === 'list') {
    console.log(`\n[vw music cue] '${id}' 配乐段 (${truth.music.cues.length} 段):`);
    truth.music.cues.forEach((c) =>
      console.log(
        `  - [${c.id}] ${c.in.sec.toFixed(2)}s ~ ${c.out.sec.toFixed(2)}s (${(c.out.sec - c.in.sec).toFixed(2)}s) ` +
          `| 增益 ${(c.volume * 100).toFixed(0)}% | 衔接 ${c.join?.kind || 'cut'} | ${c.track ? c.track.file : '未配曲'} | "${c.label}"`
      )
    );
    console.log('');
    return;
  }

  if (op === 'split') {
    const [cueId, atStr] = [rest[1], rest[2]];
    const atSec = parseFloat(atStr);
    if (!cueId || Number.isNaN(atSec)) {
      console.error(`用法: vw music cue <film> split <cueId> <atSec>`);
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, { kind: 'split', cueId, atSec });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 在 ${atSec}s 拆分 ${cueId}，现共 ${updated.cues.length} 段。`);
  } else if (op === 'merge') {
    const [a, b] = [rest[1], rest[2]];
    if (!a || !b) {
      console.error(`用法: vw music cue <film> merge <cueA> <cueB>`);
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, { kind: 'merge', cueIdA: a, cueIdB: b });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 已合并 ${a} 与 ${b}。`);
  } else if (op === 'join') {
    const cueId = rest[1];
    const kind = (rest[2] as any) || 'butt';
    const updated = applyCueOp(truth.music, {
      kind: 'join',
      cueId,
      joinSpec: {
        kind,
        gapSec: flags['gap'] ? parseFloat(flags['gap'] as string) : undefined,
        overlapSec: flags['overlap'] ? parseFloat(flags['overlap'] as string) : undefined,
      },
    });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 段 ${cueId} 衔接宏 → ${kind}`);
  } else if (op === 'add') {
    const [inStr, outStr] = [rest[1], rest[2]];
    const inSec = parseFloat(inStr);
    const outSec = parseFloat(outStr);
    if (Number.isNaN(inSec) || Number.isNaN(outSec)) {
      console.error(`用法: vw music cue <film> add <inSec> <outSec> [--label=…] [--id=…]`);
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, {
      kind: 'add',
      cue: {
        id: (flags['id'] as string) || undefined,
        in: { sec: inSec, ref: (flags['in-ref'] as string) || `${inSec}s` },
        out: { sec: outSec, ref: (flags['out-ref'] as string) || `${outSec}s` },
        label: (flags['label'] as string) || `新段 ${inSec}–${outSec}s`,
      } as never,
    });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 新增段 ${inSec}→${outSec}s，现共 ${updated.cues.length} 段。`);
  } else if (op === 'remove') {
    const cueId = rest[1];
    if (!cueId) {
      console.error(`用法: vw music cue <film> remove <cueId>`);
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, { kind: 'remove', cueId });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 已删除段 ${cueId}，现共 ${updated.cues.length} 段。`);
  } else if (op === 'move') {
    const [cueId, edge, secStr] = [rest[1], rest[2] as 'in' | 'out', rest[3]];
    const newSec = parseFloat(secStr);
    if (!cueId || (edge !== 'in' && edge !== 'out') || Number.isNaN(newSec)) {
      console.error(`用法: vw music cue <film> move <cueId> in|out <秒> [--ref=K.xxx]`);
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, {
      kind: 'move',
      cueId,
      edge,
      newSec,
      newRef: (flags['ref'] as string) || undefined,
    });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 段 ${cueId} 的 ${edge} 移到 ${newSec}s`);
  } else if (op === 'set') {
    const cueId = rest[1];
    if (!cueId) {
      console.error(
        `用法: vw music cue <film> set <cueId> [--volume=0.8] [--label=…] [--brief=…]`
      );
      process.exit(1);
    }
    const patch: Record<string, unknown> = {};
    if (flags['volume'] !== undefined) patch.volume = parseFloat(flags['volume'] as string);
    if (flags['label'] !== undefined) patch.label = String(flags['label']);
    if (flags['brief'] !== undefined) patch.brief = String(flags['brief']);
    if (Object.keys(patch).length === 0) {
      console.error('  没有要改的字段（--volume / --label / --brief）');
      process.exit(1);
    }
    const updated = applyCueOp(truth.music, { kind: 'set', cueId, patch: patch as never });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 段 ${cueId} 已更新: ${Object.keys(patch).join(', ')}`);
  } else if (op === 'upgrade') {
    const updated = applyCueOp(truth.music, { kind: 'upgrade' });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ music.json 已升到 v2 结构，共 ${updated.cues.length} 段。`);
  } else if (op === 'restore') {
    // 从版本快照里取回整份段表
    const verId = rest[1];
    if (!verId) {
      console.error(`用法: vw music cue <film> restore <versionId>（版本见 vw version list）`);
      process.exit(1);
    }
    const snapDir = path.join(process.cwd(), 'out', id, 'versions', verId);
    const snapFile = path.join(snapDir, 'music.json');
    if (!fs.existsSync(snapFile)) {
      console.error(`  快照里没有 music.json: ${snapFile}`);
      process.exit(1);
    }
    const snap = JSON.parse(fs.readFileSync(snapFile, 'utf-8'));
    const updated = applyCueOp(truth.music, { kind: 'restore', cues: snap.cues });
    truthMgr.write('music', updated);
    await refresh();
    console.log(`  ✓ 已从快照 ${verId} 恢复 ${updated.cues.length} 段。`);
  } else {
    console.log(
      `[vw music cue] 支持: list | split | merge | join | add | remove | move | set | upgrade | restore`
    );
  }
}

main().catch((err) => {
  console.error('[vw fatal error]:', err);
  process.exit(1);
});

/**
 * 配乐曲库与改编 (对标 §16.3)
 *   prepare  预改编：r8 闭环 + 干跑求解，结果缓存起来，不写 sync.json
 *   adapt    落定：命中预改编就本地落定不调接口；--pool=N 走比选改编
 *   choose   换成比选产物里的另一个配方
 *   full     落原曲整首，并清掉这一段的对拍
 *   remove   解绑这一段的曲目
 *   gc       删掉没有任何段引用的音频
 */
async function handleMusicLibrary(
  action: string,
  filmId: string,
  rest: string[],
  flags: Record<string, string | boolean>
): Promise<void> {
  const { EpidemicMusicService } = await import('../scripts/epidemic/music.js');
  const lib = await import('../scripts/epidemic/library.js');
  const { TruthManager } = await import('../scripts/spot/truth.js');

  // gc 不需要影片上下文之外的东西，先处理
  if (action === 'gc') {
    const ids = listFilms().map((f) => f.id);
    const dryRun = !flags['apply'];
    const r = lib.gc(ids, { dryRun });
    console.log(`\n[vw music gc] 扫描 ${ids.length} 个影片的引用：`);
    console.log(`  保留 ${r.kept.length} 个，${dryRun ? '可删' : '已删'} ${r.removed.length} 个，` +
      `腾出 ${(r.bytesFreed / 1024 / 1024).toFixed(1)} MB`);
    r.removed.forEach((n) => console.log(`    ${dryRun ? '·' : '✓'} ${n}`));
    console.log(dryRun ? '\n  （这是预览；加 --apply 才真删）\n' : '');
    return;
  }

  const cueId = rest[0] ?? 'c1';
  const film = getFilm(filmId);
  const adapter = await film.getAdapter();
  const truth = new TruthManager(filmId).readAll();
  const cue = truth.music.cues.find((c) => c.id === cueId);
  if (!cue) {
    console.error(`[vw music ${action}] 没有配乐段 '${cueId}'`);
    process.exit(1);
  }

  if (action === 'remove') {
    const r = lib.removeCueTrack(filmId, cueId);
    console.log(r.ok ? `[vw music remove] 段 ${cueId} 已解绑，锚点一并清掉。` : `失败: ${r.error}`);
    return;
  }

  if (action === 'choose') {
    const recipe = (flags['recipe'] as string) ?? rest[1];
    if (!cue.track?.id || !recipe) {
      console.error(`[vw music choose] 用法: vw music choose ${filmId} ${cueId} --recipe=r16-peak`);
      process.exit(1);
    }
    const key = lib.musicKey(cue.track.id, filmId, cueId);
    const src = path.join(process.cwd(), 'public', 'music', `${cue.track.id.slice(0, 8)}-${filmId}-${cueId}-adapt-${recipe}.wav`);
    if (!fs.existsSync(src)) {
      console.error(`[vw music choose] 没有 ${recipe} 这一版（先跑 vw music adapt ${filmId} ${cueId} --pool=6）\n  找的是 ${src}`);
      process.exit(1);
    }
    const r = lib.applyEdit(filmId, cueId, src, {
      trackId: cue.track.id, title: cue.track.title, artist: cue.track.artist,
      bpm: cue.track.bpm, adapted: true,
    }, adapter);
    console.log(r.ok
      ? `[vw music choose] 段 ${cueId} 换成 ${recipe} → ${r.file}  scoreSync=${r.scoreSync}  (键 ${key})`
      : `失败: ${r.error}`);
    return;
  }

  const svc = new EpidemicMusicService();
  if (action === 'full') {
    // 落原曲整首：不改编，顺带清掉这一段的对拍
    if (!cue.track?.id) {
      console.error(`[vw music full] 段 ${cueId} 还没绑曲目`);
      process.exit(1);
    }
    const wav = svc.fetchFullTrack(cue.track.id, filmId, cueId);
    if (!wav.ok || !wav.file) {
      console.error(`[vw music full] 取原曲失败: ${wav.error}`);
      process.exit(1);
    }
    const r = lib.applyEdit(filmId, cueId, path.join(process.cwd(), 'public', wav.file), {
      trackId: cue.track.id, title: cue.track.title, artist: cue.track.artist,
      bpm: cue.track.bpm, adapted: false,
    }, adapter);
    console.log(r.ok ? `[vw music full] 段 ${cueId} 落原曲整首 → ${r.file}` : `失败: ${r.error}`);
    return;
  }

  // prepare / adapt 都要曲目与目标
  //   adapt 不带 --track 时优先用「这一段最近一次预改编」的曲目，
  //   否则会拿段上旧的绑定去调接口，prepare 的缓存永远命不中
  const prepared = action === 'adapt' ? lib.findPrepared(filmId, cueId) : null;
  const trackId = (flags['track'] as string) ?? prepared?.trackId ?? cue.track?.id;
  if (!trackId) {
    console.error(`[vw music ${action}] 段 ${cueId} 还没绑曲目，用 --track=<id> 指定（候选见 vw music search）`);
    process.exit(1);
  }
  /**
   * 曲目元信息。换了曲目（trackId 与段上绑的不是同一首）就**不能**沿用旧的
   * title / artist / bpm —— 否则 music.json 里会出现「新曲子顶着旧名字」。
   */
  const sameTrack = cue.track?.id === trackId;
  const metaOf = (bpm: number) => ({
    title: (sameTrack ? cue.track?.title : prepared?.title) ?? trackId,
    artist: (sameTrack ? cue.track?.artist : prepared?.artist) ?? '',
    bpm: sameTrack ? (cue.track?.bpm ?? bpm) : bpm,
  });

  const targetSec = cue.out.sec - cue.in.sec;
  const dropAtSec = cue.climax ? cue.climax.sec - cue.in.sec : null;
  const req = {
    trackId,
    targetDurationSec: targetSec,
    dropAtSec,
    drop2AtSec: cue.climax2 ? cue.climax2.sec - cue.in.sec : null,
    // 换了曲目就不能拿旧绑定的 bpm 当初值，否则拍周期搜索从错误的地方起步
    nominalBpm: flags['bpm'] ? Number(flags['bpm']) : sameTrack ? cue.track?.bpm : undefined,
  };

  if (action === 'prepare') {
    const title = (flags['title'] as string) ?? (sameTrack ? cue.track?.title : undefined);
    const artist = (flags['artist'] as string) ?? (sameTrack ? cue.track?.artist : undefined);
    const r = lib.prepare(svc, filmId, cueId, req, adapter, { title, artist });
    console.log(r.ok
      ? `[vw music prepare] 段 ${cueId} 预改编完成 → ${r.file}\n` +
        `  实测 drop ${r.actualDropSec?.toFixed(2)}s（目标 ${dropAtSec?.toFixed(2) ?? '—'}s）  干跑 scoreSync=${r.dryScoreSync}\n` +
        `  下一步: vw music adapt ${filmId} ${cueId}（会直接命中这份缓存，不再调接口）`
      : `[vw music prepare] 失败: ${r.error}`);
    return;
  }

  // ── adapt
  const pool = flags['pool'] ? Number(flags['pool']) : 1;

  /**
   * --prefs='[{"fromSec":12,"toSec":20,"preference":"less"}, …]'：人手设的段落偏好（§18.3）。
   * 工作台的波形拖选就是走这里。规则在后端再查一遍 ——
   * 界面拦得住点鼠标的人，拦不住直接敲命令或调 API 的。
   */
  let prefs: { fromSec: number; toSec: number; preference: 'more' | 'less' }[] | undefined;
  if (flags['prefs']) {
    try {
      prefs = JSON.parse(String(flags['prefs']));
    } catch {
      console.error(`[vw music adapt] --prefs 不是合法 JSON`);
      process.exit(1);
    }
    const { validatePreferences } = await import('../scripts/epidemic/recipes.js');
    svc.ensureSourcePreview(trackId, cue.brief || cue.label || '', targetSec);
    const grid = svc.sourceGrid(trackId, req.nominalBpm);
    if (!grid) {
      console.error(`[vw music adapt] 取不到原曲 ${trackId.slice(0, 8)} 的段落分析，没法校验段落偏好`);
      process.exit(1);
    }
    const errs = validatePreferences(prefs!, grid);
    if (errs.length > 0) {
      console.error(`[vw music adapt] 段落偏好不合法:`);
      errs.forEach((e) => console.error(`  ✗ ${e}`));
      process.exit(1);
    }
    (req as { preferenceRegions?: typeof prefs }).preferenceRegions = prefs;
    console.log(`[vw music adapt] 段落偏好 ${prefs!.length} 段，校验通过`);
  }

  // 预改编缓存是不带偏好算出来的：这次带了偏好就不能命中它
  const hit = pool <= 1 && !prefs ? lib.hitPrepared(trackId, filmId, cueId, dropAtSec) : null;
  if (hit) {
    console.log(`[vw music adapt] 命中预改编缓存，本地落定（不调接口）`);
    const r = lib.applyEdit(filmId, cueId, path.join(process.cwd(), 'public', hit.file), {
      trackId, ...metaOf(hit.bpm), adapted: true, editId: hit.editId,
    }, adapter);
    console.log(r.ok ? `  ✓ 段 ${cueId} → ${r.file}  scoreSync=${r.scoreSync}` : `  失败: ${r.error}`);
    return;
  }

  if (pool > 1) {
    /**
     * 比选要的是**原曲**的段落分析，不是段上已经改编过的成品 ——
     * 拿成品去分析，各配方的偏好区会退化成同一个，跑出字节相同的结果。
     */
    svc.ensureSourcePreview(trackId, cue.brief || cue.label || '', targetSec);
    const srcGrid = svc.sourceGrid(trackId, req.nominalBpm) ?? undefined;
    if (!srcGrid) {
      console.error(
        `[vw music adapt] 取不到曲目 ${trackId.slice(0, 8)} 的原曲预览，比选没法区分配方。\n` +
          `  先跑 vw music search ${filmId} ${cueId} 把它搜出来（会顺手缓存预览），或改用 --pool=1`
      );
      process.exit(1);
    }
    const r = svc.adaptCompare(req, filmId, cueId, { pool, fps: 30, sourceGrid: srcGrid, custom: prefs });
    if (!r.ok || !r.file) {
      console.error(`[vw music adapt] 比选失败: ${r.error}`);
      r.failed.forEach((f) => console.error(`    ${f.recipe}: ${f.error}`));
      process.exit(1);
    }
    console.log(`\n[vw music adapt] 比选 pool=${pool}，胜出 ${r.winner?.recipe}:`);
    r.ranked.forEach((c) => console.log(
      `  ${c.recipe.padEnd(16)} 分=${String(c.score).padStart(7)}  拟合=${c.parts.gridFit}` +
      `  drop罚=${c.parts.dropPenalty}  第二高潮罚=${c.parts.drop2Penalty}`));
    r.failed.forEach((f) => console.log(`  ${f.recipe.padEnd(16)} 失败: ${f.error}`));
    const ap = lib.applyEdit(filmId, cueId, path.join(process.cwd(), 'public', r.file), {
      trackId, ...metaOf(r.winner?.grid.bpm ?? 120), adapted: true, editId: r.winner?.editId,
    }, adapter);
    console.log(ap.ok ? `\n  ✓ 落定 → ${ap.file}  scoreSync=${ap.scoreSync}\n` : `\n  落定失败: ${ap.error}\n`);
    return;
  }

  const r = svc.adapt(req, filmId, cueId);
  if (!r.ok || !r.file) {
    console.error(`[vw music adapt] 失败: ${r.error}`);
    process.exit(1);
  }
  const ap = lib.applyEdit(filmId, cueId, path.join(process.cwd(), 'public', r.file), {
    trackId, ...metaOf(r.grid?.bpm ?? 120), adapted: true, editId: r.editId,
  }, adapter);
  console.log(ap.ok
    ? `[vw music adapt] 段 ${cueId} → ${ap.file}  ${r.rounds} 轮，误差 ${r.errBeats} 拍  scoreSync=${ap.scoreSync}`
    : `[vw music adapt] 落定失败: ${ap.error}`);
}
