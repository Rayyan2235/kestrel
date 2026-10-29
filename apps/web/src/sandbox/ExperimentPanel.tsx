import { useEffect, useRef, useState } from "react";
import { MOMENTS, MOMENTS_PROMPTS, promptFor, type Prediction } from "@kestrel/contracts";
import type { SimStatus } from "../simulation/duckSim";
import styles from "./Sandbox.module.css";
import { Button } from "./gic";

type Side = "left" | "level" | "right";
const SIDE_TEXT: Record<Side, string> = { left: "Left side down", level: "Stays level", right: "Right side down" };

/**
 * The learner sets where each robot should put its weight, predicts what the
 * plank will do, and runs the experiment. The result compares the prediction
 * with the moments computed from the measured positions and the measured tilt.
 */
export function ExperimentPanel({
  status,
  run,
  onPromptRun,
  onPromptResult,
}: {
  status: SimStatus;
  run: (left: number, right: number) => string | null;
  /** A run of one of the XP prompts' setups, with a prediction locked in. */
  onPromptRun?: (promptId: string, value: Prediction) => void;
  /** That run's measured result. */
  onPromptResult?: (promptId: string, value: Prediction, measured: Prediction) => void;
}) {
  const rails = status.balance?.rails;
  const now = (side: "left" | "right") => {
    const w = MOMENTS.weights.find((x) => x.side === side)!;
    return Math.round(Math.abs(rails?.get(w.id) ?? w.cm / 100) * 100);
  };
  const [target, setTarget] = useState({ left: now("left"), right: now("right") });
  const [prediction, setPrediction] = useState<Side | null>(null);
  const [asked, setAsked] = useState<Side | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const exp = status.experiment;
  const running = !!exp && exp.phase !== "DONE";
  const step = (side: "left" | "right", d: number) =>
    setTarget((t) => ({ ...t, [side]: Math.min(MOMENTS.maxCm, Math.max(MOMENTS.minCm, t[side] + d)) }));
  const result = exp?.result;
  // The XP prompt this run answers, and the result that was showing when it started.
  const pending = useRef<{ id: string; value: Prediction; before: unknown } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (!p || running || !result || result === p.before) return;
    pending.current = null;
    onPromptResult?.(p.id, p.value, result.measured.lowSide);
  }, [running, result, onPromptResult]);

  return (
    <div className={styles.experiment} data-testid="experiment">
      <div className={styles.targets}>
        {(["left", "right"] as const).map((side) => {
          const w = MOMENTS.weights.find((x) => x.side === side)!;
          return (
            <div key={side} className={styles.target}>
              <span>
                {w.grams} g · {w.owner === "pip" ? "Pip" : "Nova"}
              </span>
              <div className={`gic-field ${styles.stepper}`}>
                <button aria-label={`Move the ${w.grams} g weight in`} onClick={() => step(side, -1)} disabled={running}>
                  −
                </button>
                <output aria-label={`${w.grams} g target`}>{target[side]} cm</output>
                <button aria-label={`Move the ${w.grams} g weight out`} onClick={() => step(side, 1)} disabled={running}>
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.predict} role="radiogroup" aria-label="Your prediction">
        {(["left", "level", "right"] as const).map((s) => (
          <button key={s} role="radio" aria-checked={prediction === s} className="gic-tag" onClick={() => setPrediction(s)} disabled={running}>
            {SIDE_TEXT[s]}
          </button>
        ))}
      </div>
      <Button
        variant="solid"
        className={styles.runButton}
        disabled={running}
        onClick={() => {
          setAsked(prediction);
          const refused = run(target.left, target.right);
          setRefusal(refused);
          const prompt = promptFor(target.left, target.right);
          if (!refused && prompt && prediction) {
            pending.current = { id: prompt.id, value: prediction, before: result };
            onPromptRun?.(prompt.id, prediction);
          }
        }}
      >
        {running ? `Running · ${exp!.phase}` : "Run it with both robots"}
      </Button>
      {refusal && <p className={styles.refusal}>{refusal}</p>}
      {!running && result && (
        <div className={styles.result} data-testid="experiment-result">
          <p>
            Measured positions: {result.left.grams} g at {result.left.cm} cm ({result.left.moment} N·cm), {result.right.grams} g at {result.right.cm} cm ({result.right.moment} N·cm).
          </p>
          <p>
            <strong>Moments say:</strong> {SIDE_TEXT[result.predicted]} (about {Math.abs(result.predictedTiltDeg)}°). <strong>Measured:</strong>{" "}
            {result.measured.lowSide === "level" ? `level (${result.measured.tiltDeg}°)` : `${result.measured.lowSide} side down ${result.measured.tiltDeg}°`}.
          </p>
          {asked && (
            <p className={asked === result.measured.lowSide ? styles.right : styles.wrong}>
              You predicted “{SIDE_TEXT[asked]}”: {asked === result.measured.lowSide ? "you were right." : "not this time. Compare the two moments."}
            </p>
          )}
          {!result.ok && <p className={styles.refusal}>{result.summary}</p>}
        </div>
      )}
      {!running && !result && <p className={styles.hint}>Moment = mass × distance from the pivot. Predict, then run it.</p>}
      <p className={styles.hint} data-testid="xp-prompts">
        XP setups (200 g / 100 g): {MOMENTS_PROMPTS.map((p) => `${p.left} / ${p.right} cm`).join(", ")}. Predict first.
      </p>
    </div>
  );
}
