-- Written by the nightly analytics job: how hard each prompt is across learners.
CREATE TABLE IF NOT EXISTS prompt_stats (
  challenge_id text NOT NULL,
  prompt_id text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  successes integer NOT NULL DEFAULT 0,
  median_tries double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (challenge_id, prompt_id)
);
