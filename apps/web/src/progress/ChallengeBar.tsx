import { useState } from "react";
import { CHALLENGES, challengeById } from "./challenges.js";
import styles from "./Hud.module.css";

const REASONS = [
  "Mass times distance matches on both sides",
  "The heavier side sits closer to the pivot",
  "Both sides pull on the beam equally",
];

/** Start buttons, the goal banner and, after completion, the optional "Why did it balance?". */
export function ChallengeBar({
  active,
  completed,
  explained,
  onStart,
  onExplain,
}: {
  active: string | null;
  completed: boolean;
  explained: boolean;
  onStart: (id: string) => void;
  onExplain: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const challenge = active ? challengeById(active) : undefined;
  return (
    <section className={styles.challenges} aria-label="Challenges">
      <div className={styles.starts}>
        {CHALLENGES.map((c) => (
          <button
            key={c.challengeId}
            data-testid={`start-challenge-${c.challengeId}`}
            aria-pressed={active === c.challengeId}
            onClick={() => {
              setOpen(false);
              setChoice(null);
              setNote("");
              onStart(c.challengeId);
            }}
          >
            Start challenge: {c.title}
          </button>
        ))}
      </div>
      {challenge && (
        <p className={styles.banner} data-testid="challenge-banner">
          <strong>{challenge.title}.</strong> Goal: {challenge.goal}. Predict
          what happens, then move a weight.
        </p>
      )}
      {challenge && completed && !explained && !open && (
        <button data-testid="explain-open" onClick={() => setOpen(true)}>
          Why did it balance?
        </button>
      )}
      {challenge && completed && !explained && open && (
        <form
          className={styles.explain}
          onSubmit={(e) => {
            e.preventDefault();
            // The note is discarded: free text is never stored.
            setNote("");
            setOpen(false);
            onExplain();
          }}
        >
          <fieldset>
            <legend>Why did it balance?</legend>
            {REASONS.map((r) => (
              <label key={r}>
                <input
                  type="radio"
                  name="reason"
                  checked={choice === r}
                  onChange={() => setChoice(r)}
                />{" "}
                {r}
              </label>
            ))}
          </fieldset>
          <label>
            In your own words (optional, not saved)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" disabled={!choice}>
            Submit reason
          </button>
        </form>
      )}
    </section>
  );
}
