import shutil
from pathlib import Path

import mujoco
import numpy as np
import pytest

from kestrel_verifier import scene
from kestrel_verifier.scene import BOTS, DEFAULT_POSE, TIMESTEP, build_scene, load_kit, pinned_bytes

# The verifier builds every scene from its own pinned assets (ADR-003). These
# checks need no browser: they compile each kit natively and run it briefly.

KITS = ["moments", "pythagoras", "rescue"]


@pytest.mark.parametrize("kit_id", KITS)
def test_each_kit_compiles_with_both_robots_and_every_prop(kit_id: str) -> None:
    s = build_scene(kit_id)
    m = s.model
    assert m.opt.timestep == TIMESTEP
    assert m.nu == len(BOTS) * len(DEFAULT_POSE)
    for bot in BOTS:
        assert mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_ACTUATOR, f"{bot}/{scene.JOINT_NAMES[0]}") >= 0
    for p in load_kit(kit_id)["props"]:
        assert mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, p["id"]) >= 0, p["id"]
    # The STAND keyframe covers the whole state: both robots, then every moving prop.
    assert m.nkey == 1 and m.key_qpos.shape == (1, m.nq)
    assert {p["id"] for p in s.dynamic_props} == {p["id"] for p in load_kit(kit_id)["props"] if p["joint"] != "fixed"}


@pytest.mark.parametrize("kit_id", KITS)
def test_native_resimulation_is_repeatable(kit_id: str) -> None:
    # ADR-003's re-sim verdicts rely on this: the same scene and state, stepped
    # natively, end in the same state every time (browser vs native is what diverges).
    def run() -> np.ndarray:
        m = build_scene(kit_id).model
        d = mujoco.MjData(m)
        mujoco.mj_resetDataKeyframe(m, d, 0)
        for _ in range(int(1.0 / TIMESTEP)):
            mujoco.mj_step(m, d)
        return d.qpos.copy()

    first, second = run(), run()
    assert np.isfinite(first).all()
    assert np.array_equal(first, second)


def test_a_mesh_that_does_not_match_sha256sums_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    copy = tmp_path / "microduck"
    shutil.copytree(scene.ASSETS, copy)
    mesh = next((copy / "robot" / "meshes").glob("*.stl"))
    mesh.write_bytes(mesh.read_bytes() + b"\0")
    monkeypatch.setattr(scene, "ASSETS", copy)
    with pytest.raises(ValueError, match="SHA256SUMS"):
        pinned_bytes(f"robot/meshes/{mesh.name}")
    with pytest.raises(ValueError, match="SHA256SUMS"):
        build_scene("moments")


def test_pinned_meshes_match_sha256sums() -> None:
    for mesh in sorted((scene.ASSETS / "robot" / "meshes").glob("*.stl")):
        assert pinned_bytes(f"robot/meshes/{mesh.name}")
