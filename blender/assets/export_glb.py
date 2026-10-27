"""
.blend → glb + 尺寸单源 JSON（architecture.html §8「出资产给 three」）

three.js 层要用 Blender 建好的模型时，不手抄尺寸：
导出 glb 的同时把每个顶层对象的包围盒（three 坐标系，单位与 .blend 一致）写成 JSON，
TS 侧 import 这份 JSON 做布局，模型改了尺寸跟着变。

执行（由 `vw blender glb` 驱动）:
  blender -b <scene.blend> -Y --factory-startup -P blender/assets/export_glb.py -- --out=<x.glb> --meta=<x.json>

约定：
  - Holdout 材质（比如机身屏幕的洞）在 glb 里没有对应物，导出时换成纯黑哑光，three 侧再贴 DOM / 贴图
  - glTF 是 Y 朝上：blender (x, y, z) → three (x, z, −y)，export_yup 负责，这里的包围盒也按这个口径写
"""

import os
import sys
import json

import bpy
import mathutils


def arg(name, default=None):
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def blender_to_three(v):
    return (v[0], v[2], -v[1])


def bbox_three(objs):
    lo = [float("inf")] * 3
    hi = [float("-inf")] * 3
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = blender_to_three(o.matrix_world @ mathutils.Vector(c))
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    if lo[0] == float("inf"):
        return None
    r = lambda v: round(v, 4)
    return {
        "min": [r(v) for v in lo],
        "max": [r(v) for v in hi],
        "size": [r(hi[i] - lo[i]) for i in range(3)],
        "center": [r((hi[i] + lo[i]) / 2) for i in range(3)],
    }


def descendants(o):
    out = [o]
    for c in o.children:
        out += descendants(c)
    return out


def main():
    out = arg("out")
    meta = arg("meta")
    if not out:
        print("[export_glb] 错误: 需要 --out=<x.glb>")
        sys.exit(1)

    # Holdout 在 glTF 里没有对应物，换成黑色哑光
    for m in bpy.data.materials:
        if m.use_nodes and any(n.type == "HOLDOUT" for n in m.node_tree.nodes):
            nt = m.node_tree
            for n in list(nt.nodes):
                if n.type == "HOLDOUT":
                    nt.nodes.remove(n)
            b = nt.nodes.new("ShaderNodeBsdfPrincipled")
            b.inputs["Base Color"].default_value = (0, 0, 0, 1)
            b.inputs["Roughness"].default_value = 0.9
            nt.links.new(b.outputs[0], nt.nodes["Material Output"].inputs["Surface"])

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )

    roots = [o for o in bpy.context.scene.objects if o.parent is None and o.type in ("MESH", "EMPTY")]
    info = {
        "source": os.path.basename(bpy.data.filepath),
        "glb": os.path.basename(out),
        "units": "blend",
        "axes": "three (y up)",
        "objects": {},
    }
    for r in roots:
        bb = bbox_three(descendants(r))
        if bb:
            info["objects"][r.name] = bb
    if meta:
        os.makedirs(os.path.dirname(os.path.abspath(meta)), exist_ok=True)
        tmp = meta + ".part"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(info, f, indent=2, ensure_ascii=False)
        os.replace(tmp, meta)
    print(f"[export_glb] glb → {out}")
    if meta:
        print(f"[export_glb] 尺寸单源 → {meta}  ({', '.join(info['objects'].keys())})")


if __name__ == "__main__":
    main()
