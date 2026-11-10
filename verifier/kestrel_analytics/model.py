"""Mastery and prompt difficulty from verified attempts. Pure: no I/O.

Only attempts the verifier marked 'verified' count. A rejected attempt (a
lock after the trial started, marks off the prompt) says nothing about what
the learner knows.

- Mastery: a Beta(alpha, beta) posterior per learner and concept, starting
  from a uniform Beta(1, 1) prior. Each verified success adds 1 to alpha and
  each failure adds 1 to beta, so the mean alpha / (alpha + beta) moves toward
  the learner's success rate as evidence grows.
- Difficulty: per prompt, attempts, successes and the median number of tries
  learners took to get it right. Prompts are ranked by their smoothed success
  rate, (successes + 1) / (attempts + 2), lowest (hardest) first.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from typing import Iterable

# Which concept each verified objective exercises. Predicting the low side
# of a Moments prompt and balancing the beam both test moments (torque
# balance). The walking objectives join when they have a verifier (ADR-003).
CONCEPTS = {"moments": "moments", "balance-beam": "moments"}
PRIOR = (1.0, 1.0)


@dataclass(frozen=True)
class Outcome:
    learner_id: str
    objective: str
    prompt_id: str | None  # the prediction lock's prompt, for prompt trials
    ok: bool
    at: datetime


@dataclass(frozen=True)
class Mastery:
    learner_id: str
    concept: str
    alpha: float
    beta: float
    n: int

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)


@dataclass(frozen=True)
class PromptStat:
    challenge_id: str
    prompt_id: str
    attempts: int
    successes: int
    median_tries: float | None  # among learners who got it right; None if nobody has

    @property
    def rate(self) -> float:
        return (self.successes + 1) / (self.attempts + 2)


def mastery(outcomes: Iterable[Outcome]) -> list[Mastery]:
    counts: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for o in outcomes:
        concept = CONCEPTS.get(o.objective)
        if concept is not None:
            counts[(o.learner_id, concept)][0 if o.ok else 1] += 1
    return [
        Mastery(learner, concept, PRIOR[0] + wins, PRIOR[1] + losses, wins + losses)
        for (learner, concept), (wins, losses) in sorted(counts.items())
    ]


def prompt_stats(outcomes: Iterable[Outcome]) -> list[PromptStat]:
    tries: dict[tuple[str, str], dict[str, list[Outcome]]] = defaultdict(lambda: defaultdict(list))
    for o in outcomes:
        if o.prompt_id:
            tries[(o.objective, o.prompt_id)][o.learner_id].append(o)
    stats = []
    for (challenge, prompt), by_learner in sorted(tries.items()):
        all_tries = [o for learner_tries in by_learner.values() for o in learner_tries]
        to_first_success = []
        for learner_tries in by_learner.values():
            ordered = sorted(learner_tries, key=lambda o: o.at)
            first = next((i for i, o in enumerate(ordered, 1) if o.ok), None)
            if first is not None:
                to_first_success.append(first)
        stats.append(
            PromptStat(
                challenge,
                prompt,
                len(all_tries),
                sum(o.ok for o in all_tries),
                statistics.median(to_first_success) if to_first_success else None,
            )
        )
    return stats


def difficulty_order(stats: Iterable[PromptStat]) -> list[str]:
    """Prompt ids, hardest first."""
    return [s.prompt_id for s in sorted(stats, key=lambda s: (s.rate, s.prompt_id))]
