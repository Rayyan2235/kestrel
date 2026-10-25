import { BOT_NAMES, type BotId, type World } from "@kestrel/contracts";
import { Lock, LockOpen } from "lucide-react";
import { physics } from "../microduck/instance";
import { useBalance } from "../microduck/status";
import { follow } from "../world/anchors";
import { formatInt, formatNm, turning, verdictText } from "./measure";
import styles from "../App.module.css";

export type Bubble = { text: string; speaker: BotId; recipient: BotId | "you"; key: number };

export function WorldLabels({
  world,
  selected,
  activeBot,
  phaseLabel,
  bubbles,
  openSide,
  onSelect,
  onOpenWeight,
  weightButtons,
}: {
  world: World;
  selected: BotId;
  activeBot: BotId | null;
  phaseLabel: string | null;
  bubbles: Partial<Record<BotId, Bubble>>;
  openSide: "left" | "right" | null;
  onSelect: (id: BotId) => void;
  onOpenWeight: (side: "left" | "right") => void;
  weightButtons: React.MutableRefObject<Record<"left" | "right", HTMLButtonElement | null>>;
}) {
  const balance = useBalance();
  // With the physics running, the tags show the carriages' measured positions.
  const shown = balance.available ? { ...world, leftCm: Math.round(balance.leftCm * 2) / 2, rightCm: Math.round(balance.rightCm * 2) / 2 } : world;
  const t = turning(shown);
  const released = balance.available && !balance.locked;
  const tilt = (balance.angle * 180) / Math.PI;
  const measured = Math.abs(tilt) < 0.6 ? "The beam stayed level" : tilt > 0 ? "The right side went down" : "The left side went down";
  return (
    <div className={styles.overlay}>
      {(["pip", "nova"] as const).map((id) => (
        <button
          key={id}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          ref={follow(id, "translate(-50%, 12px)")}
          className={styles.botTag}
          data-bot={id}
          data-selected={selected === id}
          onClick={() => onSelect(id)}
        >
          <span className={styles.dot} />
          {BOT_NAMES[id]}
          {activeBot === id && phaseLabel ? <span className={styles.botPhase}>{phaseLabel}</span> : null}
        </button>
      ))}
      {(["pip", "nova"] as const).map((id) => {
        const bubble = bubbles[id];
        if (!bubble) return null;
        return (
          <div
            key={`${id}-${bubble.key}`}
            ref={follow(`${id}-head`)}
            data-clamp={id === "pip" ? "left" : "right"}
            className={styles.bubble}
            data-bot={id}
          >
            {bubble.recipient !== "you" ? (
              <span className={styles.bubbleTo}>
                {BOT_NAMES[bubble.speaker]} → {BOT_NAMES[bubble.recipient]}
              </span>
            ) : null}
            <span>{bubble.text}</span>
          </div>
        );
      })}
      {(["left", "right"] as const).map((side) => {
        const grams = side === "left" ? shown.leftGrams : shown.rightGrams;
        const cm = side === "left" ? shown.leftCm : shown.rightCm;
        const product = side === "left" ? t.left : t.right;
        const nm = side === "left" ? t.leftNm : t.rightNm;
        const Side = side === "left" ? "Left" : "Right";
        return (
          <button
            key={side}
            type="button"
            ref={(el) => {
              weightButtons.current[side] = el;
              return follow(
                `${side}-weight`,
                side === "left" ? "translate(calc(-100% + 30px), calc(-100% - 4px))" : "translate(-30px, calc(-100% - 4px))",
              )(el);
            }}
            className={styles.weightTag}
            data-side={side}
            aria-expanded={openSide === side}
            aria-label={`${Side} weight, ${grams} g at ${cm} cm from the pivot, ${formatInt(product)} gram centimetres. Change position`}
            onClick={() => onOpenWeight(side)}
          >
            <span className={styles.weightMain}>
              <span className="num">{grams}</span> g at <strong className="num">{cm}</strong> cm
            </span>
            <span className={styles.weightSub}>
              <span className="num">{formatInt(product)}</span> g·cm
              <span className={styles.weightNm}>
                {" "}
                · <span className="num">{formatNm(nm)}</span> N·m
              </span>
            </span>
          </button>
        );
      })}
      <div ref={follow("pivot", "translate(-50%, 0)")} className={styles.pivotControls}>
        <div className={styles.verdict} data-state={released ? "measured" : t.state} data-hidden={Boolean(activeBot) && !released} role="status">
          {released ? `${measured} (${Math.abs(tilt).toFixed(1)}°)` : verdictText(t.state)}
        </div>
        {balance.available ? (
          <button
            type="button"
            className={styles.lockButton}
            aria-pressed={released}
            disabled={Boolean(activeBot) && !released}
            title={activeBot && !released ? "Wait for the push to finish" : undefined}
            onClick={() => (released ? physics.world?.balance.lock() : physics.world?.balance.release())}
          >
            {released ? <Lock size={15} aria-hidden="true" /> : <LockOpen size={15} aria-hidden="true" />}
            {released ? "Lock beam" : "Release beam"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
