"""
Blender 后台 Cycles 逐帧预渲染 (phone.py)

对标 architecture.html §8 第 3 步的全部不变量：
  1. 机位来自 out/<片>/blender/track.json（唯一单源），逐帧摆位相机与机身；
  2. 渲之前比较 Blender 与 three.js 的屏幕四角投影，偏差超过 0.5px 就 exit 1；
  3. 坐标换基 (x, y, z) → (x, −z, y)；three 的 fov 是竖直视角，对应 sensor_fit = VERTICAL；
  4. 已存在的帧跳过；先写临时文件再 rename；
  5. 清单的 complete 按盘上真实帧数判定，绝不无条件写 True。

执行方式（由 scripts/blender/render.ts 驱动）:
  blender -b <scene.blend> -Y --factory-startup -P blender/loomcare/phone.py -- <filmId> [--force]

场景 .blend 的查找顺序:
  $BLENDER_PHONE_BLEND → public/models/<片>-phone.blend → public/models/phone.blend
场景里必须有:
  - 一个名为 "Phone" 的对象（机身，屏幕平面是它的子级或同层）
  - 一个相机（任意名字，脚本会取 scene.camera 或第一个相机）
"""

import sys
import os
import json
import math

try:
    import bpy
    import mathutils
except ImportError:
    bpy = None

SCREEN_TOLERANCE_PX = 0.5
# 与 src/films/<片>/three/phoneGeo.ts 的 PHONE_SPECS 保持一致（单位 mm）
SCREEN_W = 68.0
SCREEN_H = 143.0
SCREEN_Z = 3.83
BODY_W = 71.5
BODY_H = 146.7
BODY_D = 7.65


def three_to_blender(v):
    """坐标换基: three (x, y, z) → blender (x, -z, y)"""
    return mathutils.Vector((v[0], -v[2], v[1]))


def find_scene_blend(project_root, film_id):
    env = os.environ.get("BLENDER_PHONE_BLEND")
    candidates = [env] if env else []
    candidates += [
        os.path.join(project_root, "public", "models", f"{film_id}-phone.blend"),
        os.path.join(project_root, "public", "models", "phone.blend"),
    ]
    for c in candidates:
        if c and os.path.exists(c):
            return c
    return None


def project_point(scene, cam, world_co):
    """世界坐标 → 像素坐标（与 three 的 NDC→像素口径一致）"""
    from bpy_extras.object_utils import world_to_camera_view

    ndc = world_to_camera_view(scene, cam, world_co)
    w = scene.render.resolution_x
    h = scene.render.resolution_y
    # world_to_camera_view 的 y 轴朝上，three 的像素 y 轴朝下
    return (round(ndc.x * w, 2), round((1.0 - ndc.y) * h, 2))


