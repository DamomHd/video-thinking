import { Config } from '@remotion/cli/config';

// 1. 设置默认输出图像格式为 PNG
Config.setVideoImageFormat('png');

// 2. 超采样（SSAA）与编码拦截钩子：
// 当指定 LOOMCARE_SSAA=2 或 VW_SSAA=2 时，将 4K 截帧用面积滤波（flags=area）高质量缩回 1080p
Config.overrideFfmpegCommand(({ args }) => {
  const isSSAA = process.env.VW_SSAA === '2' || process.env.LOOMCARE_SSAA === '2';
  if (!isSSAA) return args;

  // 严格守门：若当前 ffmpeg 调用为 copy 模式（如 faststart 或 remux），绝不能挂载滤镜
  const isStreamCopy =
    args.includes('copy') ||
    args.some((a, i) => (args[i - 1] === '-c:v' || args[i - 1] === '-c') && a === 'copy');
  if (isStreamCopy) return args;

  const newArgs = [...args];
  const vfIndex = newArgs.indexOf('-vf');
  const scaleFilter = 'scale=iw/2:ih/2:flags=area';

  if (vfIndex !== -1) {
    const existingFilter = newArgs[vfIndex + 1];
    if (!existingFilter.includes('scale=')) {
      newArgs[vfIndex + 1] = `${scaleFilter},${existingFilter}`;
    }
  } else {
    const cIndex = newArgs.indexOf('-c:v');
    if (cIndex !== -1) {
      newArgs.splice(cIndex, 0, '-vf', scaleFilter);
    }
  }

  return newArgs;
});

// 3. Chromium 无头浏览器启动参数配置
// 针对 macOS 透视 3D 层 SVG 描边半宽 bug，允许通过环境变量切换为 CPU 栅格化模式
Config.setChromiumOpenGlRenderer('angle');
Config.setChromiumMultiProcessOnLinux(true);
