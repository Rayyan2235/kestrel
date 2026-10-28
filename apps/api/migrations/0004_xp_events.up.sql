-- Append-only XP ledger. The inline unique key makes an award idempotent: a
-- repeated event is refused (ON CONFLICT DO NOTHING, or SQLSTATE 23505 read as
-- "already awarded"). prompt_id is '' when a rule has no prompt, because NULLs
-- never collide in a unique key.
CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners (id),
  rule_id text NOT NULL,
  challenge_id text NOT NULL,
  prompt_id text NOT NULL DEFAULT '',
  xp integer NOT NULL CHECK (xp > 0),
  attempt_id uuid REFERENCES attempts (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT xp_events_once UNIQUE (learner_id, rule_id, challenge_id, prompt_id)
);
