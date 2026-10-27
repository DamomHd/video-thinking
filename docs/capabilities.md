# 能力目录（做片前先读）

> 用途：模型规划一部片时，先通读这份目录，再写导演决策单（`docs/templates/director.md`）。
> 这里列的是工程**能做什么**；画面**该怎么设计**看 `docs/method/taste.md`（高级感标准）和 `docs/library/`（视觉语言库）。
> 每一项写清：能做什么 · 在哪 · 什么时候用 · 前提 / 成本。新增能力时同步更新这里。
> 这里只列「可选的手段」，用不用、怎么组合由每部片的导演决策决定。

## 1. 叙事与结构
| 能力 | 在哪 | 什么时候用 | 前提 / 成本 |
|---|---|---|---|
| 幕表（秒制、交叠、转场） | `shared/types.buildPlan` | 每部片 | — |
| 一个世界、跨幕连续 | `shared/shot.worldSec` + 幕 overlap 0 / enter none | 内容是一张「图」、要镜头带人走 | 幕边界在画面上消失，只剩给声音分段的作用 |
| 动作事件表 | `shared/events` | 每部片：画面动作登记一次，画面和声音都从这取时间 | 片子实现 `events()` 后，守门会对账配声 |

## 2. 镜头
| 能力 | 在哪 | 什么时候用 | 前提 / 成本 |
|---|---|---|---|
| 镜头清单（模型写，工程编译） | `shared/grammar.compileShots` | 每部片；取景、停留、过渡都写在清单里 | — |
| 停留：静止 / 缓推 / 慢漂 | 同上 `hold` | 读字段落用缓推，氛围段用慢漂 | — |
| 过渡：直推 / 弧线 / 甩镜 / 硬切 | 同上 `out` | 远距离用弧线（看到全貌）；情绪转折用甩镜；进出暗场用硬切 | — |
| 镜头语言（漫游 / 舞台 / 蒙太奇…） | `docs/library/`（按讲法选） | 写清单前选 | — |
| 2D 取景换算 | `shared/shot.frameRect` | 「把这块装进画面」 | — |
| 3D 漫游路径 | `shared/flight` + `three/FlightCamera` | 3D 场景里沿路线飞 | 实时 three；照片级要 Blender |

## 3. 换内容（转场手法）
| 能力 | 在哪 | 什么时候用 |
|---|---|---|
| 拉焦（逐字聚焦 / 原位换字） | `shot/FocusText` `FocusSwap`、`shared/lens` | 标题出现、同一位置换内容 —— 比淡入淡出更有镜头感 |
| 形变挪位（FLIP） | `shot/MorphLayer`、`shared/morph` | 一组元素从布局 A 变到 B（21 → 6、三选一） |
| 公式变形 | `math/MathMorph` | 推导一步 |
| 外部片段插入（AI 视频 / 实拍） | `VideoInsert` + `vw handoff / insert / seam` | 代码做不出的连续复杂动作；接缝用 iris / wipe 软遮罩 |

## 3.5 画法片段（huashu-clip，收录自 huashu-motion）
给数据和节奏就能出一段完整画面的 7 个画法，详见 `docs/library/clip.md`。组件 `components/clip/ClipCanvas`，配声 `shared/clip.clipEvents`。**成熟度：探针渲过（7 个都渲过、确定性验过），还没在真片里用过。**

| 画法 | grammar | 什么时候用 |
|---|---|---|
| 公式讲解（3Blue1Brown 式） | `t1_3b1b` | 公式、曲线、算法，一个概念变成下一个 |
| 发布会卡片 | `t2_keynote_ui` | 功能、参数、截图高亮、一个大数字 |
| 金融图表 | `t3_finance_chart` | 营收、增长、带转折的趋势（真数据） |
| 科普插画（Kurzgesagt 式） | `y1_kurzgesagt` | 「X 里面有什么」：系统、部件 |
| 拼贴论证（Vox 式） | `y2_vox` | 拿真实截图 / 文档论证 |
| 白板推演 | `y3_whiteboard` | 一步步推理、因果链 |
| 动态文字 | `y5_kinetic_type` | 清单、阶段、章节卡、一句结论 |

