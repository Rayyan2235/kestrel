"""Build the MuJoCo scene from the verifier's own pinned assets.

A port of apps/web/src/simulation/mjcf.ts (buildSceneXml). The verifier never
takes a scene or an initial state from the browser: the robot model comes
from apps/web/public/microduck, its meshes are refused unless they match
SHA256SUMS there, and the props come from verifier/kits/<kit>.json, which a
contracts test keeps equal to the lab kits.
"""

from __future__ import annotations

import copy
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

import mujoco
import numpy as np

REPO = Path(__file__).resolve().parents[2]
ASSETS = REPO / "apps" / "web" / "public" / "microduck"
KITS = REPO / "verifier" / "kits"

# apps/web/src/simulation/constants.ts
JOINT_NAMES = [
    "left_hip_yaw", "left_hip_roll", "left_hip_pitch", "left_knee", "left_ankle",
    "neck_pitch", "head_pitch", "head_yaw", "head_roll",
    "right_hip_yaw", "right_hip_roll", "right_hip_pitch", "right_knee", "right_ankle",
]
DEFAULT_POSE = np.array([
    0, -0.08726646259971647, -0.457924, -0.00494, 0.452984,
    0.3490658503988659, 0.3490658503988659, 0, 0,
    0, 0.08726646259971647, 0.457924, 0.00494, -0.452984,
], dtype=np.float32)
TIMESTEP = 0.005
ROOM_HALF, WALL_H, WALL_T = 1.5, 0.25, 0.05
BOTS = ["pip", "nova"]


def fmt(values) -> str:
    """mjcf.ts fmt(): each number rounded to 6 decimals."""
    return " ".join(repr(float(f"{v:.6f}")) + "" for v in values)


def _mesh_vertices(p: dict) -> list[float] | None:
    s = p["shape"]
    if s["type"] == "triangle":
        a, b = s["legs"]
        h = s["height"]
        return [0, 0, 0, a, 0, 0, 0, b, 0, 0, 0, h, a, 0, h, 0, b, h]
    if s["type"] == "wedge":
        w, l, h = s["width"] / 2, s["length"] / 2, s["height"]
        return [-w, -l, 0, w, -l, 0, 0, -l, h, -w, l, 0, w, l, 0, 0, l, h]
    return None


@dataclass
class Scene:
    model: mujoco.MjModel
    kit: dict
    dynamic_props: list[dict]


def pinned_bytes(rel: str) -> bytes:
    """Read an asset under apps/web/public/microduck, refusing it unless SHA256SUMS lists it with this hash."""
    sums = dict(
        (name.lstrip("*"), digest)
        for digest, name in (line.split(maxsplit=1) for line in (ASSETS / "SHA256SUMS").read_text(encoding="utf-8").splitlines() if line.strip())
    )
    data = (ASSETS / rel).read_bytes()
    if sums.get(rel) != hashlib.sha256(data).hexdigest():
        raise ValueError(f"{rel} does not match apps/web/public/microduck/SHA256SUMS")
    return data


def load_kit(kit_id: str) -> dict:
    return json.loads((KITS / f"{kit_id}.json").read_text(encoding="utf-8"))


