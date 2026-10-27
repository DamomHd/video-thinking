"""
场景搭建器 (build_scene.py)：场景 JSON → .blend（可选渲一张预览）

场景 JSON 用 three 的坐标约定（y 朝上，单位自定），和 TS 侧的世界坐标一致；这里统一换基 (x, y, z) → (x, −z, y)。

{
  "scale": 1,                                  // 场景尺度：物体大约多大（灯光 / 纹理按它缩放）
  "lighting": "softbox", "world": "#EDE6DA",
  "objects": [
    {"name": "Base", "prim": "plane", "size": [20, 20], "pos": [0, 0, 0], "material": {"preset": "paper", "color": "#EDE6DA"}},
    {"name": "Blob", "prim": "roundbox", "size": [2, 1.4, 2], "bevel": 0.35, "pos": [0, 0.7, 0], "rot": [0, 20, 0],
     "material": {"preset": "clay", "color": "#C8553D"},
     "anim": [{"t": 0, "pos": [0, 0.7, 0]}, {"t": 2, "pos": [3, 0.7, 0], "rot": [0, 200, 0]}]}
  ],
  "camera": {"pos": [8, 6, 10], "look": [0, 0.5, 0], "fov": 30}  或  {"track": "out/flight/x.json"},
  "fps": 24, "durationSec": 3,
  "stepped": {"fps": 12, "jitter": 0.01, "rotJitterDeg": 0.6, "seed": 1},   // 黏土定格：每秒 12 张 + 每张的错位
  "render": {"engine": "CYCLES", "samples": 64, "resolution": [1920, 1080]}
}

prim：box / roundbox / sphere / cylinder / torus / plane / cone
rot：角度（度），three 的 XYZ 欧拉；换基后按 phone.py 同一套规则（'YZX'，见 src/shared/blender-basis.test.ts）。

执行（由 `vw blender scene` 驱动）:
  blender -b -Y --factory-startup -P blender/scene/build_scene.py -- --spec=<json> --out=<.blend> [--still=<秒>] [--png=<路径>] [--samples=]
"""

import os
import sys
import json
import math
import random

import bpy
import mathutils

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "presets"))
from materials import make_material, apply_lighting  # noqa: E402


def arg(name, default=None):
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def t2b(v):
    return mathutils.Vector((v[0], -v[2], v[1]))


def rot_t2b(deg):
    """three 欧拉 XYZ（度）→ Blender 欧拉 'YZX'（与 phone.py 一致）"""
    a, b, c = (math.radians(x) for x in deg)
    return mathutils.Euler((a, -c, b), "YZX")


def make_prim(o):
    prim = o.get("prim", "box")
    size = o.get("size", [1, 1, 1])
    name = o.get("name", prim)
    # 先在 three 局部系建（x 宽 y 高 z 深），再整体换基：用一个父级空物体承载换基，子物体保持 three 语义
    if prim in ("box", "roundbox"):
        bpy.ops.mesh.primitive_cube_add(size=1)
        ob = bpy.context.active_object
        ob.scale = (size[0], size[2], size[1])  # blender (x, y, z) = three (x, z, y)
        bpy.ops.object.transform_apply(scale=True)
        if prim == "roundbox":
            mod = ob.modifiers.new("Bevel", "BEVEL")
            mod.width = o.get("bevel", 0.2)
            mod.segments = 6
            mod.limit_method = "NONE"
            ob.modifiers.new("Subsurf", "SUBSURF").levels = 1
    elif prim == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=size[0] / 2, segments=64, ring_count=32)
        ob = bpy.context.active_object
    elif prim == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(radius=size[0] / 2, depth=size[1], vertices=64)
        ob = bpy.context.active_object
    elif prim == "cone":
        bpy.ops.mesh.primitive_cone_add(radius1=size[0] / 2, depth=size[1], vertices=64)
        ob = bpy.context.active_object
    elif prim == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=size[0] / 2, minor_radius=size[1] / 2, major_segments=64, minor_segments=24)
        # Blender 的圆环缺省平躺在 xy 平面（轴朝 z 上）= three 里躺在 xz 平面，不用转
        ob = bpy.context.active_object
    elif prim == "plane":
        bpy.ops.mesh.primitive_plane_add(size=1)
        ob = bpy.context.active_object
        ob.scale = (size[0], size[1] if len(size) > 1 else size[0], 1)
        bpy.ops.object.transform_apply(scale=True)
    else:
        raise ValueError(f"未知 prim: {prim}")
    if prim not in ("plane",):
        for p in ob.data.polygons:
            p.use_smooth = True
    ob.name = name
    return ob


def place(ob, pos=None, rot=None):
    if pos is not None:
        ob.location = t2b(pos)
    if rot is not None:
        ob.rotation_mode = "YZX"
        ob.rotation_euler = rot_t2b(rot)


