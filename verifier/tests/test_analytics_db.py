import os
from pathlib import Path

import psycopg
import pytest

from kestrel_analytics import forget, nightly, retention

# Runs only against a throwaway database, like test_store.py: CI sets KESTREL_TEST_DATABASE_URL.

URL = os.environ.get("KESTREL_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="KESTREL_TEST_DATABASE_URL is not set")
MIGRATIONS = Path(__file__).resolve().parents[2] / "apps" / "api" / "migrations"
ACTIVE = "1a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
STALE = "2b1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"
NO_ROW = "3c1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"  # attempts, but never a learners row


@pytest.fixture()
def conn():
    with psycopg.connect(URL, autocommit=True) as admin:
        admin.execute("DROP SCHEMA IF EXISTS test_analytics CASCADE")
        admin.execute("CREATE SCHEMA test_analytics")
    c = psycopg.connect(URL, autocommit=True)
    c.execute("SET search_path TO test_analytics")
    for f in sorted(MIGRATIONS.glob("*.up.sql")):
        c.execute(f.read_text(encoding="utf-8"))
    yield c
    c.close()


def learner(conn, id: str, days_ago: int = 0) -> None:
    conn.execute("INSERT INTO learners (id, last_seen_at) VALUES (%s, now() - %s * interval '1 day')", (id, days_ago))


def prompt_try(conn, id: str, prompt: str, ok: bool, status: str = "verified", days_ago: int = 0) -> str:
    """A verified prompt trial, with its lock and, when right, its XP, as the verifier leaves them."""
    (lock,) = conn.execute(
        "INSERT INTO prediction_locks (learner_id, challenge_id, prompt_id, value) VALUES (%s, 'moments', %s, 'level') RETURNING id",
        (id, prompt),
    ).fetchone()
    (attempt,) = conn.execute(
        "INSERT INTO attempts (learner_id, objective, status, lock_id, trial_started_at, ok, at)"
        " VALUES (%s, 'moments', %s, %s, now(), %s, now() - %s * interval '1 day') RETURNING id",
        (id, status, lock, ok, days_ago),
    ).fetchone()
    if ok:
        conn.execute(
            "INSERT INTO xp_events (learner_id, rule_id, challenge_id, prompt_id, xp, attempt_id) VALUES (%s, 'matched', 'moments', %s, 15, %s) ON CONFLICT DO NOTHING",
            (id, prompt, attempt),
        )
    return str(attempt)


def beam_try(conn, id: str, ok: bool, days_ago: int = 0) -> None:
    conn.execute(
        "INSERT INTO attempts (learner_id, objective, status, trial_started_at, ok, at) VALUES (%s, 'balance-beam', 'verified', now(), %s, now() - %s * interval '1 day')",
        (id, ok, days_ago),
    )


def count(conn, table: str, id: str) -> int:
    return conn.execute(f"SELECT count(*) FROM {table} WHERE learner_id = %s", (id,)).fetchone()[0]


def test_the_nightly_job_writes_mastery_and_prompt_stats_from_verified_attempts(conn) -> None:
    learner(conn, ACTIVE)
    prompt_try(conn, ACTIVE, "m-15-20", False)
    prompt_try(conn, ACTIVE, "m-15-20", True)
    prompt_try(conn, ACTIVE, "m-10-20", True, status="rejected")  # not evidence
    beam_try(conn, ACTIVE, True)
    beam_try(conn, NO_ROW, False)  # no learners row: no mastery row, but no failure either

    report = nightly.run(conn)
    assert report["outcomes"] == 4 and report["prompts"] == 1

    rows = conn.execute("SELECT learner_id::text, concept, alpha, beta, n FROM concept_mastery").fetchall()
    assert rows == [(ACTIVE, "moments", 3.0, 2.0, 3)]
    assert conn.execute("SELECT challenge_id, prompt_id, attempts, successes, median_tries FROM prompt_stats").fetchall() == [
        ("moments", "m-15-20", 2, 1, 2.0)
    ]
    # A second run recomputes the same numbers in place.
    beam_try(conn, ACTIVE, False)
    nightly.run(conn)
    assert conn.execute("SELECT alpha, beta, n FROM concept_mastery").fetchall() == [(3.0, 3.0, 4)]


def test_retention_deletes_inactive_learners_in_batches_and_keeps_active_ones(conn, monkeypatch) -> None:
    monkeypatch.setattr(retention, "BATCH", 2)  # forces several batches per table
    learner(conn, ACTIVE, days_ago=10)
    learner(conn, STALE, days_ago=200)
    for i in range(5):
        prompt_try(conn, STALE, f"m-{i}", ok=True)
    prompt_try(conn, ACTIVE, "m-10-20", ok=True)
    beam_try(conn, NO_ROW, False, days_ago=200)  # old, learner row never made
    beam_try(conn, NO_ROW, False, days_ago=5)  # recent: kept
    # A mastery row from an earlier night, which retention must also remove.
    conn.execute("INSERT INTO concept_mastery (learner_id, concept) VALUES (%s, 'moments')", (STALE,))

    report = retention.sweep(conn)
    assert report["learnersDeleted"] == 1
    for table in ("xp_events", "concept_mastery", "attempts", "prediction_locks"):
        assert count(conn, table, STALE) == 0, table
    assert conn.execute("SELECT count(*) FROM learners WHERE id = %s", (STALE,)).fetchone()[0] == 0
    assert count(conn, "attempts", ACTIVE) == 1 and count(conn, "xp_events", ACTIVE) == 1
    assert count(conn, "attempts", NO_ROW) == 1


def test_forget_deletes_one_learner_now(conn, monkeypatch, capsys) -> None:
    learner(conn, ACTIVE)
    prompt_try(conn, ACTIVE, "m-10-20", ok=True)
    monkeypatch.setenv("DATABASE_URL", URL)
    monkeypatch.setattr(forget.db, "connect", lambda: conn_in_schema())
    assert forget.main([ACTIVE]) == 0
    assert "for 1 learner(s)" in capsys.readouterr().out
    assert conn.execute("SELECT count(*) FROM learners").fetchone()[0] == 0
    assert forget.main(["not-a-uuid"]) == 2


def conn_in_schema() -> psycopg.Connection:
    c = psycopg.connect(URL, autocommit=True)
    c.execute("SET search_path TO test_analytics")
    return c
