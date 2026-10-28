-- A learner's prediction, stamped by the server clock before the trial starts.
CREATE TABLE IF NOT EXISTS prediction_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id uuid NOT NULL REFERENCES learners (id),
  challenge_id text NOT NULL,
  prompt_id text NOT NULL,
  value text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);
