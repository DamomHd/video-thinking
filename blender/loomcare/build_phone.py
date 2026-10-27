"""
程序化机身场景 (build_phone.py) → public/models/phone.blend

architecture.html §8 的机身用的是外部 .blend（Sketchfab，商用许可待确认）。
这里改成按 src/films/<片>/three/phoneGeo.ts 的 PHONE_SPECS 程序化建模：
尺寸单源、没有许可问题、谁拉下仓库都能重建。

场景约定（phone.py 依赖）：
  - 对象 "Phone"：机身父级，原点在机身中心，局部坐标已按 three → blender 换基
    （three 的 x / y / z → blender 的 x / −y… 即屏幕朝 blender −Y）
  - 一个相机（phone.py 每帧重新摆位）
  - 灯光是「产品棚」：两条长条柔光从侧后方掠过金属边框，一盏顶光，环境极暗 ——
    苹果官网那种边框上一道亮线、机身其余沉在暗里的质感

执行：
  blender -b -Y --factory-startup -P blender/loomcare/build_phone.py -- [--out=public/models/phone.blend]
"""

import os
import sys
import math

import bpy
import bmesh

# 与 src/films/loomcare-demo/three/phoneGeo.ts 的 PHONE_SPECS 一致（mm）
W, H, D = 71.5, 146.7, 7.65
R = 10.0
SCREEN_W, SCREEN_H, SCREEN_Z = 68.0, 143.0, 3.83
SCREEN_R = 8.5
RIM_BEVEL = 1.6


def arg(name, default):
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def t2b(x, y, z):
    """three (x, y, z) → blender (x, −z, y)"""
    return (x, -z, y)


def rounded_slab(name, w, h, d, r, rim):
    """圆角矩形厚板：先倒四条竖边（外形圆角），再倒前后两圈边（边框倒角）"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(w, h, d), verts=bm.verts)  # 先在 three 局部系里建：x 宽 y 高 z 厚
    vertical = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > d * 0.5]
    bmesh.ops.bevel(bm, geom=vertical, offset=r, segments=18, profile=0.5, affect="EDGES")
    if rim > 0:
        rims = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6
                and abs(abs(e.verts[0].co.z) - d / 2) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=rim, segments=5, profile=0.5, affect="EDGES")
    # three 局部 → blender 局部
    for v in bm.verts:
        v.co = t2b(v.co.x, v.co.y, v.co.z)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def rounded_plane(name, w, h, r, z):
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=0.5)
    bmesh.ops.scale(bm, vec=(w, h, 1), verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.verts[:], offset=r, segments=14, profile=0.5, affect="VERTICES")
    for v in bm.verts:
        v.co = t2b(v.co.x, v.co.y, z)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def principled(name, color, metallic, roughness, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    if coat > 0 and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.03
    return m


def area_light(name, loc, rot, size, size_y, energy, color=(1, 1, 1)):
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    data.energy = energy
    data.color = color
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    obj.rotation_euler = rot
    bpy.context.scene.collection.objects.link(obj)
    return obj


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../.."))
    out = os.path.join(root, arg("out", "public/models/phone.blend"))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "NONE"  # 1 单位 = 1mm，和 three 侧一致

    phone = bpy.data.objects.new("Phone", None)
    scene.collection.objects.link(phone)

    body = rounded_slab("PhoneBody", W, H, D, R, RIM_BEVEL)
    body.data.materials.append(principled("Titanium", (0.36, 0.37, 0.39), 1.0, 0.32))
    body.parent = phone

    # 前面板玻璃：比机身略小一圈，压在前表面上
    glass = rounded_plane("FrontGlass", W - 2.2, H - 2.2, R - 1.1, D / 2 + 0.02)
    glass.data.materials.append(principled("BlackGlass", (0.005, 0.005, 0.006), 0.0, 0.05, coat=1.0))
    glass.parent = phone

    # 屏幕区域：Holdout（渲出来是透明洞）。DOM 屏幕按四角不透明地贴在这里，底下的像素永远看不到，
    # 打成洞之后光线一碰就停 —— 黑屏玻璃是全画面最贵的部分（多次反射），CPU 渲染省掉一大半。
    # 洞的圆角 8.5mm 比 DOM 屏幕的圆角（宽的 10% ≈ 6.8mm）更圆，所以洞永远落在 DOM 屏幕里面，不会透底。
    screen = rounded_plane("Screen", SCREEN_W, SCREEN_H, SCREEN_R, SCREEN_Z + 0.03)
    sm = bpy.data.materials.new("ScreenHoldout")
    sm.use_nodes = True
    nt = sm.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    nt.links.new(nt.nodes.new("ShaderNodeHoldout").outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    screen.data.materials.append(sm)
    screen.parent = phone

    # 侧键：右侧电源键、左侧音量键（让侧光在边框上有断点，不像一块肥皂）
    def key(name, x, y, h):
        k = rounded_slab(name, 1.2, h, 3.2, 0.55, 0.0)
        k.location = t2b(x, y, 0)
        k.data.materials.append(body.data.materials[0])
        k.parent = phone

    key("KeyPower", W / 2 + 0.45, 22, 16)
    key("KeyVolUp", -W / 2 - 0.45, 28, 11)
    key("KeyVolDn", -W / 2 - 0.45, 13, 11)

    # 产品棚灯光（单位 mm，能量按面积放大）
    area_light("StripL", (-260, -140, 40), (math.radians(90), 0, math.radians(-62)), 30, 520, 2.6e6)
    area_light("StripR", (260, -120, 10), (math.radians(90), 0, math.radians(62)), 30, 520, 2.2e6, (0.92, 0.96, 1.0))
    area_light("Top", (0, -80, 320), (math.radians(14), 0, 0), 260, 140, 1.2e6)
    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.021, 0.024, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    scene.world = world

    cam_data = bpy.data.cameras.new("Cam")
    cam_data.sensor_fit = "VERTICAL"
    cam_data.clip_start = 1.0
    cam_data.clip_end = 20000.0
    cam = bpy.data.objects.new("Cam", cam_data)
    cam.location = t2b(0, 0, 320)
    scene.collection.objects.link(cam)
    scene.camera = cam

    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Base Contrast" if "AgX - Base Contrast" in [
        i.identifier for i in scene.view_settings.bl_rna.properties["look"].enum_items] else "None"

    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0  # 不留 .blend1 备份（public/ 会整份进 bundle）
    bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
    print(f"[build_phone] 场景已写出: {out}")


if __name__ == "__main__":
    main()