## 3.6 笔刷手绘动画（ClaudeAnimationBase，p5.js + p5.brush）
手绘卡通的画法和角色表演，引擎原样收录（`public/vendor/claude-animation-base/`，指南 `docs/method/animation-guide.md`，改写见 `docs/library/adaptation.md` §10）。**成熟度：探针渲过（`BrushProbe-demo / -emotions / -views / -ts`，同一帧单渲 / 连续渲逐字节一致），还没在真片里用过。**

| 能力 | 在哪 | 什么时候用 | 前提 |
|---|---|---|---|
| 笔刷画面：平涂 / 水彩晕染 / 排线 / 墨线，线条 boil，纸纹 + 颗粒，加色光晕 | `paint/PaintCanvas` + `cab()` 的 `paint` `inkLine` `glow` | 要「手画的」质感：故事、比喻、温度 | 画布固定 1920×1080；本机约 1 秒 / 帧，水彩填充多了更慢 |
| 角色表演：转身、31 种情绪、表情切换带预备和反应、跳、惊吓、走路、跳舞、挂件 | `cab()` 的 `clawd` `emotions` `turn` `jump` `take` `stroll` `move` | 需要一个「人」来演：困惑 → 发现 → 开心 | 角色可换（照 `EMO` / `VIEWS` 的写法加） |
| 转场：刷子擦除、形状开合、闪白 | `cab()` 的 `brushWipe` `iris` `irisShape` `flash` | 笔刷画面的段落之间 | — |
| 节拍：所有 idle、弹跳、舞步锁在一个 BPM 上 | `PaintCanvas` 的 `project.bpm / offset` | 有配乐时填配乐的速度和首拍 | 一个渲染页只有一份引擎设置 |

## 4. 画面元素与质感
| 能力 | 在哪 | 什么时候用 | 前提 |
|---|---|---|---|
| 浮起（双层阴影） | `shared/lens.lift` | 实体的东西落到一个面上（卡片、票据、模块） | 别给每一张卡都叠（taste.md：无目的叠用会推成演示文稿） |
| 光扫 | `shot/LightSweep` | 让一个表面显出材质、或给高潮那一下加光 | 容器要 overflow hidden；每个元素都扫就没了意义 |
| 纸面光照 + 纤维 + 颗粒 | `shot/PaperLight` | 纸面类风格的「拍摄现场感」 | 放在 Stage 外面作同级 |
| 落定发光 | `shot/GlowText` | 关键数字、关键时刻的光 | 处处发光 = 没有强调 |
| 沿路径光点 | `shot/PathPulses` | 让静止段「活着」（流动感） | — |
| 潮水铺开 / 计数 | `shared/flow` | 大量点 / 格子铺满，配同步计数 | — |
| 手绘线 | `sketch/Rough` | 手绘、草图风格 | — |
| 水彩 / 水墨 | `sketch/WatercolorWash` `InkBleed` | 绘画类风格 | 风格要调参 |
| 公式 / 几何板书 | `math/MathTex`、`geo/*` | 数理讲解 | — |
| 定格节奏 | `shared/stepped` | 黏土、剪纸、逐帧手绘感 | — |

