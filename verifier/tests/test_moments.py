import math

import pytest

from kestrel_verifier.moments import resim
from kestrel_verifier.rules import PROMPTS, RULES, low_side, tilt_deg

# The re-sim reproduces the physics the prompts teach, from the marks alone.


@pytest.mark.parametrize("prompt", list(PROMPTS.values()), ids=list(PROMPTS))
def test_each_prompt_resimulates_to_its_answer(prompt: dict) -> None:
    assert low_side(resim(prompt["left"], prompt["right"])) == prompt["answer"]


def test_a_push_a_millimetre_or_two_off_still_meets_the_objective() -> None:
    # The objective's tolerance exists for real pushes that stop 1-2 mm off the mark.
    for left in (9.9, 10.1):
        assert tilt_deg(resim(left, 20)) <= RULES["objectiveLevelDeg"]


def test_a_clearly_unbalanced_beam_does_not() -> None:
    assert tilt_deg(resim(12, 20)) > RULES["objectiveLevelDeg"]


def test_resim_is_repeatable() -> None:
    assert resim(13.3, 21.7) == resim(13.3, 21.7)
    assert math.isfinite(resim(5, 30))