def main():
    if not bpy:
        print("[phone.py] 错误: 本脚本必须在 Blender 内通过 `blender -b -P phone.py` 执行")
        sys.exit(1)

    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    film_id = args[0] if args and not args[0].startswith("--") else "loomcare-demo"
    force = "--force" in args
    # --only=0,720,1440：只渲这几帧（试渲 / 抽检用，不改清单的判定口径）
    only = None
    for a in args:
        if a.startswith("--only="):
            only = {int(x) for x in a.split("=", 1)[1].split(",") if x.strip()}

    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "../.."))
    track_path = os.path.join(project_root, "out", film_id, "blender", "track.json")
    out_dir = os.path.join(project_root, "public", "blender", film_id, "phone")
    manifest_path = os.path.join(project_root, "src", "films", film_id, "three", "phoneBody.json")

    if not os.path.exists(track_path):
        print(f"[phone.py] 错误: 找不到机位轨迹: {track_path}")
        print(f"           先执行 `vw blender track {film_id}`")
        sys.exit(1)

    with open(track_path, "r", encoding="utf-8") as f:
        track = json.load(f)

    sig = track.get("sig")
    frames = track.get("frames", [])
    changed_ranges = track.get("changedRanges") or []
    os.makedirs(out_dir, exist_ok=True)

    print("\n========================================")
    print(f"[phone.py] 影片 {film_id} 机身预渲染")
    print(f"  - 签名: {sig}")
    print(f"  - 轨迹帧数: {len(frames)}")
    print(f"  - 输出: {out_dir}")
    if changed_ranges and not force:
        print(f"  - 仅重渲变动区间: {changed_ranges}")
    print("========================================\n")

    # ── 场景
    scene_blend = find_scene_blend(project_root, film_id)
    if scene_blend:
        print(f"[phone.py] 打开场景: {scene_blend}")
        # -Y 已在命令行给出，内嵌脚本不会执行
        bpy.ops.wm.open_mainfile(filepath=scene_blend)
    else:
        print("[phone.py] 错误: 找不到机身场景 .blend")
        print("           放到 public/models/phone.blend，或用 BLENDER_PHONE_BLEND 指定")
        print("           没有场景就不能渲机身 —— 渲染端会按签名兜底降级为程序化机身")
        sys.exit(1)

    scene = bpy.context.scene
    phone_obj = bpy.data.objects.get("Phone")
    if phone_obj is None:
        print('[phone.py] 错误: 场景里没有名为 "Phone" 的对象')
        sys.exit(1)

    cam = scene.camera or next((o for o in bpy.data.objects if o.type == "CAMERA"), None)
    if cam is None:
        print("[phone.py] 错误: 场景里没有相机")
        sys.exit(1)
    scene.camera = cam

    # ── 渲染设置：Cycles，有 Metal GPU 用 GPU，没有（Intel 核显）退回 CPU；都开降噪
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    try:
        cp = bpy.context.preferences.addons["cycles"].preferences
        cp.compute_device_type = "METAL"
        cp.get_devices()
        gpus = [d for d in cp.devices if d.type != "CPU"]
        if gpus:
            for d in cp.devices:
                d.use = True
            scene.cycles.device = "GPU"
    except Exception as e:
        print(f"[phone.py] GPU 探测失败: {e}（用 CPU）")
    print(f"[phone.py] Cycles 设备: {scene.cycles.device}")
    scene.cycles.samples = int(os.environ.get("BLENDER_SAMPLES", "32"))
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"

    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 100  # 100 = 无损

    # three 的 fov 是竖直视角
    cam.data.sensor_fit = "VERTICAL"

    def in_changed(k):
        if force or not changed_ranges:
            return True
        return any(lo <= k <= hi for lo, hi in changed_ranges)

    rendered = 0
    skipped = 0
    for fi in frames:
        k = fi["k"]
        if only is not None and k not in only:
            continue
        target = os.path.join(out_dir, f"{k:04d}.webp")

        if os.path.exists(target) and not force and not in_changed(k):
            skipped += 1
            continue
        if os.path.exists(target) and not force and in_changed(k):
            os.remove(target)

        # ── 逐帧摆位（机位单源：全部来自 track.json）
        ph = fi["phone"]
        cm = fi["camera"]

        phone_obj.location = three_to_blender(ph["pos"])
        # three 的欧拉 'XYZ' 是 M = Rx·Ry·Rz；换基 P 后 three 的 y 轴 → blender z、z 轴 → blender −y，
        # 得到 Rx·Rz·R(−y)，对应 blender 的 'YZX' 顺序（先 Y 再 Z 再 X）。
        # 用 'XYZ' 只在单轴旋转时碰巧对，偏航 + 翻滚同时存在就会错位（四角校验会拦下来）。
        phone_obj.rotation_mode = "YZX"
        phone_obj.rotation_euler = mathutils.Euler(
            (ph["rot"][0], -ph["rot"][2], ph["rot"][1]), "YZX"
        )
        phone_obj.scale = (ph["scale"][0], ph["scale"][2], ph["scale"][1])

        cam.location = three_to_blender(cm["pos"])
        look = three_to_blender(cm["look"])
        direction = look - cam.location
        cam.rotation_mode = "QUATERNION"
        cam.rotation_quaternion = direction.to_track_quat("-Z", "Y")
        cam.data.angle_y = math.radians(cm["fov"])

        bpy.context.view_layer.update()

        # ── 渲之前校验四角投影：偏差超过 0.5px 就停，绝不出错位的帧
        corners_local = [
            (-SCREEN_W / 2, SCREEN_H / 2, SCREEN_Z),
            (SCREEN_W / 2, SCREEN_H / 2, SCREEN_Z),
            (SCREEN_W / 2, -SCREEN_H / 2, SCREEN_Z),
            (-SCREEN_W / 2, -SCREEN_H / 2, SCREEN_Z),
        ]
        expected = fi.get("screenQuad") or []
        for idx, lc in enumerate(corners_local):
            world_co = phone_obj.matrix_world @ three_to_blender(lc)
            px, py = project_point(scene, cam, world_co)
            if idx < len(expected):
                ex, ey = expected[idx][0], expected[idx][1]
                dx, dy = abs(px - ex), abs(py - ey)
                if dx > SCREEN_TOLERANCE_PX or dy > SCREEN_TOLERANCE_PX:
                    print(
                        f"[phone.py] 错误: 第 {k} 帧第 {idx} 角投影偏差 "
                        f"({dx:.2f}, {dy:.2f})px 超过 {SCREEN_TOLERANCE_PX}px"
                        f"\n           Blender ({px}, {py}) vs three ({ex}, {ey})"
                        f"\n           机身几何或相机换基与 phoneGeo.ts 不一致，停止渲染"
                    )
                    sys.exit(1)

        # ── 只渲机身包围盒：机身外轮廓 8 个角的投影外扩 6%，框外是透明的空像素，不值得算
        xs, ys = [], []
        for cx in (-BODY_W / 2, BODY_W / 2):
            for cy in (-BODY_H / 2, BODY_H / 2):
                for cz in (-BODY_D / 2, BODY_D / 2):
                    px, py = project_point(scene, cam, phone_obj.matrix_world @ three_to_blender((cx, cy, cz)))
                    xs.append(px)
                    ys.append(py)
        w = scene.render.resolution_x
        h = scene.render.resolution_y
        mx = (max(xs) - min(xs)) * 0.06 + 8
        my = (max(ys) - min(ys)) * 0.06 + 8
        scene.render.use_border = True
        scene.render.use_crop_to_border = False
        scene.render.border_min_x = max(0.0, (min(xs) - mx) / w)
        scene.render.border_max_x = min(1.0, (max(xs) + mx) / w)
        # border 的 y 轴朝上
        scene.render.border_min_y = max(0.0, 1.0 - (max(ys) + my) / h)
        scene.render.border_max_y = min(1.0, 1.0 - (min(ys) - my) / h)

        # ── 先写临时文件再 rename，中断不会留下半张图
        tmp = target + ".part"
        scene.frame_set(k)
        scene.render.filepath = tmp
        bpy.ops.render.render(write_still=True)
        actual = tmp if os.path.exists(tmp) else tmp + ".webp"
        if os.path.exists(actual):
            os.replace(actual, target)
            rendered += 1
        else:
            print(f"[phone.py] 警告: 第 {k} 帧没有产出文件")

    # ── 清单：complete 按盘上真实连续帧数判定
    expected_count = len(frames)
    on_disk = 0
    for k in range(expected_count):
        p = os.path.join(out_dir, f"{k:04d}.webp")
        if not os.path.exists(p) or os.path.getsize(p) == 0:
            break
        on_disk += 1
    complete = on_disk >= expected_count

    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "filmId": film_id,
                "complete": complete,
                "sig": sig,
                "frames": on_disk,
                "expectedFrames": expected_count,
                "fps": track.get("fps"),
            },
            f,
            indent=2,
        )

    print(
        f"\n[phone.py] 新渲 {rendered} 帧，跳过 {skipped} 帧；"
        f"盘上连续 {on_disk}/{expected_count} 帧，complete={complete}"
    )
    if not complete:
        print("[phone.py] 帧序列不齐，渲染端会按签名兜底降级为程序化机身。")


if __name__ == "__main__":
    main()