## 5. 3D
| 能力 | 在哪 | 什么时候用 | 前提 / 成本 |
|---|---|---|---|
| **2D ↔ 3D 镜头桥（主镜头）** | `shared/bridge` + `three/BridgeStage` `ProjectedHtml` | 全片需要一个「让人记住的镜头」：图纸上的东西立起来、镜头压低贴着推过去 | 纸面 DOM 永远在 3D 物体下面；相机不能转到纸背面；纸面元素不能伸到相机身后（铺满全场的底纹在 3D 段裁短）。立体书式「图纸立起来」：`ProjectedHtml` 绕底边转角（anlan-brief 第六段） |
| 实时 3D + 后期链 | `three/FilmCanvas` `FilmPost` `StudioEnv` | 3D 场景、产品、电影感空间（雾 + 辉光 + 景深） | 后期链已修确定性；`FilmPost` 的景深可按世界点对焦（`dof.target` + `worldFocusRange`，特写时焦内极薄），可开色差（`chroma`，重拍那一刻冲一下）。DOM 标注钉在 3D 点上用 `shared/bridge` 的 `projectPoint` 每帧投影 |
| 正交 / 轴测 | `FilmCanvas orthographic` + `isoPose` | 等距插画、结构图 | — |
| glb 资产 | `three/GlbAsset` + `vw blender glb` | 用 Blender 建好的模型 | — |
| Blender 照片级（机身 / 场景 / 漫游相机） | `vw blender render / scene / flight` | 高保真拟物、黏土定格 | Intel 上很慢（`vw hw`），M 系列走 GPU |
| 体积光 | `vw blender rays` + `three/RaysOverlay` | 光束穿过缝隙 | 同上 |

