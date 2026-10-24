import { useId, useRef, useState } from "react";
import styles from "./WeightControl.module.css";

export function WeightControl({
  side,
  value,
  grams,
  disabled,
  onCommit,
}: {
  side: "left" | "right";
  value: number;
  grams: number;
  disabled: boolean;
  onCommit: (cm: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const dirty = useRef<string | null>(null);
  const [error, setError] = useState("");
  const title = side === "left" ? "Left" : "Right";
  function edit(next: string) {
    dirty.current = next;
    setDraft(next);
    setError("");
  }
  function cancel() {
    dirty.current = null;
    setDraft(null);
    setError("");
  }
  function commit() {
    if (dirty.current === null || disabled) return;
    const cm = Number(dirty.current);
    if (!dirty.current.trim() || !Number.isFinite(cm) || cm < 5 || cm > 45) {
      setError("Choose a distance from 5 to 45 cm.");
      return;
    }
    cancel();
    if (cm !== value) onCommit(cm);
  }
  const rangeValue =
    draft !== null && Number.isFinite(Number(draft))
      ? Math.max(5, Math.min(45, Number(draft)))
      : value;
  return (
    <div className={styles.control} data-side={side}>
      <div className={styles.heading}>
        <label htmlFor={id}>
          <span className={styles.weight} aria-hidden="true" />
          {title} <span>{grams} g</span>
        </label>
        <div className={styles.number}>
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={5}
            max={45}
            step="any"
            aria-label={`${title} distance in centimeters`}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : `${id}-help`}
            value={draft ?? value}
            disabled={disabled}
            onChange={(event) => edit(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") cancel();
            }}
          />
          <span aria-hidden="true">cm</span>
        </div>
      </div>
      <input
        className={styles.range}
        type="range"
        min={5}
        max={45}
        step={5}
        aria-label={`${side} distance from pivot`}
        aria-valuetext={`${rangeValue} centimeters from the pivot`}
        value={rangeValue}
        disabled={disabled}
        onChange={(event) => edit(event.target.value)}
        onPointerUp={commit}
        onPointerCancel={cancel}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
        onKeyUp={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          )
            commit();
        }}
      />
      <div className={styles.bounds} id={`${id}-help`}>
        <span>5 cm</span>
        <span>from pivot</span>
        <span>45 cm</span>
      </div>
      {error && (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
