"""The nightly job: retention first, then mastery and prompt difficulty from verified attempts.

Batch analytics, apart from the request path: the API and the verifier only
append attempts and XP (OLTP), and this job recomputes the summary tables
from them once a night. A full recompute keeps it simple and idempotent; at
demo scale it reads a few thousand rows.

Retention runs first, so the summaries never count data that is due for
deletion. Writes go in chunks of CHUNK rows per transaction, under DSQL's
3,000-row limit.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg

from kestrel_analytics import model, retention
from kestrel_verifier import db

DSQL_USER = "kestrel_analytics"
CHUNK = 500

OUTCOMES_SQL = """
SELECT a.learner_id::text, a.objective, l.prompt_id, a.ok, a.at
FROM attempts a LEFT JOIN prediction_locks l ON l.id = a.lock_id
WHERE a.status = 'verified'
"""

# concept_mastery references learners, and a failed beam attempt can exist
# before its learner row does: such a learner is skipped until the row exists.
UPSERT_MASTERY = """
INSERT INTO concept_mastery (learner_id, concept, alpha, beta, n, updated_at)
SELECT r.id, %s::text, %s::float8, %s::float8, %s::int, now() FROM learners r WHERE r.id = %s::uuid
ON CONFLICT (learner_id, concept) DO UPDATE
SET alpha = EXCLUDED.alpha, beta = EXCLUDED.beta, n = EXCLUDED.n, updated_at = now()
"""

UPSERT_PROMPT = """
INSERT INTO prompt_stats (challenge_id, prompt_id, attempts, successes, median_tries, updated_at)
VALUES (%s, %s, %s, %s, %s, now())
ON CONFLICT (challenge_id, prompt_id) DO UPDATE
SET attempts = EXCLUDED.attempts, successes = EXCLUDED.successes, median_tries = EXCLUDED.median_tries, updated_at = now()
"""


def load_outcomes(conn: psycopg.Connection) -> list[model.Outcome]:
    return [model.Outcome(*row) for row in conn.execute(OUTCOMES_SQL).fetchall()]


def _write(conn: psycopg.Connection, sql: str, rows: list[tuple]) -> None:
    for start in range(0, len(rows), CHUNK):
        with conn.transaction(), conn.cursor() as cur:
            cur.executemany(sql, rows[start : start + CHUNK])


def run(conn: psycopg.Connection) -> dict[str, int]:
    report = retention.sweep(conn)
    outcomes = load_outcomes(conn)
    mastery = model.mastery(outcomes)
    prompts = model.prompt_stats(outcomes)
    _write(conn, UPSERT_MASTERY, [(m.concept, m.alpha, m.beta, m.n, m.learner_id) for m in mastery])
    _write(conn, UPSERT_PROMPT, [(p.challenge_id, p.prompt_id, p.attempts, p.successes, p.median_tries) for p in prompts])
    return {**report, "outcomes": len(outcomes), "mastery": len(mastery), "prompts": len(prompts)}


def handler(_event: Any, _context: Any) -> dict[str, int]:
    """EventBridge Scheduler entry. A failure raises, so the invocation counts as a Lambda error (alarmed)."""
    with db.connect(DSQL_USER) as conn:
        report = run(conn)
    print(json.dumps(report))
    return report
