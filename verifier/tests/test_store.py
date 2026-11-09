import os
import threading
from pathlib import Path

import psycopg
import pytest

from kestrel_verifier import store
from kestrel_verifier.rules import XP, Claim

# Runs only against a throwaway database: CI starts one (KESTREL_TEST_DATABASE_URL);
# locally `pnpm db:up` then set it. Uses its own schema, built from the API's migrations.

URL = os.environ.get("KESTREL_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="KESTREL_TEST_DATABASE_URL is not set")
MIGRATIONS = Path(__file__).resolve().parents[2] / "apps" / "api" / "migrations"
LEARNER = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
LEVEL = 0.0


def connect() -> psycopg.Connection:
    conn = psycopg.connect(URL, autocommit=True)
    conn.execute("SET search_path TO test_verifier")
    return conn


@pytest.fixture()
def conn():
    with psycopg.connect(URL, autocommit=True) as admin:
        admin.execute("DROP SCHEMA IF EXISTS test_verifier CASCADE")
        admin.execute("CREATE SCHEMA test_verifier")
    c = connect()
    for f in sorted(MIGRATIONS.glob("*.up.sql")):
        c.execute(f.read_text(encoding="utf-8"))
    yield c
    c.close()


def lock_and_start(conn, value="level", prompt="m-10-20", objective="moments") -> str:
    """As the API does: register the learner, stamp the lock, then stamp the trial start."""
    conn.execute("INSERT INTO learners (id) VALUES (%s) ON CONFLICT DO NOTHING", (LEARNER,))
    (lock_id,) = conn.execute(
        "INSERT INTO prediction_locks (learner_id, challenge_id, prompt_id, value) VALUES (%s, 'moments', %s, %s) RETURNING id::text",
        (LEARNER, prompt, value),
    ).fetchone()
    (attempt_id,) = conn.execute(
        "INSERT INTO attempts (learner_id, objective, status, lock_id, trial_started_at, ok) VALUES (%s, %s, 'pending', %s, now(), false) RETURNING id::text",
        (LEARNER, objective, lock_id),
    ).fetchone()
    return attempt_id


def xp(conn) -> list[tuple[str, int]]:
    return conn.execute("SELECT rule_id, xp FROM xp_events WHERE learner_id = %s ORDER BY rule_id", (LEARNER,)).fetchall()


def test_a_verified_attempt_records_its_verdict_and_xp_together(conn) -> None:
    attempt = lock_and_start(conn)
    v = store.verify(conn, Claim(attempt, LEARNER, 10, 20), lambda l, r: LEVEL)
    assert v.status == "verified" and v.ok
    assert xp(conn) == [("locked", XP["locked"]), ("matched", XP["matched"])]
    row = conn.execute("SELECT status, ok, left_cm, right_cm FROM attempts WHERE id = %s", (attempt,)).fetchone()
    assert row == ("verified", True, 10, 20)


def test_a_redelivered_message_awards_nothing_more(conn) -> None:
    attempt = lock_and_start(conn)
    claim = Claim(attempt, LEARNER, 10, 20)
    assert store.verify(conn, claim, lambda l, r: LEVEL) is not None
    assert store.verify(conn, claim, lambda l, r: LEVEL) is None
    assert len(xp(conn)) == 2


def test_concurrent_deliveries_award_exactly_once(conn) -> None:
    attempt = lock_and_start(conn)
    claim = Claim(attempt, LEARNER, 10, 20)
    results = []

    def deliver() -> None:
        with connect() as c:
            results.append(store.verify(c, claim, lambda l, r: LEVEL))

    threads = [threading.Thread(target=deliver) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sum(r is not None for r in results) == 1
    assert len(xp(conn)) == 2


def test_a_second_attempt_on_the_same_prompt_earns_no_repeat_xp(conn) -> None:
    first = lock_and_start(conn)
    store.verify(conn, Claim(first, LEARNER, 10, 20), lambda l, r: LEVEL)
    again = lock_and_start(conn)
    v = store.verify(conn, Claim(again, LEARNER, 10, 20), lambda l, r: LEVEL)
    assert v.status == "verified"
    assert len(xp(conn)) == 2  # xp_events' unique key refuses the repeats


def test_a_rejected_attempt_is_recorded_with_no_xp(conn) -> None:
    attempt = lock_and_start(conn)
    v = store.verify(conn, Claim(attempt, LEARNER, 15, 20), lambda l, r: LEVEL)  # not the prompt's marks
    assert v.status == "rejected"
    assert conn.execute("SELECT status FROM attempts WHERE id = %s", (attempt,)).fetchone() == ("rejected",)
    assert xp(conn) == []


def test_a_lock_made_after_the_trial_started_does_not_count(conn) -> None:
    attempt = lock_and_start(conn, value="left")
    conn.execute(
        "INSERT INTO prediction_locks (learner_id, challenge_id, prompt_id, value, locked_at) VALUES (%s, 'moments', 'm-10-20', 'level', now() + interval '1 second')",
        (LEARNER,),
    )
    v = store.verify(conn, Claim(attempt, LEARNER, 10, 20), lambda l, r: LEVEL)
    assert not v.ok
    assert xp(conn) == [("locked", XP["locked"])]


def test_an_unknown_attempt_is_acknowledged_without_writes(conn) -> None:
    assert store.verify(conn, Claim("00000000-0000-4000-8000-000000000000", LEARNER, 10, 20), lambda l, r: LEVEL) is None
    assert xp(conn) == []
