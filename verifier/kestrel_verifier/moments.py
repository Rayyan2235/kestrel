"""Re-simulate a Moments outcome from the learner's decision (ADR-003).

The weights are clamped at their rail marks and the plank is released from
level, with no robots in the scene, so there is no gait and nothing chaotic.
The settle rule mirrors the browser's release step (apps/web/src/simulation/
tasks.ts): read the angle every 50 Hz control step, and stop once it has been
still for 0.5 s (after at least 0.6 s), or at 6 s.
"""

from __future__ import annotations

from functools import lru_cache

import mujoco

from kestrel_verifier.scene import TIMESTEP, build_scene

CONTROL_DT = 0.02
SUBSTEPS = round(CONTROL_DT / TIMESTEP)
STILL_RAD = 0.00002  # per control step
LEFT, RIGHT = "weight-200", "weight-100"  # left is -y, as the learner sees it


@lru_cache(maxsize=1)
def _model() -> mujoco.MjModel:
    return build_scene("moments", bots=()).model


def resim(left_cm: float, right_cm: float) -> float:
    """The released plank's settled angle in radians; positive means the left side went down."""
    m = _model()
    d = mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m, d, 0)
    hinge = m.joint("plank_hinge")
    rails = [(m.joint(f"{w}_slide"), at) for w, at in ((LEFT, -left_cm / 100), (RIGHT, right_cm / 100))]

    def clamp() -> None:
        for j, at in rails:
            d.qpos[j.qposadr[0]] = at
            d.qvel[j.dofadr[0]] = 0

    clamp()
    d.qpos[hinge.qposadr[0]] = 0
    mujoco.mj_forward(m, d)
    t, still, last = 0.0, 0.0, 0.0
    while True:
        for _ in range(SUBSTEPS):
            clamp()
            mujoco.mj_step(m, d)
        t += CONTROL_DT
        angle = float(d.qpos[hinge.qposadr[0]])
        still = still + CONTROL_DT if abs(angle - last) < STILL_RAD else 0.0
        last = angle
        if (still >= 0.5 and t >= 0.6) or t >= 6:
            return angle
