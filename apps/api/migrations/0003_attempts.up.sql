-- One measured try at an objective. status stays 'unverified' until server-side
-- verification exists. learner_id has no foreign key yet: today's write path
-- (POST /api/progress) does not register learners; P1 adds that and the key.
-- No secondary index: DSQL spells it CREATE INDEX ASYNC, which Postgres rejects (ADR-002).
CREATE TABLE IF NOT EXISTS attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL,
  objective text NOT NULL,
  status text NOT NULL DEFAULT 'unverified' CHECK (status IN ('pending', 'verified', 'rejected', 'unverified')),
  lock_id uuid REFERENCES prediction_locks (id),
  trial_started_at timestamptz,
  at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  tilt_deg double precision,
  left_cm double precision,
  right_cm double precision
);
