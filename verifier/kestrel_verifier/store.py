"""Write a verdict and its XP in one transaction, exactly once.

SQS delivers at least once, so the same attempt can arrive twice, even
concurrently. Two guards make awards exactly-once:
- the attempt moves out of 'pending' in the same transaction that inserts its
  XP, so a redelivered message finds it already decided and writes nothing;
- xp_events' unique key (learner, rule, challenge, prompt) refuses a repeat
  award across attempts.
A serialization failure (40001: DSQL's optimistic concurrency, or a
concurrent Postgres transaction) rolls everything back and the whole
transaction is retried.
"""

from __future__ import annotations

import time
from typing import Callable

import psycopg
from psycopg import errors

from kestrel_verifier.rules import Attempt, Claim, Lock, Verdict, decide

RETRIES = 5


def verify(conn: psycopg.Connection, claim: Claim, measure: Callable[[float, float], float]) -> Verdict | None:
    """Decide and record one attempt. None when it was already decided (a redelivery) or doesn't exist."""
    # The re-sim depends only on the claim's marks: run it before the transaction, so the transaction stays short.
    # A walking claim has no marks; its checks are pure and run inside decide().
    angle = measure(claim.left_cm, claim.right_cm) if claim.left_cm is not None and claim.right_cm is not None else None
    for attempt_no in range(RETRIES):
        try:
            with conn.transaction():
                return _verify(conn, claim, angle)
        except errors.SerializationFailure:
            if attempt_no == RETRIES - 1:
                raise
            time.sleep(0.05 * 2**attempt_no)
    return None


def _verify(conn: psycopg.Connection, claim: Claim, angle: float) -> Verdict | None:
    row = conn.execute(
        "SELECT id::text, learner_id::text, objective, status, lock_id::text, trial_started_at FROM attempts WHERE id = %s FOR UPDATE",
        (claim.attempt_id,),
    ).fetchone()
    if row is None or row[3] != "pending":
        return None
    attempt = Attempt(row[0], row[1], row[2], row[4], row[5])
    lock, values = None, []
    if attempt.lock_id:
        l = conn.execute(
            "SELECT learner_id::text, challenge_id, prompt_id, value, locked_at FROM prediction_locks WHERE id = %s",
            (attempt.lock_id,),
        ).fetchone()
        if l:
            lock = Lock(*l)
            # Only predictions made before this trial started count.
            values = [
                v for (v,) in conn.execute(
                    "SELECT value FROM prediction_locks WHERE learner_id = %s AND challenge_id = %s AND prompt_id = %s AND locked_at < %s ORDER BY locked_at",
                    (attempt.learner_id, lock.challenge_id, lock.prompt_id, attempt.trial_started_at),
                ).fetchall()
            ]
    verdict = decide(attempt, claim, lock, values, angle)
    conn.execute(
        "UPDATE attempts SET status = %s, ok = %s, tilt_deg = %s, left_cm = %s, right_cm = %s WHERE id = %s AND status = 'pending'",
        (verdict.status, verdict.ok, verdict.tilt_deg, claim.left_cm, claim.right_cm, attempt.id),
    )
    if verdict.awards:
        conn.execute("INSERT INTO learners (id) VALUES (%s) ON CONFLICT (id) DO NOTHING", (attempt.learner_id,))
        for rule, challenge, prompt, xp in verdict.awards:
            conn.execute(
                "INSERT INTO xp_events (learner_id, rule_id, challenge_id, prompt_id, xp, attempt_id) VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (attempt.learner_id, rule, challenge, prompt, xp, attempt.id),
            )
    return verdict