def main():
    spec_path = arg("spec")
    out = arg("out")
    if not spec_path or not out:
        print("[build_scene] 错误: 需要 --spec=<json> --out=<.blend>")
        sys.exit(1)
    with open(spec_path, "r", encoding="utf-8") as f:
        spec = json.load(f)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scale = float(spec.get("scale", 1.0))
    fps = int(spec.get("fps", 24))
    dur = float(spec.get("durationSec", 0))
    scene.render.fps = fps
    scene.frame_start = 0
    scene.frame_end = max(0, round(dur * fps))

    stepped = spec.get("stepped")
    step_every = max(1, round(fps / stepped["fps"])) if stepped else 1
    rnd = random.Random(stepped.get("seed", 1) if stepped else 1)

    for o in spec.get("objects", []):
        ob = make_prim(o)
        mat = o.get("material", {})
        ob.data.materials.append(make_material(f"{ob.name}-mat", mat.get("preset", "matte"), mat.get("color", "#D9CBB4"), scale=scale, **{k: v for k, v in mat.items() if k not in ("preset", "color")}))
        place(ob, o.get("pos", [0, 0, 0]), o.get("rot", [0, 0, 0]))

        keys = o.get("anim") or []
        if keys:
            # 关键帧（秒）之间线性插值；定格模式下每 step_every 帧取一次样、CONSTANT 保持，再叠每张的错位
            keys = sorted(keys, key=lambda k: k["t"])

            def sample(t, field, fallback):
                prev = None
                for k in keys:
                    if field not in k:
                        continue
                    if k["t"] >= t:
                        if prev is None or k["t"] == prev["t"]:
                            return k[field]
                        u = (t - prev["t"]) / (k["t"] - prev["t"])
                        return [a + (b - a) * u for a, b in zip(prev[field], k[field])]
                    prev = k
                return prev[field] if prev else fallback

            for fr in range(scene.frame_start, scene.frame_end + 1, step_every):
                t = fr / fps
                pos = sample(t, "pos", o.get("pos", [0, 0, 0]))
                rot = sample(t, "rot", o.get("rot", [0, 0, 0]))
                if stepped:
                    j = stepped.get("jitter", 0.01) * scale
                    rj = stepped.get("rotJitterDeg", 0.5)
                    pos = [p + rnd.uniform(-j, j) for p in pos]
                    rot = [r + rnd.uniform(-rj, rj) for r in rot]
                place(ob, pos, rot)
                ob.keyframe_insert("location", frame=fr)
                ob.keyframe_insert("rotation_euler", frame=fr)
            if ob.animation_data and ob.animation_data.action:
                for fc in ob.animation_data.action.fcurves:
                    for kp in fc.keyframe_points:
                        kp.interpolation = "CONSTANT" if stepped else "LINEAR"

    apply_lighting(spec.get("lighting", "softbox"), spec.get("world", "#EDE6DA"), spec.get("worldStrength", 0.6), scale)

    # 相机：静态机位，或漫游轨迹（vw blender flight 导出的 JSON）
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 0.01 * scale
    cam_data.clip_end = 1000 * scale
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.rotation_mode = "QUATERNION"
    camspec = spec.get("camera", {"pos": [8, 6, 10], "look": [0, 0, 0], "fov": 30})
    if "track" in camspec:
        with open(camspec["track"], "r", encoding="utf-8") as f:
            track = json.load(f)
        for fr in track["frames"]:
            cam.location = t2b(fr["pos"])
            cam.rotation_quaternion = (t2b(fr["look"]) - cam.location).to_track_quat("-Z", "Y") @ mathutils.Quaternion((0, 0, 1), fr.get("roll", 0))
            cam.data.angle_y = math.radians(fr["fov"])
            cam.keyframe_insert("location", frame=fr["k"])
            cam.keyframe_insert("rotation_quaternion", frame=fr["k"])
            cam.data.keyframe_insert("lens", frame=fr["k"])
        scene.frame_end = max(scene.frame_end, track["frames"][-1]["k"])
    else:
        cam.location = t2b(camspec["pos"])
        cam.rotation_quaternion = (t2b(camspec.get("look", [0, 0, 0])) - cam.location).to_track_quat("-Z", "Y")
        cam_data.angle_y = math.radians(camspec.get("fov", 30))

    r = spec.get("render", {})
    res = r.get("resolution", [1920, 1080])
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    if r.get("engine", "CYCLES").upper() == "CYCLES":
        scene.render.engine = "CYCLES"
    else:
        # EEVEE 的引擎名在 4.2–4.x 是 BLENDER_EEVEE_NEXT，之前 / 之后是 BLENDER_EEVEE
        names = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in names else "BLENDER_EEVEE"
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = int(arg("samples", r.get("samples", 64)))
        scene.cycles.use_denoising = True
        scene.cycles.device = "CPU"
        try:
            cp = bpy.context.preferences.addons["cycles"].preferences
            cp.compute_device_type = "METAL"
            cp.get_devices()
            if [d for d in cp.devices if d.type != "CPU"]:
                for d in cp.devices:
                    d.use = True
                scene.cycles.device = "GPU"
        except Exception:
            pass
    scene.view_settings.view_transform = "AgX"

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out), compress=True)
    print(f"[build_scene] 场景 → {out}（{len(spec.get('objects', []))} 个物体，灯光 {spec.get('lighting', 'softbox')}，{'定格 ' + str(stepped['fps']) + ' 张/秒' if stepped else '连续'}）")

    still = arg("still")
    if still is not None:
        png = arg("png") or os.path.splitext(out)[0] + ".png"
        scene.frame_set(round(float(still) * fps))
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = png
        bpy.ops.render.render(write_still=True)
        print(f"[build_scene] 预览 → {png}（{scene.render.engine} · {scene.cycles.samples if scene.render.engine == 'CYCLES' else ''} 采样 · {scene.cycles.device if scene.render.engine == 'CYCLES' else ''}）")


if __name__ == "__main__":
    main()
