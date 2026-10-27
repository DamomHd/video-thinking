"""
体积光 (rays.py)：Remotion 剪影序列 → Blender 合成器 Sun Beams → 光束 PNG 序列
（architecture.html §8「Remotion → Blender → Remotion」：BakeCloseMask → close-rays.py → CloseRaysVol）

输入是 Remotion 渲出来的剪影 PNG 序列（亮的地方是光源 / 透光的缝，黑的地方挡光），
Blender 合成器的 Sun Beams 沿「光源点 → 像素」方向做径向拖影，得到体积光；
输出带 alpha 的 PNG 序列，回到 Remotion 用 screen 叠加（components/three/RaysOverlay）。

为什么不在浏览器里做：径向模糊要几十次采样，Remotion 逐帧截屏时每帧都要在 Chrome 里算一遍，
还要扛 WebGL 上下文；离线交给 Blender 合成器一次算完，渲片时只是贴图。

执行（由 `vw blender rays` 驱动）:
  blender -b -Y --factory-startup -P blender/fx/rays.py -- \
      --in=<剪影目录> --out=<输出目录> [--source=0.5,0.35] [--length=0.25] [--color=1,0.85,0.55] [--gain=1.6]

  --source  光源位置，画面归一化坐标，左下为 (0,0)（Blender 合成器的口径）
  --length  光束长度，占画面对角线的比例
"""

import os
import sys
import glob
import struct

import bpy


def arg(name, default=None):
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def floats(s, n):
    v = [float(x) for x in s.split(",")]
    if len(v) != n:
        raise ValueError(s)
    return v


def main():
    src = arg("in")
    out = arg("out")
    if not src or not out:
        print("[rays] 错误: 需要 --in=<剪影目录> --out=<输出目录>")
        sys.exit(1)
    frames = sorted(glob.glob(os.path.join(src, "*.png")))
    if not frames:
        print(f"[rays] 错误: {src} 下没有 PNG")
        sys.exit(1)
    sx, sy = floats(arg("source", "0.5,0.35"), 2)
    length = float(arg("length", "0.25"))
    color = floats(arg("color", "1,0.85,0.55"), 3)
    gain = float(arg("gain", "1.6"))
    os.makedirs(out, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    # 尺寸直接读 PNG 文件头：images.load 是懒加载，切成 SEQUENCE 之后 size 读出来是 0
    with open(frames[0], "rb") as f:
        head = f.read(24)
    w, h = struct.unpack(">II", head[16:24])
    img = bpy.data.images.load(frames[0])
    img.source = "SEQUENCE"
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.engine = "BLENDER_WORKBENCH"  # 场景是空的，只用合成器
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.frame_start = 1
    scene.frame_end = len(frames)

    scene.use_nodes = True
    nt = scene.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    node_img = nt.nodes.new("CompositorNodeImage")
    node_img.image = img
    node_img.frame_duration = len(frames)
    node_img.frame_start = 1
    node_img.frame_offset = 0

    # 剪影 → 灰度 → 光束
    bw = nt.nodes.new("CompositorNodeRGBToBW")
    beams = nt.nodes.new("CompositorNodeSunBeams")
    beams.source = (sx, sy)
    beams.ray_length = length
    # 着色 + 增益
    tint = nt.nodes.new("CompositorNodeMixRGB")
    tint.blend_type = "MULTIPLY"
    tint.inputs[0].default_value = 1.0
    tint.inputs[2].default_value = (color[0] * gain, color[1] * gain, color[2] * gain, 1.0)
    # 亮度当 alpha：screen 叠加时黑的地方完全不影响底图
    alpha = nt.nodes.new("CompositorNodeSetAlpha")
    alpha.mode = "APPLY"
    out_node = nt.nodes.new("CompositorNodeComposite")

    nt.links.new(node_img.outputs["Image"], bw.inputs[0])
    nt.links.new(bw.outputs[0], beams.inputs[0])
    nt.links.new(beams.outputs[0], tint.inputs[1])
    nt.links.new(tint.outputs[0], alpha.inputs["Image"])
    nt.links.new(beams.outputs[0], alpha.inputs["Alpha"])
    nt.links.new(alpha.outputs[0], out_node.inputs["Image"])

    # 逐帧写：先写临时名再 rename，序号与输入一致（从 0000 开始）
    for i in range(len(frames)):
        scene.frame_set(i + 1)
        target = os.path.join(out, f"{i:04d}.png")
        tmp = os.path.join(out, f".{i:04d}.part.png")
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        os.replace(tmp, target)
    print(f"[rays] {len(frames)} 帧 → {out}")


if __name__ == "__main__":
    main()
