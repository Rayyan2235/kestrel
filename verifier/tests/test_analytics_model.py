import random
from datetime import datetime, timedelta, timezone

import pytest

from kestrel_analytics.model import Outcome, difficulty_order, mastery, prompt_stats

T0 = datetime(2026, 11, 1, tzinfo=timezone.utc)


def at(minutes: int) -> datetime:
    return T0 + timedelta(minutes=minutes)


def test_mastery_is_a_beta_posterior_from_a_uniform_prior() -> None:
    outcomes = [
        Outcome("a", "moments", "m-10-20", True, at(0)),
        Outcome("a", "moments", "m-15-20", False, at(1)),
        Outcome("a", "balance-beam", None, True, at(2)),  # the beam is moments too
        Outcome("b", "moments", "m-10-20", False, at(3)),
    ]
    (a, b) = mastery(outcomes)
    assert (a.learner_id, a.concept, a.alpha, a.beta, a.n) == ("a", "moments", 3.0, 2.0, 3)
    assert a.mean == pytest.approx(0.6)
    assert (b.alpha, b.beta, b.n) == (1.0, 2.0, 1)


def test_objectives_without_a_concept_are_ignored() -> None:
    assert mastery([Outcome("a", "build-triangle", None, True, at(0))]) == []


def test_prompt_stats_count_tries_and_the_median_tries_to_first_success() -> None:
    outcomes = [
        # a: wrong, then right (2 tries); b: right first time (1); c: never right.
        Outcome("a", "moments", "m-15-20", False, at(0)),
        Outcome("a", "moments", "m-15-20", True, at(1)),
        Outcome("a", "moments", "m-15-20", True, at(2)),
        Outcome("b", "moments", "m-15-20", True, at(0)),
        Outcome("c", "moments", "m-15-20", False, at(0)),
        Outcome("a", "balance-beam", None, True, at(3)),  # not a prompt
    ]
    (s,) = prompt_stats(outcomes)
    assert (s.challenge_id, s.prompt_id, s.attempts, s.successes, s.median_tries) == ("moments", "m-15-20", 5, 3, 1.5)


def test_median_tries_is_none_when_nobody_got_it() -> None:
    (s,) = prompt_stats([Outcome("a", "moments", "m-10-30", False, at(0))])
    assert s.median_tries is None


def synthetic_cohort(p_right: dict[str, float], learners: int, seed: int = 7) -> list[Outcome]:
    """Each learner tries each prompt until right, at most 3 times; a try is right with the prompt's probability."""
    rng = random.Random(seed)
    outcomes = []
    for n in range(learners):
        for prompt, p in p_right.items():
            for t in range(3):
                ok = rng.random() < p
                outcomes.append(Outcome(f"learner-{n}", "moments", prompt, ok, at(t)))
                if ok:
                    break
    return outcomes


def test_a_synthetic_cohort_recovers_the_difficulty_order() -> None:
    # The plan's done-check: known per-prompt difficulty in, the same order out.
    p_right = {"m-10-20": 0.85, "m-15-30": 0.65, "m-15-20": 0.45, "m-10-30": 0.25}
    stats = prompt_stats(synthetic_cohort(p_right, learners=200))
    assert difficulty_order(stats) == ["m-10-30", "m-15-20", "m-15-30", "m-10-20"]
    by_id = {s.prompt_id: s for s in stats}
    # Harder prompts take more tries, among those who got them.
    assert by_id["m-10-20"].median_tries <= by_id["m-10-30"].median_tries


def test_with_little_data_the_smoothed_rate_stays_near_a_half() -> None:
    (s,) = prompt_stats([Outcome("a", "moments", "m-10-20", True, at(0))])
    assert s.rate == pytest.approx(2 / 3)
