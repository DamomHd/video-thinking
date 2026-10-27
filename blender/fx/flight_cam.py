"""
漫游机位 → Blender 相机关键帧 (flight_cam.py)

把 src/shared/flight.ts 采样出的漫游轨迹（vw blender flight 导出的 JSON）逐帧打到 Blender 相机上，
存成 .blend —— 在 M 系列上用 Cycles 渲出照片级漫游，和 three.js 实时预览是同一条路线。

不变量（和机身管线同一套）：
  1. 机位单源：每帧位置 / 视线 / 视角 / 侧倾全部来自轨迹 JSON
  2. 坐标换基 (x, y, z) → (x, −z, y)；three 的 fov 是竖直视角 → sensor_fit = VERTICAL
  3. 侧倾：three 的 camera.rotateZ(roll) 是绕相机自身 z 轴转；Blender 相机同样看向自身 −Z、上方 +Y，
     所以是同一个局部旋转：quat = track_quat(视线) @ Quaternion((0,0,1), roll)
  4. 打完关键帧后，用轨迹里附带的参考点比对投影：Blender 与 three 偏差超过 0.5px 就 exit 1

执行（由 `vw blender flight` 驱动）:
  blender -b [scene.blend] -Y --factory-startup -P blender/fx/flight_cam.py -- --track=<json> --out=<.blend>
"""

import os
import sys
import json
import math

import bpy
import mathutils
from bpy_extras.object_utils import world_to_camera_view

TOLERANCE_PX = 0.5


def arg(name, default=None):
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    for a in args:
        if a.startswith(f"--{name}="):
            return a.split("=", 1)[1]
    return default


def t2b(v):
    return mathutils.Vector((v[0], -v[2], v[1]))


def main():
    track_path = arg("track")
    out = arg("out")
    if not track_path or not out:
        print("[flight_cam] 错误: 需要 --track=<json> --out=<.blend>")
        sys.exit(1)
    with open(track_path, "r", encoding="utf-8") as f:
        track = json.load(f)
    frames = track["frames"]
    fps = int(track.get("fps", 60))
    w, h = track.get("size", [1920, 1080])

    scene = bpy.context.scene
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.fps = fps
    scene.frame_start = 0
    scene.frame_end = frames[-1]["k"]

    cam = bpy.data.objects.get("FlightCam")
    if cam is None:
        data = bpy.data.cameras.new("FlightCam")
        cam = bpy.data.objects.new("FlightCam", data)
        scene.collection.objects.link(cam)
    cam.data.sensor_fit = "VERTICAL"
    cam.data.clip_start = float(track.get("near", 0.1))
    cam.data.clip_end = float(track.get("far", 10000))
    cam.rotation_mode = "QUATERNION"
    scene.camera = cam

    def pose(fr):
        loc = t2b(fr["pos"])
        look = t2b(fr["look"])
        q = (look - loc).to_track_quat("-Z", "Y")
        q = q @ mathutils.Quaternion((0.0, 0.0, 1.0), fr.get("roll", 0.0))
        return loc, q, fr["fov"]

    for fr in frames:
        loc, q, fov = pose(fr)
        cam.location = loc
        cam.rotation_quaternion = q
        cam.data.angle_y = math.radians(fov)
        cam.keyframe_insert("location", frame=fr["k"])
        cam.keyframe_insert("rotation_quaternion", frame=fr["k"])
        cam.data.keyframe_insert("lens", frame=fr["k"])

    # 逐帧都有关键帧，插值方式无所谓；改成线性避免贝塞尔在帧间过冲（渲运动模糊时会用到帧间值）
    for datablock in (cam, cam.data):
        ad = datablock.animation_data
        if ad and ad.action:
            for fc in ad.action.fcurves:
                for kp in fc.keyframe_points:
                    kp.interpolation = "LINEAR"

    # 参考点投影比对
    probes = track.get("probes") or {}
    pts = probes.get("points") or []
    worst = 0.0
    for pf in probes.get("frames") or []:
        scene.frame_set(pf["k"])
        bpy.context.view_layer.update()
        for p, exp in zip(pts, pf["screen"]):
            ndc = world_to_camera_view(scene, cam, t2b(p))
            if exp is None or ndc.z <= 0:
                continue  # 在相机背后的点不比
            px, py = ndc.x * w, (1.0 - ndc.y) * h
            d = max(abs(px - exp[0]), abs(py - exp[1]))
            worst = max(worst, d)
            if d > TOLERANCE_PX:
                print(
                    f"[flight_cam] 错误: 第 {pf['k']} 帧参考点 {p} 投影偏差 {d:.2f}px 超过 {TOLERANCE_PX}px"
                    f"\n             Blender ({px:.2f}, {py:.2f}) vs three ({exp[0]:.2f}, {exp[1]:.2f})"
                )
                sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(out), compress=True)
    print(
        f"[flight_cam] {len(frames)} 帧机位已打到 FlightCam（{fps}fps，签名 {track.get('sig')}）；"
        f"参考点最大偏差 {worst:.3f}px → {out}"
    )


if __name__ == "__main__":
    main()
