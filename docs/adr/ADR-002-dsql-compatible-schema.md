# ADR-002: A DSQL-compatible schema

- Status: accepted, 2026-10-28
- Context: [ADR-001](ADR-001-serverless-free-tier.md)

## Context

Production will most likely run on Aurora DSQL, a serverless, PostgreSQL-compatible database. Local development and CI run plain PostgreSQL 16. DSQL supports only part of PostgreSQL, so the schema and the runner must work on both.

## Decision

Migrations are numbered SQL files in `apps/api/migrations`, `NNNN_name.up.sql` with a matching `.down.sql`, run by `apps/api/src/db/migrations.ts` (`pnpm db:migrate`). Rules:

- **One DDL statement per migration, in its own transaction, never mixed with DML.** DSQL refuses mixed transactions. So the runner commits the DDL first and records the version in `schema_migrations` in a second transaction.
- **Every statement is safe to repeat** (`IF NOT EXISTS`, `IF EXISTS`). If the process dies between the DDL and the bookkeeping, the next run repeats a harmless no-op.
- **uuid primary keys** (`gen_random_uuid()`), or natural composite keys for the analytics tables. No SERIAL columns and no sequences, so ids never need one central counter.
- **Unique keys are declared inline in `CREATE TABLE`**, never with a separate `CREATE INDEX`. DSQL builds secondary indexes with `CREATE INDEX ASYNC`, which PostgreSQL rejects. A secondary index needed later gets a DSQL-specific step.
- **Foreign keys are allowed** (rev 4) and used where today's code writes in a valid order. `attempts.learner_id` has none yet, because `POST /api/progress` does not register learners. P1 adds that write and the key.
- **Writes retry on SQLSTATE 40001.** DSQL commits optimistically: when two transactions conflict, one fails with 40001 and is safe to run again.
- **Idempotent awards do not rely on `ON CONFLICT` alone.** `xp_events` has the unique key `(learner_id, rule_id, challenge_id, prompt_id)`. The award insert (P1) must use `ON CONFLICT DO NOTHING` and also treat SQLSTATE 23505 (unique violation) as "already awarded", since `ON CONFLICT` is not confirmed on DSQL.
- **`down` drops tables and their data**, so the CLI needs `--yes`.

## Consequences

- The same files run on Postgres in CI and in `docker compose`, and should run on DSQL. They have not run on DSQL yet; the first DSQL deploy must check them.
- With no secondary index on `attempts`, reads by learner are a scan. That is fine at today's size; revisit with `CREATE INDEX ASYNC` on DSQL.
- The legacy Tiger Data `attempts` hypertable (no `id` or `status`) is never migrated. The API keeps reading it through `TIGER_DATABASE_URL` until its rows are copied into a migrated database (`DATABASE_URL`). Copy the old columns only; new rows default to `status = 'unverified'`.
