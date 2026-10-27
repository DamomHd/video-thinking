import fs from 'node:fs';
import path from 'node:path';

export interface Violation {
  file: string;
  line: number;
  rule: string;
  detail: string;
}

/**
 * 成片所有 <Audio> 都必须挂在统一的声音层里（FilmAudio / CueAudio）。
 * 否则出音轨的那个合成（<片>-Audio）会漏掉它 —— 画面里有声音、成片里没有。
 * 这是原版 §21 S11 点名的风险，原版只写在注释里，这里改成守门。
 */
const AUDIO_HOST_FILES = ['FilmAudio.tsx', 'CueAudio.tsx'];

/**
 * §11 的数据规则：模拟 / 演示数据上屏必须标注。
 * 这里只做一件很轻的事 —— 文件里出现「演示数据 / 模拟 / 样例数据」这类词时，
 * 要求同一个文件里也出现把它显示出来的标注文案，否则提醒人工确认。
 */
const DEMO_DATA_HINTS = [/演示数据/, /模拟数据/, /样例数据/, /mock\s*data/i, /demo\s*data/i];
const DEMO_LABEL_HINTS = [/演示数据/, /模拟/, /DEMO/i, /示例/];

const FORBIDDEN_PATTERNS = [
  { regex: /\btransition\s*:/i, rule: 'FORBID_CSS_TRANSITION', desc: '禁止 CSS transition 动画（逐帧渲染无法推进）' },
  { regex: /\banimation\s*:/i, rule: 'FORBID_CSS_ANIMATION', desc: '禁止 CSS animation 动画' },
  { regex: /@keyframes/i, rule: 'FORBID_KEYFRAMES', desc: '禁止 @keyframes 规则' },
  { regex: /\bMath\.random\s*\(/, rule: 'FORBID_MATH_RANDOM', desc: '禁止 Math.random()，请改用 shared/anim 的 mulberry32' },
  { regex: /\bDate\.now\s*\(/, rule: 'FORBID_DATE_NOW', desc: '禁止 Date.now()，必须使用帧时间纯函数' },
  { regex: /\bperformance\.now\s*\(/, rule: 'FORBID_PERF_NOW', desc: '禁止 performance.now()' },
  {
    regex: /\buseFrame\s*\(/,
    rule: 'FORBID_USE_FRAME',
    desc: '禁止 useFrame（R3F 帧循环靠时钟推进）：时间 t 由幕组件按 Remotion 帧号算好当 prop 传入，相机用 CameraRig / PoseCamera 摆位',
  },
];

/**
 * 确定性静态扫描：
 * 递归扫描源码目录，确保每一帧都是时间的纯函数
 */
export function checkDeterminism(filmId: string): Violation[] {
  const projectRoot = process.cwd();
  /**
   * 扫描范围要覆盖所有会进 bundle 的源码。
   * 原版的已知债 S2 就是「guard 只扫了一部分目录」—— 没扫到的地方出现 CSS 动画时没人管。
   * 这里把 shared / probe / 衍生片目录一并纳入；只有脚本侧（scripts/、tools/）不扫，
   * 因为它们在 Node 里跑，不受逐帧渲染的确定性约束。
   */
  const targetDirs = [
    path.join(projectRoot, 'src', 'films', filmId),
    path.join(projectRoot, 'src', 'components'),
    path.join(projectRoot, 'src', 'shared'),
    path.join(projectRoot, 'src', 'probe'),
  ];

  const violations: Violation[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'out') {
          scanDir(fullPath);
        }
      } else if (/\.(tsx?|jsx?|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        const rel = path.relative(projectRoot, fullPath);

        let delayRenderCount = 0;
        let continueRenderCount = 0;

        lines.forEach((line, idx) => {
          // 忽略单行注释与 eslint 禁用
          const trimmed = line.trim();
          if (trimmed.startsWith('//') || trimmed.startsWith('/*')) return;

          for (const pat of FORBIDDEN_PATTERNS) {
            if (pat.regex.test(line)) {
              violations.push({
                file: rel,
                line: idx + 1,
                rule: pat.rule,
                detail: pat.desc,
              });
            }
          }

          if (line.includes('delayRender(')) delayRenderCount++;
          if (line.includes('continueRender(')) continueRenderCount++;
        });

        // 规则：<Audio> 只能出现在统一的声音层里
        if (!AUDIO_HOST_FILES.includes(entry.name)) {
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
            if (/<Audio[\s/>]/.test(line)) {
              violations.push({
                file: rel,
                line: idx + 1,
                rule: 'AUDIO_OUTSIDE_HOST',
                detail:
                  `<Audio> 必须挂在 ${AUDIO_HOST_FILES.join(' / ')} 里，` +
                  `否则 <片>-Audio 合成出音轨时会漏掉它（画面有声、成片没声）`,
              });
            }
          });
        }

        // 规则：演示数据上屏要有标注
        const hasDemoData = DEMO_DATA_HINTS.some((re) => re.test(content));
        const hasDemoLabel = DEMO_LABEL_HINTS.some((re) => re.test(content));
        if (hasDemoData && !hasDemoLabel) {
          violations.push({
            file: rel,
            line: 1,
            rule: 'DEMO_DATA_UNLABELED',
            detail: '文件里有演示 / 模拟数据，但没有把「演示数据」字样显示出来（§11 的数据规则）',
          });
        }

        if (delayRenderCount !== continueRenderCount) {
          violations.push({
            file: rel,
            line: 1,
            rule: 'UNMATCHED_DELAY_RENDER',
            detail: `delayRender (${delayRenderCount}) 与 continueRender (${continueRenderCount}) 调用次数不一致，可能导致渲染死锁`,
          });
        }
      }
    }
  }

  for (const d of targetDirs) {
    scanDir(d);
  }

  return violations;
}
