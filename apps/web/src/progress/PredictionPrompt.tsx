import type { PredictionChoice } from "@kestrel/contracts";
import styles from "./Hud.module.css";

const CHOICES: { choice: PredictionChoice; label: string }[] = [
  { choice: "left-down", label: "Left side down" },
  { choice: "balanced", label: "Balanced" },
  { choice: "right-down", label: "Right side down" },
];

/** Shown while a move is held: lock a prediction, or skip. Nothing has moved yet. */
export function PredictionPrompt({
  onChoose,
  onSkip,
}: {
  onChoose: (choice: PredictionChoice) => void;
  onSkip: () => void;
}) {
  return (
    <section
      className={styles.prompt}
      data-testid="prediction-prompt"
      aria-label="Prediction"
    >
      <p>What will the beam do when it moves?</p>
      <div className={styles.choices}>
        {CHOICES.map(({ choice, label }) => (
          <button
            key={choice}
            data-testid={`predict-${choice}`}
            onClick={() => onChoose(choice)}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        className={styles.link}
        data-testid="predict-skip"
        onClick={onSkip}
      >
        Skip, just move it
      </button>
    </section>
  );
}