## 6. 声音
| 能力 | 在哪 | 什么时候用 | 前提 |
|---|---|---|---|
| 事件 → 自动配声 + 覆盖守门 | `shared/events.autoSpots` | 每部片 | 适配器给一张「事件类型 → 槽」映射 |
| 分层音色（瞬态 + 主体 + 同一混响 + 低频） | `scripts/composer/layered.ts`，tags `layered, <角色>` | 本地合成时的缺省选择 | 角色：card-land / count-tick / reveal-swell / focus-air / morph-slide / stamp / hero-hit / pre-hit / room-tone |
| 重拍前反向吸气 | 事件 `weight: 'heavy'` 或 `kind: 'hero'` | 「选定」「上锁」「落版」这类重拍 | — |
| 踩拍入场 + 调内序列音高 | `shared/beats`（`beatGrid` `onBeats` `sequenceSpots`） | 成组元素逐个出现 | 配乐要有速度（music.json） |
| 数字滚动咔哒 | 事件 `kind: 'count'` | 每个数字滚动 | — |
| 房间底噪（无音高、无缝循环） | layered `room-tone` | 全片底噪 | 不要用有音高的 pad 当底噪（容易不在调上） |
| 留白 | 事件 `silent: '理由'` | 片名、情绪落点前 —— 有意识地不配声 | 理由必填 |
| 本地结构化作曲 | `vw music match --local` | 没有外部配乐时；要卡死高潮时最稳 | 能铺满、有律动、卡高潮；质感是合成的，曲风很窄 |
| 数据叙事画布（dataviz 风格的引擎） | `components/dataviz` 的 `DataCanvas`（每帧给一张 Canvas 2D，等字体就绪）+ 收录的 `src/vendor/opuscar-dataviz/engine.js`（`drawPaper` 纸、`applyCam` / `w2s` 2D 相机、`pencilStroke` 铅笔线、`handText` 手写、`dataDot` 数据点、`morphMark` 点变形、`bracketPath` / `ringPath` / `leader` 批注、`drawPencil` 红蓝铅笔、`setType` 排字） | 片子沿用 dataviz 风格，或想要「铅笔在纸上画真数据」的一段 | 中文手写用 `vw font fetch "Long Cang" --film=<片>`；**在测试片里用过**（anlan-window）。图注要自己画（引擎的 `caption` 按英文空格分词，中文不适用） |
| 内容策划检查（这段时长讲哪些核心信息） | `vw brief <片>`（`scripts/guard/brief.ts`）：读决策单「内容策划」信息表（层级 结论 / 支撑 / 证据、起止、承载的口播 id 和「屏幕字」）+ `voice.json`；算容量（口播约 4 字/秒 × 85%、约 9 秒一个读点），查一个结论、≤ 3 个支撑、支撑有证据、结论在前 1/4、屏幕字停够读完、多久没承载信息、口播是否超容量 / 有不承载信息的句子；输出纸面稿。`vw review` 汇总同一套提示 | 每部片开工时，选风格和画面之前；改了脚本之后 | 只提示不拦；信息表的起止是模型写的计划时间，出片后用 `vw readcheck` 核实际停留。**单元测试验过**，还没在真片里用过 |
| 质感床 / 氛围床（段落底下的长音色） | `src/shared/beds.ts` 的 `sectionBeds(段落表, { key, carve, layer, xfadeSec })`：每段一个槽（`null` = 故意留白），相邻段交叉淡化、carve 区间真静默、按配乐调号变到主音；本地合成角色 `layered, texture-bed` + 音色词 `warm`（暖垫底）/ `air`（空气感）/ `low`（低频嗡声）/ `glass`（玻璃泛音）/ `tension`（小二度紧张），都调在 A、20 秒无缝循环、按种子慢慢变；也可以用 CC0 的 drone / texture 素材。`vw review` 在质感床为空时提示 | 每部片都要想一下：动作事件只生成「点」，段落的底色要另外铺；暗场、问题段落、结尾打开时换音色 | **单元测试 + 临时探针片端到端验过**（3 段 + 一处静默：段落交接无掉音、静默处真静默、变调 +3 到 C 大调；验完已删）；还没在真片里用过 |
| 按片作曲（配乐网格先行） | 片子写 `audio/score.ts`：`shared/score.ts` 的 `defineScore({ grid: { bpm, beatsPerBar, key, sections: [{ id, bars }] }, notes: (g) => [...] })`；`g.sec(段, 小节, 拍)` 给画面落点、`g.beatGrid()` 给 `onBeats`、`g.degree / triad` 给调内音高。乐器：采样（`violins` `piano` `marimba` `harp` `timpani`…）、`synth:pad|bass|pluck|bell|plonk|sub`（内置合成）、`pluck:<preset>`（拨弦物理建模，要 numba）。`vw music score <片>` 渲染、写回 music.json（`track.source = 'score'`、采样库署名）、对拍清成恒等；`vw check` 查拍点落在网格上（容差 1 帧） | 音乐分量重、节奏要卡死、要按风格配器、要「数据发声」的片 | **单元测试 + 临时探针片端到端验过**（96 BPM、3 段 25 个音：高潮落在 5.00s、能量跳 +7.8 dB，拍点偏 120ms 被守门拦下、改正后通过；验完已删）；还没在真片里用过。Intel Mac 上拨弦物理建模不可用（numba 和 numpy 版本冲突） |
| 画布上的字也查读字时间 | `components/canvasTexts.ts`：画字的地方调 `registerCanvasText(g, 字, x, y, { size, font, weight, align, alpha, complete })`，按画布当前变换（相机）算屏幕包围盒；`DataCanvas` 每帧自动 `beginCanvasTexts()`；`vw readcheck` 把它和 DOM 里的字合在一起查 | 字画在 Canvas 上的片（dataviz、笔刷、画法片段、自由画布）；不登记就查不到（anlan-window 读到 0 段就是这个原因） | **临时探针片端到端验过**（停 5.4s 的通过、闪 0.4s 的报出来；相机缩放下包围盒正确；验完已删） |
| 口播处理与人声 / 配乐平衡 | `vw voice film` 配音后每句：高通 70Hz → 压缩（−24 dB 起、3:1）→ 统一到 −18 dB RMS、峰值不过 −1 dB（`shared/voice.ts` 的 `VOICE_RMS_TARGET` / `voiceGainDb`）；`vw review` 按真值算每句人声比（让位后的）配乐高多少，低于 8 dB 提示（目标约 10 dB，lemo-opuscar TECHNIQUE §4） | 有口播的片 | 处理在 anlan-window 的 6 句副本上验过（−25.4…−28.8 dB → 全部 −18.1/−18.2）；平衡检查在 anlan-window 上查出 4 句只高 4.7–7.7 dB（那部片的口播是处理之前配的，没改） |
| 声音规则检查 | `vw review`：① 近乎静默的段（成片音轨里比中位数低 12 dB 以上、≥ 0.3s），少于两处提示并报最安静的一处低多少；② 被声音带过的段落交界（点状声音在交界前响起并越过交界），少于两处提示；③ 决策单「声音设计表」里写到的层（底噪 / 质感床 / 配乐 / 口播）在混音里是不是空的 | 每部片出片后 | 只提示不拦；在 anlan-window / anlan-exec 上跑过（两部都没有真静默，最安静处只低约 10 dB） |
| 限定配乐速度 | `vw music match <片> --local --bpm=100-112`（或 `--bpm=108` 定速） | 风格规定了速度范围（如 product-story 的室内乐 100–112）：在范围里按画面拍点拟合；不给就在 60–180 里拟合，可能拟合出和风格不符的速度 | **在样片里用过**（product-story-test：不限定时拟合出 72 / 117，限定后 100） |
| 中段「静 → 爆」（第二高潮） | 音乐真值 `cue.climax2` 指向那个拍点（如 `{ ref: 'K.lock', sec: 20.6 }`），再跑 `vw music match --local [--sampled]` | 片中有一个比片尾次一级的大时刻（穿环、揭晓）：作曲时在它前面全体静默半小节、到它时镲片 + 重拍再起；合成和采样都生效 | 落在最近的拍上，由对拍弹性补齐；主高潮仍是全曲最大的跳变（分析器才不会测错）；**在测试片里用过**（anlan-exec：静默 −39 dB，第二高潮 −18.6 dB，主高潮 −16.2 dB 仍测在 28.70 s、4 个锚点全锚定）。之前靠 sfxDucks 压配乐模拟，现在不用了 |
| 本地作曲 · 真实乐器采样 | `vw music match <片> --local --sampled[=cinematic\|mallets\|chamber]` | 要「大片感」、真实乐器质感，又要卡死高潮：同一份结构化谱，用弦乐组顿弓、低音提琴、大鼓、定音鼓、吊镲渐强（cinematic）/ 马林巴、颤音琴（mallets）/ 竖琴、钢琴、弦乐（chamber）演奏；力度朝高潮走，高潮前一小节收一口气 | 先 `vw py setup` + `vw py fetch instruments vsco2ce` / `vcsl`（都 CC0，共约 700 MB，在 out/opuscar/）；30 秒约 5 秒渲完；**在真片里用过**（anlan-exec v4）；钢琴 `piano`（Salamander）要署名，已有配器默认用 CC0 的立式钢琴 `upright` |
| 口播（可选 VO 层） | 片子有 `audio/voice.json`（`{ engine, voice?, duckDb?, lines: [{ id, text, sec }] }`）才有；`vw voice film <片> [--engine=edge\|kokoro]` 一条命令：逐句配音 → 写回时长和文件 → Whisper 核对 → 字幕 `out/<片>/subtitles.srt`；`index.tsx` 的真值加 `voice`，`FilmAudio` 播放、配乐自动让位 −10 dB | 要口播时。**口播不是默认：要不要口播先问用户** | `vw py fetch voice`；**探针验过**（VoiceProbe：口播期间配乐 −9.8 dB、前后 0 dB，人声高出配乐约 8 dB），还没在真片里用过。Kokoro 英文可用、中文读不准（不能用）；中文用 edge-tts（需联网；7.3.1 实测中文逐句核对全过，`vw voice film` 中文全流程跑通）；`--props '{"vo":false}'` 出无口播版 |
| 口播字幕烧进画面 | `FilmShell` 加 `subtitles`（`true` 用缺省样式，或传部分 `SubtitleStyle`）；组件 `components/Subtitles` | 有口播、观众可能静音看时 | 只在真值有 voice 时生效；缺省是底部半透明条，风格要求的字幕设计由片子传样式或自己画；`vw readcheck` 会查字幕有没有压住画面上的字；**探针 / 测试片验过** |
| 成片里口播还听得清吗 | `vw voice final <片>`；有口播的片子出片时自动跑 | 每部有口播的片 | 按放映时间把成片切成每句再 Whisper 核对；测试：正常混音全过，配乐盖住人声时两句都查出来 |
| 配音工具（单独用） | `vw voice tts <lines.json>`、`vw voice check <lines.json> <目录> --lang=zh`、`vw voice srt <cues.json> <out.srt>` | 试声音、单独核对 | 同上 |
| CC0 配乐：Freesound | `vw music match <片> --source=freesound --brief="minimal piano, calm"` | 要真实乐器 / 特定气质的配乐 | brief 写英文关键词（决策单「声音」一节）；按描述贴合、速度、节拍清晰、高潮位置、口碑打分，剪到段长并把高潮钉到 P0；剪辑超过 16 小节或剪不出来就换下一首，都不行退回本地作曲；没有鼓点爆发的曲子高潮落点可能偏 2–4 秒；首次检索 + 分析约 4–5 分钟 |
| 外部素材（Epidemic） | `vw sfx/music search …` | 有下载权限时 | 当前 key 只能搜不能下 |
| CC0 音效：Freesound | `vw sfx search/pick <片> [槽] --source=freesound` | 要真实质感的音效（拟音、环境、真实材质撞击）；合成做不像的 | `.env` 里 FREESOUND_API_KEY；授权过（`vw sfx freesound auth`）取原始无损文件，否则退回 HQ 预览（ogg ≈192k）；只收 CC0 |
| CC0 音效：Kenney 音效包 | 先 `vw sfx kenney sync`，再 `--source=kenney` | UI 点击、切换、撞击、数字音，干净统一 | 词表窄（按文件名匹配，已做近义词展开）；没有 whoosh / 氛围类 |
| 许可证核对 | `vw review` | 用了外部素材的片子 | manifest 每条外部素材记 source / license / url / author |
| 画面组件的定位 | `src/components/README.md`：**引擎**（时间、画布、3D、镜头桥、字体，直接用）和**参考实现**（界面、光效、逐字聚焦、手绘、画法片段…，读懂后复制进片子改）。`vw review` 出 `out/<片>/vs-past.png`：左边最近几部片（有海报用海报，没有就从成片取代表帧）、右边这部片 | 每部片开工选画法时；交付前看是不是又长成同一个样子 | 和往期片对照在 anlan-window 上跑过 |
| 混音 / 工作台 | `vw studio [片]`（127.0.0.1:5177，界面全中文） | 微调声音、指着画面提批注 | 轨道按层分（配乐 / 口播 / 氛围床 / 质感床 / 起势 / 运动 / 冲击 / 界面，每轨有片段数、层推子、静音、独奏），片段上画轨道色波形；标尺上有配乐段落（前奏 / 起势 / 高潮 / 尾奏，来自实测）、幕、拍点三角；**点片段看参数、再点一次打开候选素材**（试听、换成这条：落定素材 + 重排这一槽，换之前自动存版本；找相似、再搜一批）；**拖播放头看指定帧**（在标尺或轨道空白处按住拖，画面跟着走、吸到整帧，时间码带帧号；缩放后贴边自动滚动）、`←` `→` 逐帧 / 加 `⇧` 逐秒、时间轴缩放（滑块、适配、⌘ + 滚轮）、播放头跟随、倍速试听（0.5–1.5）、上一个 / 下一个拍点（`[` `]`）、撤销 / 重做（⌘Z / ⇧⌘Z）、Esc 取消选中；总线实时电平表（峰值保持）+ 总线推子（写进 mix.json）+ 离线测响度；顶栏显示素材库规模、对拍锁定数和最大偏差帧数、版本有没有未存的改动。口播轨（有 voice.json 时）的播放和配乐让位与成片同式（`studio-parity.test.ts` 锁着）。**在测试片里用过**（anlan-window：换素材往返后计划逐字节一致） |
| 响度母带（−14 LUFS / 真峰 ≤ −1.2 dBTP） | 出片第 3 段自动做（`scripts/render/master.ts`）；`VW_NO_MASTER=1` 关掉 | 每部片 | 限幅只削瞬态 + 纯增益，不压动态（loudnorm 动态模式实测把 LRA 5.0 压到 2.3，弃用）；音画偏移 0 |

