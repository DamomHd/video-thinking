"""
已迁移：机身预渲染脚本的唯一实现在 blender/loomcare/phone.py

这里原来是第二份副本，与真实使用的那份已经分叉（旧副本不摆位相机、无条件写
complete: True），容易被误用，因此改成指针。

正确用法由 scripts/blender/render.ts 驱动：
  vw blender track <film>     # 从机位单源导出 out/<片>/blender/track.json + 签名
  vw blender render <film>    # 调 blender -b <scene.blend> -Y --factory-startup \
                              #      -P blender/loomcare/phone.py -- <film>
"""

import os
import sys

CANONICAL = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "blender", "loomcare", "phone.py"
)

print("[phone.py] 本文件已废弃。唯一实现：blender/loomcare/phone.py")
print(f"           绝对路径: {os.path.abspath(CANONICAL)}")
print("           请改用 `vw blender render <film>`。")
sys.exit(2)
