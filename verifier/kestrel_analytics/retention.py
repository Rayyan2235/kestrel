"""Retention as code: learners inactive for 180 days are deleted, with everything they made.

Aurora DSQL allows at most 3,000 changed rows per transaction, and the
connection autocommits, so every DELETE below is its own transaction and
touches at most BATCH rows. Children go before parents, because the foreign
keys are NO ACTION (a cascade would count toward the same limit):

  xp_events -> attempts (attempt_id) ; attempts -> prediction_locks (lock_id) ; all -> learners

An attempt has no foreign key to learners (a failed beam attempt can exist
before its learner row does), so old attempts whose learner row is gone or
was never made are swept separately.
"""

from __future__ import annotations

import psycopg

INACTIVE_DAYS = 180
BATCH = 1000
LEARNERS_PER_ROUND = 100

# (table, the columns that identify one row)
CHILDREN = [
    ("xp_events", "id"),
    ("concept_mastery", "learner_id, concept"),
    ("attempts", "id"),
    ("prediction_locks", "id"),
]


def _drain(conn: psycopg.Connection, sql: str, params: tuple) -> int:
    """Run a DELETE ... LIMIT BATCH until it deletes nothing; return the rows deleted."""
    total = 0
    while True:
        n = conn.execute(sql, params).rowcount
        total += n
        if n < BATCH:
            return total


def delete_learners(conn: psycopg.Connection, learner_ids: list[str]) -> int:
    """Delete these learners and all their rows, in batches. Returns the rows deleted."""
    total = 0
    for start in range(0, len(learner_ids), LEARNERS_PER_ROUND):
        ids = tuple(learner_ids[start : start + LEARNERS_PER_ROUND])
        marks = ", ".join(["%s"] * len(ids))
        for table, key in CHILDREN:
            total += _drain(
                conn,
                f"DELETE FROM {table} WHERE ({key}) IN (SELECT {key} FROM {table} WHERE learner_id IN ({marks}) LIMIT {BATCH})",
                ids,
            )
        total += conn.execute(f"DELETE FROM learners WHERE id IN ({marks})", ids).rowcount
    return total


def stale_learners(conn: psycopg.Connection, days: int = INACTIVE_DAYS) -> list[str]:
    rows = conn.execute(
        "SELECT id::text FROM learners WHERE last_seen_at < now() - %s * interval '1 day' ORDER BY id",
        (days,),
    ).fetchall()
    return [r[0] for r in rows]


def sweep(conn: psycopg.Connection, days: int = INACTIVE_DAYS) -> dict[str, int]:
    learners = stale_learners(conn, days)
    rows = delete_learners(conn, learners)
    orphans = _drain(
        conn,
        "DELETE FROM attempts WHERE id IN (SELECT a.id FROM attempts a WHERE a.at < now() - %s * interval '1 day'"
        f" AND NOT EXISTS (SELECT 1 FROM learners r WHERE r.id = a.learner_id) LIMIT {BATCH})",
        (days,),
    )
    return {"learnersDeleted": len(learners), "rowsDeleted": rows + orphans}
