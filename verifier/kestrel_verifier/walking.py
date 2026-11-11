"""Plausibility checks for the walking objectives (ADR-003). Pure: no I/O beyond the pinned kits.

Exact replay of a walking attempt diverges chaotically, so the verifier
checks the browser's low-rate pose log instead (packages/contracts
trajectory.ts: each robot's and each prop's [x, y, yaw°] at 4 Hz since the
last reset):

1. Shape: the agreed rate, equal-length series, known robots and props.
2. Start: everything starts where the pinned kit puts it, so the scene can't
   be edited to make the task easy.
3. Robots: no step faster than the gait can walk or turn (with a margin for
   falls and policy overshoot). A teleport fails here.
4. Props: no prop moves faster than a kick can send it, and a prop moves only
   while a robot (or a prop that is itself moving) is within reach of it.
5. The objective: the final state meets it (all three squares on their slots;
   Pip followed the learner's route to the charger within the battery, without
   touching a barrier or the other robot).

A log that fails 1-4 is implausible: the attempt is rejected. A plausible log
that doesn't meet the objective is a verified "not met". This raises the cost
of cheating from editing one number to forging a physically consistent
trajectory; it can't rule that out, which ADR-003 accepts.

The margins are first estimates. P4c-2 calibrates them on real browser logs.
"""

from __future__ import annotations

import math

from kestrel_verifier.rules import RULES, load_kit

WALK = RULES["walking"]
HZ: int = WALK["hz"]
DT = 1 / HZ
GAIT = WALK["gait"]
RESCUE = WALK["rescue"]

# Verifier tolerances. Speeds are per second; distances in metres.
SPEED_MARGIN = 2.0  # a falling robot's trunk moves faster than its gait
TURN_MARGIN = 2.5
START_BOT_M = 0.15
START_PROP_M = 0.03
PROP_STILL_M = 0.01  # per sample: less than this is settling, not moving
PROP_MAX_SPEED = 3.0  # a kick
REACH_M = 0.4  # trunk to prop centre while pushing (robot ~0.1 + square half-diagonal ~0.14 + slack)
CONTACT_WINDOW_S = 1.5  # a pushed prop may slide to rest this long after contact
BARRIER_CONTACT_M = 0.03  # trunk this close to a barrier box means Pip touched it
SAMPLED_WAYPOINT_M = WALK["rescue"]["waypointM"] * 1.5  # a 4 Hz sample may miss the closest point
ROUTE_CORRIDOR_M = 0.35  # Pip's navigator keeps it on the segment between route points

KIT_OF = {"build-triangle": "pythagoras", "rescue-pip": "rescue"}
Series = list[list[float]]


class Implausible(ValueError):
    """The log could not have come from the simulation: reject the attempt."""


def check(objective: str, trajectory: dict, route: list[str] | None = None) -> tuple[bool, str]:
    """(met, why) for a plausible log; raises Implausible otherwise."""
    kit = load_kit(KIT_OF[objective])
    bots, props = _shape(trajectory, kit)
    _start(bots, props, kit)
    _robots(bots)
    _props(bots, props)
    if objective == "build-triangle":
        return _triangle(props, kit)
    return _rescue(bots, route)


def _shape(t: dict, kit: dict) -> tuple[dict[str, Series], dict[str, Series]]:
    if t.get("hz") != HZ:
        raise Implausible(f"log rate is not {HZ} Hz")
    bots, props = t.get("bots") or {}, t.get("props") or {}
    if not bots or not set(bots) <= set(kit["spawns"]):
        raise Implausible("unknown or missing robots")
    movable = {p["id"] for p in kit["props"] if p.get("joint") != "fixed"}
    if not set(props) <= movable:
        raise Implausible("unknown props")
    series = [*bots.values(), *props.values()]
    n = len(series[0])
    if not 2 <= n <= WALK["maxSamples"] or any(len(s) != n for s in series):
        raise Implausible("series lengths differ or are out of range")
    if any(len(p) != 3 or not all(math.isfinite(v) for v in p) for s in series for p in s):
        raise Implausible("a pose is not [x, y, yaw]")
    return bots, props


def _start(bots: dict[str, Series], props: dict[str, Series], kit: dict) -> None:
    for bot, s in bots.items():
        spawn = kit["spawns"][bot]
        if math.dist(s[0][:2], spawn[:2]) > START_BOT_M:
            raise Implausible(f"{bot} does not start at its spawn")
    starts = {p["id"]: p["pos"] for p in kit["props"]}
    for prop, s in props.items():
        if math.dist(s[0][:2], starts[prop][:2]) > START_PROP_M:
            raise Implausible(f"{prop} does not start where the kit puts it")


def _turn(a_deg: float, b_deg: float) -> float:
    """The smallest angle between two headings, in radians."""
    return abs((math.radians(b_deg - a_deg) + math.pi) % (2 * math.pi) - math.pi)


