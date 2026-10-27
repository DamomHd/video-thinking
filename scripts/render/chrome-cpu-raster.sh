#!/usr/bin/env bash
set -euo pipefail

# CPU 栅格化的 Chrome 包装脚本（对标 architecture.html §9.5）
#
# 做的事只有一件：给 Remotion **自带的** chrome-headless-shell 加上
#   --disable-gpu-rasterization
# 于是页面元素（DOM / SVG）改由 CPU 的 Skia 软件栅格化，而 WebGL 仍然走 GPU（ANGLE）。
#
# 为什么要这样：透视 3D 层里的 SVG 描边在 GPU 栅格化下会隔几帧被画成一半宽，
# 而且只在渲整幕时出现，单渲一小段看不到。CPU 栅格化的结果是确定的。
#
# 两条纪律：
#   1. 必须用 Remotion 自带的那个二进制 —— §9.6 要求母片、成片、Studio
#      三处用同一个后端，才能出同一份像素。退回系统 Chrome 会破坏这一点。
#   2. 只加 --disable-gpu-rasterization。
#      不要加 --disable-software-rasterizer（那会关掉 SwiftShader 这个 GL 兜底，
#      反而可能让 WebGL 起不来），也不要加与栅格化无关的 flag。

find_remotion_chrome() {
  # Remotion 4.x 把二进制放在项目的 node_modules/.remotion 下
  local roots=(
    "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/node_modules/.remotion"
    "$HOME/Library/Caches/remotion"
    "$HOME/.cache/remotion"
  )
  for r in "${roots[@]}"; do
    [ -d "$r" ] || continue
    local found
    found=$(find "$r" -type f -name 'chrome-headless-shell' -perm -u+x 2>/dev/null | head -n 1)
    if [ -n "$found" ]; then
      echo "$found"
      return 0
    fi
  done
  return 1
}

CHROMIUM_BIN="${REMOTION_CHROME_BIN:-}"
if [ -z "$CHROMIUM_BIN" ]; then
  CHROMIUM_BIN="$(find_remotion_chrome || true)"
fi

if [ -z "$CHROMIUM_BIN" ]; then
  echo "[chrome-cpu-raster] 找不到 Remotion 自带的 chrome-headless-shell。" >&2
  echo "[chrome-cpu-raster] 先跑一次普通渲染让 Remotion 下载它，或用 REMOTION_CHROME_BIN 指定路径。" >&2
  echo "[chrome-cpu-raster] 不退回系统 Chrome —— 换了浏览器就不是同一份像素了（§9.6）。" >&2
  exit 1
fi

exec "$CHROMIUM_BIN" --disable-gpu-rasterization "$@"
