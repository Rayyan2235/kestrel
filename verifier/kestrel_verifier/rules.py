"""What an attempt earns, decided from server-stamped facts and a re-simulation.

Pure functions, no I/O. The numbers come from verifier/kits/rules.json, which
scripts/export-kits.ts writes from packages/contracts and a contracts test
keeps in sync, so the verifier and the API grade with the same rules.
The client's own claims (its tilt, its "level", its XP) are never read.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

RULES = json.loads((Path(__file__).resolve().parents[1] / "kits" / "rules.json").read_text(encoding="utf-8"))
XP: dict[str, int] = RULES["xp"]
PROMPTS = {p["id"]: p for p in RULES["prompts"]}
MIN_CM, MAX_CM = RULES["markCm"]
BEAM_OBJECTIVE = "balance-beam"


def tilt_deg(angle: float) -> float:
    """|angle| in degrees rounded to 0.1, the way the browser rounds (Math.round, half up)."""
    return math.floor(abs(math.degrees(angle)) * 10 + 0.5) / 10


def low_side(angle: float) -> str:
    """Rounded first, then classified, as apps/web/src/sandbox/agentSession.ts does."""
    if tilt_deg(angle) < RULES["levelDeg"]:
        return "level"
    return "left" if angle > 0 else "right"


def eligible(rule: str, values: list[str], answer: str) -> bool:
    """apps/api/src/ledger.ts eligible(): locks on the prompt, oldest first."""
    if not values:
        return False
    matched = values[-1] == answer
    if rule == "locked":
        return True
    if rule == "matched":
        return matched
    return matched and any(v != answer for v in values[:-1])


@dataclass
class Attempt:
    id: str
    learner_id: str
    objective: str
    lock_id: str | None
    trial_started_at: datetime | None


@dataclass
class Lock:
    learner_id: str
    challenge_id: str
    prompt_id: str
    value: str
    locked_at: datetime


@dataclass
class Claim:
    """The client's submission, from S3: who it is and where the weights ended up."""

    attempt_id: str
    learner_id: str
    left_cm: float
    right_cm: float


@dataclass
class Verdict:
    status: str  # verified | rejected | unverified
    reason: str
    ok: bool = False
    tilt_deg: float | None = None
    awards: list[tuple[str, str, str, int]] = field(default_factory=list)  # (rule, challenge, prompt, xp)


def reject(reason: str) -> Verdict:
    return Verdict("rejected", reason)


def decide(attempt: Attempt, claim: Claim, lock: Lock | None, lock_values: list[str], angle: float | None) -> Verdict:
    """
    lock_values: this learner's locks on the lock's prompt made before the trial started, oldest first.
    angle: the re-simulated plank angle for the claim's marks (moments.resim).
    """
    if claim.learner_id != attempt.learner_id or claim.attempt_id != attempt.id:
        return reject("claim does not match the attempt")
    if attempt.trial_started_at is None:
        return reject("trial was never started")
    if not (MIN_CM <= claim.left_cm <= MAX_CM and MIN_CM <= claim.right_cm <= MAX_CM):
        return reject("weight marks off the rail")
    if attempt.objective == RULES["promptChallenge"]:
        return _prompt(attempt, claim, lock, lock_values, angle)
    if attempt.objective == BEAM_OBJECTIVE:
        deg = tilt_deg(angle)
        ok = deg <= RULES["objectiveLevelDeg"]
        awards = [("objective", BEAM_OBJECTIVE, "", XP["objective"])] if ok else []
        return Verdict("verified", "beam re-simulated", ok, deg, awards)
    # Walking objectives need trajectory plausibility checks (ADR-003); not built yet.
    return Verdict("unverified", f"no verifier for {attempt.objective} yet")


def _prompt(attempt: Attempt, claim: Claim, lock: Lock | None, lock_values: list[str], angle: float | None) -> Verdict:
    if lock is None or attempt.lock_id is None:
        return reject("no prediction lock")
    if lock.learner_id != attempt.learner_id or lock.challenge_id != RULES["promptChallenge"]:
        return reject("lock belongs to another learner or challenge")
    if not lock.locked_at < attempt.trial_started_at:
        return reject("prediction locked after the trial started")
    prompt = PROMPTS.get(lock.prompt_id)
    if prompt is None or (claim.left_cm, claim.right_cm) != (prompt["left"], prompt["right"]):
        return reject("weights are not at the prompt's marks")
    answer = low_side(angle)
    awards = [(r, RULES["promptChallenge"], lock.prompt_id, XP[r]) for r in ("locked", "matched", "comeback") if eligible(r, lock_values, answer)]
    return Verdict("verified", f"beam went {answer}", lock_values[-1] == answer if lock_values else False, tilt_deg(angle), awards)
