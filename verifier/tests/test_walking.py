import copy
import math
from datetime import datetime, timezone

import pytest

from kestrel_verifier import walking
from kestrel_verifier.rules import XP, Attempt, Claim, decide, load_kit

# Synthetic 4 Hz pose logs: an honest build and rescue, then forgeries.

DT = walking.DT
LEARNER = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
ATTEMPT = "11111111-2222-4333-8444-555555555555"
KIT = load_kit("pythagoras")


def walk(a: list[float], b: list[float], speed: float = 0.4) -> list[list[float]]:
    """Points from a to b (exclusive of a) at speed m/s, one per sample."""
    steps = max(1, math.ceil(math.dist(a, b) / (speed * DT)))
    return [[a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps] for k in range(1, steps + 1)]


def hold(p: list[float], n: int = 4) -> list[list[float]]:
    return [list(p) for _ in range(n)]


def poses(points: list[list[float]], yaw: float = 0.0) -> list[list[float]]:
    return [[round(x, 3), round(y, 3), yaw] for x, y in points]


def build_log(squares: tuple[str, ...] = ("square-3", "square-4", "square-5")) -> dict:
    """Pip fetches each square in turn and carries it (20 cm behind) onto its slot; Nova stands still."""
    start = {p["id"]: p["pos"][:2] for p in KIT["props"]}
    slot = {s["forProp"]: s["pos"] for s in KIT["slots"]}
    pip = [KIT["spawns"]["pip"][:2]]
    props = {sid: [start[sid]] for sid in start}
    for sid in squares:
        behind = [start[sid][0] - 0.2, start[sid][1]]
        for p in walk(pip[-1], behind):
            pip.append(p)
            for s in props:
                props[s].append(props[s][-1])
        for p in walk(start[sid], slot[sid], 0.3):
            pip.append([p[0] - 0.2, p[1]])
            for s in props:
                props[s].append(p if s == sid else props[s][-1])
    n = len(pip)
    nova = [KIT["spawns"]["nova"][:2]] * n
    return {"hz": walking.HZ, "bots": {"pip": poses(pip), "nova": poses(nova)}, "props": {s: poses(v) for s, v in props.items()}}


def attempt(objective: str) -> Attempt:
    return Attempt(ATTEMPT, LEARNER, objective, None, datetime(2026, 11, 10, tzinfo=timezone.utc))


def claim(trajectory: dict, route: list[str] | None = None) -> Claim:
    return Claim(ATTEMPT, LEARNER, trajectory=trajectory, route=route)


def test_an_honest_build_meets_the_objective_and_earns_its_xp() -> None:
    v = decide(attempt("build-triangle"), claim(build_log()), None, [], None)
    assert (v.status, v.ok, v.reason) == ("verified", True, "3/3 squares on the triangle")
    assert v.awards == [("objective", "build-triangle", "", XP["objective"])]


def test_a_plausible_but_unfinished_build_is_verified_not_met() -> None:
    v = decide(attempt("build-triangle"), claim(build_log(("square-3", "square-4"))), None, [], None)
    assert (v.status, v.ok, v.awards) == ("verified", False, [])
    assert v.reason == "2/3 squares on the triangle"


def forged(edit) -> str:
    log = build_log()
    edit(log)
    v = decide(attempt("build-triangle"), claim(log), None, [], None)
    assert v.status == "rejected" and v.awards == []
    return v.reason


def test_a_teleporting_robot_is_rejected() -> None:
    def edit(log):
        log["bots"]["pip"][10][:2] = [1.5, 1.5]

    assert "faster than it can walk" in forged(edit)


def test_a_robot_spinning_faster_than_the_gait_is_rejected() -> None:
    def edit(log):
        for i, p in enumerate(log["bots"]["nova"]):
            p[2] = (i * 170) % 360  # 170° per 0.25 s, about 12 rad/s

    assert "turned faster" in forged(edit)


def test_a_square_that_slides_onto_its_slot_untouched_is_rejected() -> None:
    def edit(log):
        # Square 5 drifts to its slot over the whole log while Pip never goes near it.
        s5, slot = log["props"]["square-5"], next(s for s in KIT["slots"] if s["forProp"] == "square-5")["pos"]
        n = len(s5)
        for i, p in enumerate(s5):
            p[:2] = [s5[0][0] + (slot[0] - s5[0][0]) * i / (n - 1), s5[0][1] + (slot[1] - s5[0][1]) * i / (n - 1)]
        log["bots"]["pip"] = [[KIT["spawns"]["pip"][0], KIT["spawns"]["pip"][1], 0.0]] * n

    assert "nothing touching it" in forged(edit)


