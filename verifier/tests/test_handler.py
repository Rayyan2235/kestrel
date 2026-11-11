import json

import pytest
from psycopg import errors

from kestrel_verifier import handler, store
from kestrel_verifier.rules import Claim, Verdict

# SQS behaviour: partial batch failures, poison messages, and 40001 retries.

ATTEMPT = "11111111-2222-4333-8444-555555555555"
LEARNER = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
GOOD = json.dumps({"attemptId": ATTEMPT, "s3Key": f"replays/{ATTEMPT}.json"})


def record(message_id: str, body: str) -> dict:
    return {"messageId": message_id, "body": body}


@pytest.mark.parametrize(
    "body",
    [
        "not json",
        json.dumps({"attemptId": ATTEMPT}),
        json.dumps({"attemptId": "../etc", "s3Key": "replays/../etc.json"}),
        json.dumps({"attemptId": ATTEMPT, "s3Key": "voice/other.json"}),
    ],
)
def test_a_poison_message_fails_every_time(body: str) -> None:
    with pytest.raises((ValueError, KeyError)):
        handler.parse_message(body)


def test_a_claim_for_another_attempt_is_refused() -> None:
    raw = json.dumps({"attemptId": "99999999-2222-4333-8444-555555555555", "learnerId": LEARNER, "leftCm": 10, "rightCm": 20})
    with pytest.raises(ValueError):
        handler.parse_claim(ATTEMPT, raw.encode())


def test_only_the_failed_message_is_reported(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    def process(body: str) -> None:
        if body == "boom":
            raise RuntimeError("database unavailable")

    monkeypatch.setattr(handler, "process", process)
    result = handler.handler({"Records": [record("m1", GOOD), record("m2", "boom"), record("m3", GOOD)]}, None)
    assert result == {"batchItemFailures": [{"itemIdentifier": "m2"}]}
    log = capsys.readouterr().out
    assert "RuntimeError" in log and "database unavailable" not in log


def test_process_reads_the_claim_and_records_the_verdict(monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture) -> None:
    claim = {"attemptId": ATTEMPT, "learnerId": LEARNER, "leftCm": 10, "rightCm": 20}
    monkeypatch.setattr(handler, "read_claim", lambda key: json.dumps(claim).encode())
    monkeypatch.setattr(handler, "connection", lambda: "conn")
    seen = {}

    def verify(conn, c: Claim, measure):
        seen.update(conn=conn, claim=c)
        return Verdict("verified", "beam went level", True, 0.0, [("locked", "moments", "m-10-20", 10)])

    monkeypatch.setattr(store, "verify", verify)
    handler.process(GOOD)
    assert seen["claim"] == Claim(ATTEMPT, LEARNER, 10.0, 20.0)
    out = capsys.readouterr().out
    assert "verified" in out and LEARNER not in out


class FakeConn:
    def __init__(self, fail_times: int) -> None:
        self.fail_times = fail_times
        self.tries = 0

    def transaction(self):
        conn = self

        class Tx:
            def __enter__(self):
                conn.tries += 1
                if conn.tries <= conn.fail_times:
                    raise errors.SerializationFailure("could not serialize access")

            def __exit__(self, *exc):
                return False

        return Tx()


def test_a_serialization_failure_retries_the_whole_transaction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(store.time, "sleep", lambda s: None)
    monkeypatch.setattr(store, "_verify", lambda conn, claim, angle: Verdict("verified", "ok"))
    conn = FakeConn(fail_times=2)
    measured = []
    v = store.verify(conn, Claim(ATTEMPT, LEARNER, 10, 20), lambda l, r: measured.append((l, r)) or 0.0)
    assert v.status == "verified" and conn.tries == 3
    assert measured == [(10, 20)]  # the re-sim runs once, outside the retried transaction


def test_persistent_serialization_failures_fail_the_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(store.time, "sleep", lambda s: None)
    conn = FakeConn(fail_times=99)
    with pytest.raises(errors.SerializationFailure):
        store.verify(conn, Claim(ATTEMPT, LEARNER, 10, 20), lambda l, r: 0.0)
    assert conn.tries == store.RETRIES