def _robots(bots: dict[str, Series]) -> None:
    max_speed = max(GAIT["fwd"], -GAIT["back"]) * SPEED_MARGIN
    max_turn = GAIT["spin"] * TURN_MARGIN
    for bot, s in bots.items():
        for i in range(1, len(s)):
            if math.dist(s[i - 1][:2], s[i][:2]) / DT > max_speed:
                raise Implausible(f"{bot} moved faster than it can walk at sample {i}")
            if _turn(s[i - 1][2], s[i][2]) / DT > max_turn:
                raise Implausible(f"{bot} turned faster than it can at sample {i}")


def _props(bots: dict[str, Series], props: dict[str, Series]) -> None:
    window = max(1, round(CONTACT_WINDOW_S * HZ))
    moving = {
        prop: [False] + [math.dist(s[i - 1][:2], s[i][:2]) > PROP_STILL_M for i in range(1, len(s))]
        for prop, s in props.items()
    }
    for prop, s in props.items():
        for i in range(1, len(s)):
            step = math.dist(s[i - 1][:2], s[i][:2])
            if step / DT > PROP_MAX_SPEED:
                raise Implausible(f"{prop} jumped at sample {i}")
            if not moving[prop][i]:
                continue
            recent = range(max(0, i - window), i + 1)
            pushers = [b[j][:2] for b in bots.values() for j in recent]
            pushers += [props[o][j][:2] for o in props if o != prop for j in recent if moving[o][j]]
            if not any(math.dist(p, s[j][:2]) <= REACH_M for p in pushers for j in (i - 1, i)):
                raise Implausible(f"{prop} moved with nothing touching it at sample {i}")


def _triangle(props: dict[str, Series], kit: dict) -> tuple[bool, str]:
    tol = WALK["slotTolerance"]
    filled = [
        s for s in kit["slots"]
        if s["forProp"] in props and math.dist(props[s["forProp"]][-1][:2], s["pos"]) <= tol
    ]
    n = len(kit["slots"])
    return (len(filled) == n, f"{len(filled)}/{n} squares on the triangle")


def is_rescue_route(route: list[str]) -> bool:
    """packages/contracts rescue.ts isRescueRoute."""
    edges = {tuple(e) for e in RESCUE["edges"]}
    return (
        2 <= len(route) <= 7
        and route[0] == "A"
        and route[-1] == "H"
        and len(set(route)) == len(route)
        and all((a, b) in edges for a, b in zip(route, route[1:]))
    )


def _box_distance(p: list[float], barrier: dict) -> float:
    """Distance from a point to a barrier box (sizes are full widths)."""
    dx = max(0.0, abs(p[0] - barrier["center"][0]) - barrier["size"][0] / 2)
    dy = max(0.0, abs(p[1] - barrier["center"][1]) - barrier["size"][1] / 2)
    return math.hypot(dx, dy)


def _segment_distance(p: list[float], a: list[float], b: list[float]) -> float:
    ax, ay = a
    dx, dy = b[0] - ax, b[1] - ay
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - ax - t * dx, p[1] - ay - t * dy)


def _rescue(bots: dict[str, Series], route: list[str] | None) -> tuple[bool, str]:
    if route is None or not is_rescue_route(route):
        raise Implausible("no legal rescue route")
    pip = bots.get("pip")
    if pip is None:
        raise Implausible("no log for Pip")
    traveled = sum(math.dist(pip[i - 1][:2], pip[i][:2]) for i in range(1, len(pip)))
    if traveled >= RESCUE["batteryMeters"]:
        return False, "battery ran out"
    if any(_box_distance(p, b) < BARRIER_CONTACT_M for p in pip for b in RESCUE["barriers"]):
        return False, "Pip met an obstacle"
    nova = bots.get("nova")
    if nova and any(math.dist(a[:2], b[:2]) < RESCUE["otherRobotM"] for a, b in zip(pip, nova)):
        return False, "Pip met the other robot"
    points = [RESCUE["beacons"][b] for b in route]
    if any(min(_segment_distance(p[:2], a, b) for a, b in zip(points, points[1:])) > ROUTE_CORRIDOR_M for p in pip):
        return False, "Pip left the route"
    # Each route point in order, then stopped at the charger.
    i = 0
    for beacon in route[1:]:
        at = RESCUE["beacons"][beacon]
        while i < len(pip) and math.dist(pip[i][:2], at) > SAMPLED_WAYPOINT_M:
            i += 1
        if i == len(pip):
            return False, f"Pip never reached {beacon}"
    if math.dist(pip[-1][:2], RESCUE["beacons"]["H"]) > SAMPLED_WAYPOINT_M:
        return False, "Pip did not stop at the charger"
    return True, f"route {''.join(route)} followed, {traveled:.2f} m"
