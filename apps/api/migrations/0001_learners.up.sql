-- A learner is a random pseudonymous UUID made in the browser. No name, email or account.
CREATE TABLE IF NOT EXISTS learners (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
