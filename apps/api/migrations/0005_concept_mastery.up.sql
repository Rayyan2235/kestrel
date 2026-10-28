-- Written by the nightly analytics job: a Beta(alpha, beta) estimate per learner and concept.
CREATE TABLE IF NOT EXISTS concept_mastery (
  learner_id uuid NOT NULL REFERENCES learners (id),
  concept text NOT NULL,
  alpha double precision NOT NULL DEFAULT 1,
  beta double precision NOT NULL DEFAULT 1,
  n integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (learner_id, concept)
);