## 7. 质检与交付
| 能力 | 在哪 |
|---|---|
| 守门：类型、确定性、拍点、幕表、配乐覆盖率、色板、弹性区、动作事件覆盖 | `vw check <片>` |
| 导演自检（对照决策单 + 质量提示） | `vw review <片>` |
| 运动 / 闪帧 / 孤帧 | `vw motion`、`vw qa flicker / odd` |
| 出片（三段式 + 验收） | `vw render <片> --mode=final` |
| 封存 / 新旧对比 | `vw archive save`、`<片>-Compare-<标签>` |
| 风格库（自有 + 收录的 lemo-opuscar 59 个完整风格；只有完整的风格才进库） | `vw style list`；约束读 `src/styles/<id>/STYLE.md`，样片源码 `vw style demo <id>` |
| 片段风格参考（OPUSCAR 98，98 个，不是风格库） | `docs/library/opuscar98/README.md`：某一段画面想借某种质感时读 |
| 风格库总览页（海报按分类排，点开内嵌播放上游样片、看 STYLE.md 和参考帧） | `vw style gallery [--open] [--videos]` → `out/styles/gallery.html`（导入、keep 后自动更新）；样片默认在线播上游画廊的网页版，`--videos` 缓存到 `out/opuscar/films/` 后离线也能播 |
| 风格索引（按分类、自有在前，挑风格时贴给用户） | `vw style index` → `src/styles/README.md`（收录导入、keep 后自动更新） |
| 和样片对照（沿用库里风格时：六项至少四项不同） | 决策单「和样片对照」；`vw review` 检查并拼 `out/<片>/vs-demo.png` |
| 分镜（用户要了才做） | `vw storyboard <片> --shots=<json>`：6–9 格，每格镜头号 / 景别 / 时长 / 台词 |
| 海报图 | 出片时自动：P0 拍点那一刻 → `out/<片>/poster.jpg` |
| 改成你自己的风格（一题一题定 → 风格帧并排 → 样片 → 点头进库） | `vw style fork` / `vw style vs` / `vw style keep`，流程 `docs/method/style-workshop.md` |
| 字体落地（风格点名的字体取到本地；中日韩按片子取子集） | `vw font fetch "<字体>" [--weights=] [--italic] [--film=<片>]` → `public/fonts/<slug>/`；片子里 `useLocalFonts(['<slug>'])`（`components/fonts`）；探针 FontProbe 验过 |
| 风格样张（只看气质：色板、字号阶梯、墨线、图框） | `vw style sheet <id>` |
| 沉淀风格（用户认可某部片的样子后，把它的主题收进风格库） | `vw style save <片> --id=<风格id> [--label=]` |
| 频段平衡（低频相对中频，建议约 −3 dB） | 出片验收自动量（`verify.measureBands`）；> 0 偏闷、< −9 偏薄就提示 |
| CREDITS（第三方素材来源与授权，CC BY 单列） | `vw credits <片>` → `out/<片>/CREDITS.md`；出片时自动生成 |
| 读字检查（每段字完整可读的时间够不够读完：中文 字数÷4.5+1.5s，英文 字符÷15+1.5s；另查字幕压字） | `vw readcheck <片> [--step=0.2]` → `out/<片>/readcheck.json`；`vw review` 读它给提示 |
| 按秒抽静帧（关键帧、海报帧；只打包一次） | `vw still <片> --at=1.2,3.4`（探针合成自动用 `src/probe/index.ts`，或 `--entry=`） |
| 连拍（一段时间里的每一帧拼一张：看预备、跟随、跳帧、抖动、转场） | `vw still <合成> --strip=2.0:2.5 [--cols=6]` |
| 局部放大（原分辨率看脸、手、接触点、光晕） | `vw still <合成> --at=… 或 --strip=… --crop=x,y,w,h` |
| 成片缩略图（设计评审用） | `vw sheet <片\|mp4>` |
| 参考片抽帧 + 观察笔记模板 | `vw ref <视频> --out=<目录>` |
| 经验（读 / 记） | `vw learn [主题]`、`vw learn add …` |
| 硬件档位 | `vw hw` |
