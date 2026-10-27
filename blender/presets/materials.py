"""
材质与灯光预设 (materials.py)

风格库的 Blender 侧底座：每个预设只吃一个颜色（和少量可选参数），出一个完整的节点材质。
预设名是稳定接口 —— 场景 JSON 里写 {"preset": "clay", "color": "#C8553D"}，换风格只换预设名。

材质：
  clay      黏土：高粗糙 + 轻微次表面散射 + 低频起伏 + 指纹般的细碎凹凸（定格动画质感的关键）
  paper     纸：极高粗糙、暖白、纤维细凹凸
  plastic   塑料：中等粗糙、薄清漆
  metal     金属
  glass     玻璃（透射）
  ceramic   陶瓷 / 釉面：光滑 + 清漆
  matte     哑光：纯漫反射感，最朴素的「插画式 3D」

灯光：
  softbox      大面积柔光箱主光 + 补光 + 轮廓光，影子柔 —— 黏土 / 产品通用
  sunset       低角度暖色太阳 + 冷色天光
  studio-dark  暗场：两条长条光扫边，环境极暗（金属 / 玻璃产品）
"""

import math
import bpy


def hex_rgba(h, a=1.0):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    # sRGB → 线性（Blender 节点里的颜色是线性的）
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)


def _set(bsdf, name, value):
    if name in bsdf.inputs:
        bsdf.inputs[name].default_value = value


def _bump(nt, bsdf, height_socket, strength, distance=0.02):
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = strength
    bump.inputs["Distance"].default_value = distance
    nt.links.new(height_socket, bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return bump


def make_material(name, preset="matte", color="#D9CBB4", **kw):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    _set(bsdf, "Base Color", hex_rgba(color))
    scale = kw.get("scale", 1.0)  # 纹理尺度随场景单位调

    if preset == "clay":
        _set(bsdf, "Roughness", 0.72)
        _set(bsdf, "Subsurface Weight", 0.12)
        _set(bsdf, "Subsurface Radius", (0.6, 0.3, 0.2))
        _set(bsdf, "Subsurface Scale", 0.05 * scale)
        _set(bsdf, "Sheen Weight", 0.15)
        # 低频起伏（手捏的不平）+ 细碎凹凸（指纹 / 工具痕）
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 3.0 / scale
        noise.inputs["Detail"].default_value = 2.0
        vor = nt.nodes.new("ShaderNodeTexVoronoi")
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 40.0 / scale
        mix = nt.nodes.new("ShaderNodeMath")
        mix.operation = "MULTIPLY_ADD"
        mix.inputs[1].default_value = 0.15
        nt.links.new(vor.outputs["Distance"], mix.inputs[0])
        nt.links.new(noise.outputs["Fac"], mix.inputs[2])
        _bump(nt, bsdf, mix.outputs[0], kw.get("bump", 0.25), 0.03 * scale)
    elif preset == "paper":
        _set(bsdf, "Roughness", 0.95)
        _set(bsdf, "Sheen Weight", 0.2)
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 120.0 / scale
        noise.inputs["Detail"].default_value = 8.0
        _bump(nt, bsdf, noise.outputs["Fac"], kw.get("bump", 0.08), 0.005 * scale)
    elif preset == "plastic":
        _set(bsdf, "Roughness", 0.38)
        _set(bsdf, "Coat Weight", 0.3)
        _set(bsdf, "Coat Roughness", 0.1)
    elif preset == "metal":
        _set(bsdf, "Metallic", 1.0)
        _set(bsdf, "Roughness", kw.get("roughness", 0.3))
    elif preset == "glass":
        _set(bsdf, "Transmission Weight", 1.0)
        _set(bsdf, "Roughness", 0.02)
        _set(bsdf, "IOR", 1.45)
    elif preset == "ceramic":
        _set(bsdf, "Roughness", 0.18)
        _set(bsdf, "Coat Weight", 0.6)
        _set(bsdf, "Coat Roughness", 0.04)
    else:  # matte
        _set(bsdf, "Roughness", 0.9)
    return m


def _area(name, loc, look, size, size_y, energy, color="#FFFFFF"):
    import mathutils
    data = bpy.data.lights.new(name, "AREA")
    data.shape = "RECTANGLE"
    data.size = size
    data.size_y = size_y
    data.energy = energy
    data.color = hex_rgba(color)[:3]
    obj = bpy.data.objects.new(name, data)
    obj.location = loc
    d = mathutils.Vector(look) - mathutils.Vector(loc)
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(obj)
    return obj


def apply_lighting(preset="softbox", world_color="#EDE6DA", world_strength=0.6, scale=1.0):
    """灯光预设。坐标是 Blender 的（z 朝上）；scale = 场景尺度（物体大约多大），灯的位置和功率跟着放大"""
    s = scale
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    if preset == "softbox":
        _area("Key", (-4 * s, -5 * s, 6 * s), (0, 0, 0), 6 * s, 6 * s, 900 * s * s, "#FFF4E6")
        _area("Fill", (6 * s, -3 * s, 3 * s), (0, 0, 0), 5 * s, 5 * s, 250 * s * s, "#E6F0FF")
        _area("Rim", (2 * s, 6 * s, 5 * s), (0, 0, 0), 3 * s, 3 * s, 500 * s * s, "#FFFFFF")
        bg.inputs["Color"].default_value = hex_rgba(world_color)
        bg.inputs["Strength"].default_value = world_strength
    elif preset == "sunset":
        sun = bpy.data.lights.new("Sun", "SUN")
        sun.energy = 4.0
        sun.color = hex_rgba("#FFB070")[:3]
        sun.angle = math.radians(3)
        o = bpy.data.objects.new("Sun", sun)
        o.rotation_euler = (math.radians(78), 0, math.radians(-40))
        scene.collection.objects.link(o)
        bg.inputs["Color"].default_value = hex_rgba("#7FA6D6")
        bg.inputs["Strength"].default_value = 0.5
    else:  # studio-dark
        _area("StripL", (-6 * s, -3 * s, 1 * s), (0, 0, 0), 0.5 * s, 8 * s, 1200 * s * s)
        _area("StripR", (6 * s, -2 * s, 1 * s), (0, 0, 0), 0.5 * s, 8 * s, 1000 * s * s, "#EAF2FF")
        bg.inputs["Color"].default_value = hex_rgba("#08090B")
        bg.inputs["Strength"].default_value = 1.0
    scene.world = world
