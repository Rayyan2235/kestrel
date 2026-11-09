import math
from datetime import datetime, timedelta, timezone

import pytest

from kestrel_verifier.rules import XP, Attempt, Claim, Lock, decide, eligible, low_side, tilt_deg

# The predicates the verdict rests on. Pure: no database, no simulation.

LEARNER = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
OTHER = "9a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
ATTEMPT = "11111111-2222-4333-8444-555555555555"
T0 = datetime(2026, 11, 9, 12, 0, tzinfo=timezone.utc)
LEVEL, LEFT_DOWN, RIGHT_DOWN = 0.0, 0.1, -0.1  # plank angles, radians


def attempt(objective="moments", started=T0, lock_id="lock-1") -> Attempt:
    return Attempt(ATTEMPT, LEARNER, objective, lock_id, started)


def lock(prompt="m-10-20", value="level", at=T0 - timedelta(seconds=5), learner=LEARNER) -> Lock:
    return Lock(learner, "moments", prompt, value, at)


def claim(left=10, right=20, learner=LEARNER) -> Claim:
    return Claim(ATTEMPT, learner, left, right)


def test_tilt_rounds_half_up_like_the_browser() -> None:
    assert tilt_deg(math.radians(0.45)) == 0.5  # Python's round() would give 0.4
    assert tilt_deg(math.radians(-1.25)) == 1.3
    assert low_side(math.radians(0.44)) == "level"
    assert low_side(math.radians(0.45)) == "left"  # rounds to 0.5, so not level
    assert low_side(math.radians(-2)) == "right"


@pytest.mark.parametrize(
    ("rule", "values", "answer", "ok"),
    [
        ("locked", [], "level", False),
        ("locked", ["left"], "level", True),
        ("matched", ["left", "level"], "level", True),
        ("matched", ["level", "left"], "level", False),
        ("comeback", ["level"], "level", False),
        ("comeback", ["left", "level"], "level", True),
    ],
)
def test_eligible_matches_the_api_ledger(rule, values, answer, ok) -> None:
    assert eligible(rule, values, answer) is ok


def test_a_correct_prediction_earns_locked_and_matched() -> None:
    v = decide(attempt(), claim(), lock(), ["level"], LEVEL)
    assert (v.status, v.ok) == ("verified", True)
    assert [a[0] for a in v.awards] == ["locked", "matched"]
    assert sum(a[3] for a in v.awards) == XP["locked"] + XP["matched"]


def test_a_wrong_then_right_prediction_earns_the_comeback() -> None:
    v = decide(attempt(), claim(), lock(), ["left", "level"], LEVEL)
    assert [a[0] for a in v.awards] == ["locked", "matched", "comeback"]


def test_the_answer_is_what_the_resim_measured_not_the_client() -> None:
    # The client may claim anything; only the re-simulated angle decides.
    v = decide(attempt(), claim(15, 20), lock("m-15-20", "left"), ["left"], LEFT_DOWN)
    assert v.ok and "left" in v.reason
    wrong = decide(attempt(), claim(15, 20), lock("m-15-20", "right"), ["right"], LEFT_DOWN)
    assert not wrong.ok and [a[0] for a in wrong.awards] == ["locked"]


@pytest.mark.parametrize(
    ("a", "c", "l", "reason"),
    [
        (attempt(), claim(), lock(at=T0), "locked after"),
        (attempt(), claim(), lock(at=T0 + timedelta(seconds=1)), "locked after"),
        (attempt(), claim(15, 20), lock(), "prompt's marks"),
        (attempt(), claim(learner=OTHER), lock(), "does not match"),
        (attempt(), claim(), lock(learner=OTHER), "another learner"),
        (attempt(lock_id=None), claim(), None, "no prediction lock"),
        (attempt(started=None), claim(), lock(), "never started"),
        (attempt(), claim(4, 20), lock(), "off the rail"),
    ],
)
def test_rejections(a, c, l, reason) -> None:
    v = decide(a, c, l, ["level"], LEVEL)
    assert v.status == "rejected" and reason in v.reason
    assert v.awards == []


@pytest.mark.parametrize(("deg", "ok"), [(0.0, True), (1.5, True), (1.6, False), (5.8, False)])
def test_beam_objective_within_tolerance(deg: float, ok: bool) -> None:
    v = decide(attempt("balance-beam", lock_id=None), claim(), None, [], math.radians(deg))
    assert v.status == "verified" and v.ok is ok
    assert v.awards == ([("objective", "balance-beam", "", XP["objective"])] if ok else [])


def test_walking_objectives_stay_unverified_until_their_checks_exist() -> None:
    v = decide(attempt("build-triangle", lock_id=None), claim(), None, [], LEVEL)
    assert v.status == "unverified" and v.awards == []