def test_a_square_that_jumps_is_rejected() -> None:
    def edit(log):
        log["props"]["square-3"][-1][:2] = [5.0, 5.0]

    assert "jumped" in forged(edit)


def test_an_edited_starting_layout_is_rejected() -> None:
    def edit(log):
        slot = next(s for s in KIT["slots"] if s["forProp"] == "square-4")["pos"]
        log["props"]["square-4"][0][:2] = slot

    reason = forged(edit)
    assert "start" in reason or "jumped" in reason


@pytest.mark.parametrize(
    "edit, why",
    [
        (lambda log: log.update(hz=50), "rate"),
        (lambda log: log["props"].update({"ball": log["props"]["square-3"]}), "unknown props"),
        (lambda log: log["bots"].update({"kestrel": log["bots"]["pip"]}), "robots"),
        (lambda log: log["bots"]["pip"].pop(), "lengths"),
        (lambda log: log["bots"]["pip"][3].__setitem__(0, float("nan")), "pose"),
    ],
)
def test_malformed_logs_are_rejected(edit, why) -> None:
    assert why in forged(edit)


def test_no_log_is_rejected() -> None:
    assert decide(attempt("build-triangle"), Claim(ATTEMPT, LEARNER), None, [], None).reason == "no trajectory"


# ── Rescue ──────────────────────────────────────────────────────────────
BEACONS = walking.RESCUE["beacons"]
RESCUE_KIT = load_kit("rescue")


def rescue_log(path: str = "ABEH", detour: list[float] | None = None) -> dict:
    """Pip walks beacon to beacon, pausing at each (the navigator stops on arrival); Nova stays put."""
    pip = [BEACONS["A"]]
    for b in path[1:]:
        if detour and b == path[2]:
            pip += walk(pip[-1], detour)
        pip += walk(pip[-1], BEACONS[b]) + hold(BEACONS[b])
    nova = [RESCUE_KIT["spawns"]["nova"][:2]] * len(pip)
    return {"hz": walking.HZ, "bots": {"pip": poses(pip), "nova": poses(nova, 180.0)}, "props": {}}


def rescue(log: dict, route: str):
    return decide(attempt("rescue-pip"), claim(log, list(route)), None, [], None)


def test_a_followed_route_rescues_pip() -> None:
    v = rescue(rescue_log("ABEH"), "ABEH")
    assert (v.status, v.ok) == ("verified", True)
    assert v.reason.startswith("route ABEH followed")
    assert v.awards == [("objective", "rescue-pip", "", XP["objective"])]


def test_a_route_longer_than_the_battery_is_not_met() -> None:
    v = rescue(rescue_log("ACFDEH"), "ACFDEH")
    assert (v.status, v.ok, v.reason) == ("verified", False, "battery ran out")


def test_walking_through_a_barrier_is_not_met() -> None:
    barrier = walking.RESCUE["barriers"][1]["center"]  # between A and C
    v = rescue(rescue_log("ACDEH", detour=barrier), "ACDEH")
    assert v.ok is False and v.reason in {"Pip met an obstacle", "battery ran out"}


def test_a_log_that_does_not_follow_the_claimed_route_is_not_met() -> None:
    # Off the B-E segment by 0.6 m on the way, but within the battery and clear of barriers.
    v = rescue(rescue_log("ABEH", detour=[0.1, 0.35]), "ABEH")
    assert (v.ok, v.reason) == (False, "Pip left the route")


def test_stopping_short_of_the_charger_is_not_met() -> None:
    log = rescue_log("ABEH")
    for p in log["bots"]["pip"][-6:]:
        p[:2] = [BEACONS["E"][0], BEACONS["E"][1]]
    v = rescue(log, "ABEH")
    assert v.ok is False


def test_an_illegal_route_or_a_missing_pip_is_rejected() -> None:
    assert rescue(rescue_log("ABEH"), "AEH").status == "rejected"  # A-E is not an edge
    log = rescue_log("ABEH")
    log["bots"] = {"nova": log["bots"]["nova"]}
    assert rescue(log, "ABEH").status == "rejected"


def test_routes_match_contracts() -> None:
    assert walking.is_rescue_route(list("ABEH"))
    assert not walking.is_rescue_route(list("ABEB"))
    assert not walking.is_rescue_route(list("BEH"))


def test_logs_are_not_mutated() -> None:
    log = build_log()
    before = copy.deepcopy(log)
    walking.check("build-triangle", log)
    assert log == before
