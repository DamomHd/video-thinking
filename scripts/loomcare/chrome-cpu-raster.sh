#!/usr/bin/env bash
# 已迁移：唯一实现在 scripts/render/chrome-cpu-raster.sh
# 这里原来是第二份副本，内容会分叉，改成转发。
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")/../render" && pwd)/chrome-cpu-raster.sh" "$@"
