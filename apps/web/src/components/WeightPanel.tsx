import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Minus, Plus, X } from "lucide-react";
import { BOT_NAMES, type BotId, type World } from "@kestrel/contracts";
import { follow } from "../world/anchors";
import { formatInt } from "./measure";
import styles from "../App.module.css";

const MIN = 5,
  MAX = 45;

export function WeightPanel({
  side,
  world,
  recipient,
  busyBot,
  anchored,
  onMove,
  onClose,
}: {
  side: "left" | "right";
  world: World;
  recipient: BotId;
  busyBot: BotId | null;
  anchored: boolean;
  onMove: (side: "left" | "right", cm: number) => void;
  onClose: () => void;
}) {
  const current = side === "left" ? world.leftCm : world.rightCm;
  const grams = side === "left" ? world.leftGrams : world.rightGrams;
  const [draft, setDraft] = useState(String(current));
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const errorId = useId();
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [side]);
  useEffect(() => setDraft(String(current)), [current, side]);
  const value = Number(draft);
  const valid = draft.trim() !== "" && Number.isFinite(value) && value >= MIN && value <= MAX;
  const product = valid ? grams * value : null;
  const name = BOT_NAMES[recipient];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busyBot) return;
    onMove(side, Math.round(value * 10) / 10);
  }
  function nudge(by: number) {
    const base = Number.isFinite(value) ? value : current;
    setDraft(String(Math.min(MAX, Math.max(MIN, Math.round(base + by)))));
  }

  return (
    <form
      ref={
        anchored
          ? follow(`${side}-weight`, side === "left" ? "translate(-82%, 44px)" : "translate(-18%, 44px)")
          : undefined
      }
      className={styles.weightPanel}
      data-anchored={anchored}
      role="dialog"
      aria-labelledby={titleId}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {side === "left" ? "Left" : "Right"} weight · <span className="num">{grams}</span> g
        </h2>
        <button type="button" className={styles.iconButton} aria-label="Close weight controls" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <label className={styles.fieldLabel} htmlFor={`${titleId}-cm`}>
        Distance from the pivot
      </label>
      <div className={styles.stepper}>
        <button type="button" className={styles.stepButton} aria-label="1 cm closer to the pivot" onClick={() => nudge(-1)}>
          <Minus size={18} aria-hidden="true" />
        </button>
        <div className={styles.stepValue}>
          <input
            ref={input}
            id={`${titleId}-cm`}
            className={`${styles.cmInput} num`}
            inputMode="decimal"
            value={draft}
            aria-invalid={!valid}
            aria-describedby={errorId}
            onChange={(e) => setDraft(e.target.value)}
          />
          <span aria-hidden="true">cm</span>
        </div>
        <button type="button" className={styles.stepButton} aria-label="1 cm farther from the pivot" onClick={() => nudge(1)}>
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <input
        type="range"
        className={styles.range}
        min={MIN}
        max={MAX}
        step={1}
        value={valid ? value : current}
        aria-label="Distance from the pivot in centimetres"
        onChange={(e) => setDraft(e.target.value)}
      />
      <p id={errorId} className={styles.panelNote} data-error={!valid}>
        {valid
          ? `${grams} g × ${value} cm = ${formatInt(product ?? 0)} g·cm`
          : `Choose ${MIN} to ${MAX} cm.`}
      </p>
      <button type="submit" className={styles.primary} disabled={!valid || Boolean(busyBot)}>
        {busyBot ? `${BOT_NAMES[busyBot]} is busy` : `Ask ${name} to move it`}
      </button>
    </form>
  );
}