def build_scene(kit_id: str) -> Scene:
    kit = load_kit(kit_id)
    props = kit["props"]
    ducks = [(d, kit["spawns"][d]) for d in BOTS]
    root = ET.fromstring((ASSETS / "robot" / "robot_allcollisions.xml").read_text(encoding="utf-8"))
    parent = {c: p for p in root.iter() for c in p}
    worldbody = root.find("worldbody")
    asset = root.find("asset")

    for g in [g for g in root.iter("geom") if g.get("class") == "visual"]:
        parent[g].remove(g)
    used = {g.get("mesh") for g in root.iter("geom") if g.get("mesh")}
    for m in list(asset.findall("mesh")):
        name = m.get("name") or m.get("file").removesuffix(".stl").removesuffix(".STL")
        if name not in used:
            asset.remove(m)
    mesh_files = [m.get("file") for m in asset.findall("mesh")]
    robot_joints = [j.get("name") for j in root.iter("joint") if parent.get(j) is not None and parent[j].tag == "body"]

    robot = next(c for c in worldbody if c.tag == "body")
    actuator, sensor = root.find("actuator"), root.find("sensor")
    actuators, sensors = list(actuator), list(sensor)
    excludes = [e for c in root.findall("contact") for e in c.findall("exclude")]
    exclude_parent = parent[excludes[0]] if excludes else None
    worldbody.remove(robot)
    for e in actuators:
        actuator.remove(e)
    for e in sensors:
        sensor.remove(e)
    for e in excludes:
        parent[e].remove(e)

    def named(e: ET.Element, attrs: list[str], pre: str) -> ET.Element:
        for a in attrs:
            if a in e.attrib:
                e.set(a, pre + e.get(a))
        return e

    for i, (duck, spawn) in enumerate(ducks):
        pre = f"{duck}/"
        body = copy.deepcopy(robot)
        for e in body.iter():
            named(e, ["name"], pre)
        body.set("pos", fmt([spawn[0], spawn[1], 0.12]))
        worldbody.insert(i, body)
        for a in actuators:
            actuator.append(named(copy.deepcopy(a), ["name", "joint"], pre))
        for s in sensors:
            sensor.append(named(copy.deepcopy(s), ["name", "site", "objname", "body"], pre))
        for x in excludes:
            exclude_parent.append(named(copy.deepcopy(x), ["body1", "body2"], pre))

    ET.SubElement(root, "option", timestep=str(TIMESTEP))
    ET.SubElement(worldbody, "geom", name="floor", type="plane", size="0 0 0.05", pos="0 0 0")
    ht, hh = WALL_T / 2, WALL_H / 2
    off, span = ROOM_HALF + ht, ROOM_HALF + WALL_T
    for name, pos, size in [
        ("wall_px", [off, 0, hh], [ht, span, hh]),
        ("wall_nx", [-off, 0, hh], [ht, span, hh]),
        ("wall_py", [0, off, hh], [span, ht, hh]),
        ("wall_ny", [0, -off, hh], [span, ht, hh]),
    ]:
        ET.SubElement(worldbody, "geom", name=name, type="box", pos=fmt(pos), size=fmt(size))

    bodies: dict[str, ET.Element] = {}
    for p in props:
        geom = {"name": f"{p['id']}_geom", "rgba": "1 1 1 1",
                "friction": "0.35 0.005 0.0001" if p["role"] == "tile" else "0.6 0.005 0.0001"}
        verts = _mesh_vertices(p)
        if verts:
            ET.SubElement(asset, "mesh", name=f"{p['id']}_mesh", vertex=fmt(verts))
            geom.update(type="mesh", mesh=f"{p['id']}_mesh")
        elif p["shape"]["type"] == "box":
            geom.update(type="box", size=fmt([v / 2 for v in p["shape"]["size"]]))
        if p["joint"] != "fixed" or p.get("parent"):
            geom["mass"] = repr(float(p["mass"]))
        if p.get("solref"):
            geom["solref"] = fmt(p["solref"])
        body = ET.Element("body", name=p["id"], pos=fmt(p["pos"]), euler=f"0 0 {float(f'{p['yaw']:.6f}')!r}")
        if p["joint"] == "free":
            ET.SubElement(body, "freejoint", name=f"{p['id']}_free")
        if p["joint"] in ("hinge", "slide"):
            j = {"name": f"{p['id']}_{p['joint']}", "type": p["joint"], "axis": fmt(p.get("axis", [1, 0, 0])),
                 "range": fmt(p.get("range", [-0.35, 0.35])), "damping": repr(float(p.get("damping", 0.002)))}
            if p.get("anchor"):
                j["pos"] = fmt(p["anchor"])
            if p["joint"] == "slide":
                j.update(frictionloss="0.05", armature="0.01")
            ET.SubElement(body, "joint", j)
        ET.SubElement(body, "geom", geom)
        holder = bodies[p["parent"]] if p.get("parent") else worldbody
        holder.append(body)
        bodies[p["id"]] = body

    by_id = {p["id"]: p for p in props}
    contact = ET.Element("contact")
    for p in props:
        up = by_id.get(p.get("parent") or "", {}).get("parent")
        while up:
            ET.SubElement(contact, "exclude", body1=p["id"], body2=up)
            up = by_id.get(up, {}).get("parent")
    if len(contact):
        root.append(contact)

    def tree(par=None):
        return [x for p in props if p.get("parent") == par for x in [p, *tree(p["id"])]]

    dynamic = [p for p in tree() if p["joint"] != "fixed"]
    pose = dict(zip(JOINT_NAMES, DEFAULT_POSE.astype(float)))
    qpos: list[float] = []
    for _, (x, y, yaw) in ducks:
        qpos += [x, y, 0.12, math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)]
        qpos += [pose.get(j, 0.0) for j in robot_joints]
    for p in dynamic:
        if p["joint"] == "free":
            h = p["yaw"] / 2
            qpos += [*p["pos"], math.cos(h), 0, 0, math.sin(h)]
        else:
            qpos.append(p.get("rest", 0))
    key = ET.SubElement(ET.SubElement(root, "keyframe"), "key", name="STAND", qpos=fmt(qpos))
    key.set("ctrl", fmt([float(v) for _ in ducks for v in DEFAULT_POSE]))

    files = {f"assets/{f}": pinned_bytes(f"robot/meshes/{f}") for f in mesh_files}
    model = mujoco.MjModel.from_xml_string(ET.tostring(root, encoding="unicode"), files)
    return Scene(model, kit, dynamic)

