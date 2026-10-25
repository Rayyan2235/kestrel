import { BOT_NAMES, type BotId } from "@kestrel/contracts";
import { Eye } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Bubble } from "./model.js";
import { useCompact } from "./useCompact.js";
import styles from "./BubbleLayer.module.css";

export type Point = { x: number; y: number };
export type Anchors = Record<BotId, Point>;

/** Placeholder identity glyphs: round head for Pip, squared visor for Nova. */
export function BotGlyph({ bot }: { bot: BotId }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      {bot === "pip" ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      ) : (
        <rect
          x="2.5"
          y="3.5"
          width="11"
          height="9"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      )}
    </svg>
  );
}

/** Position is a pure function of the bubble's `to` and the bot anchors. */
export function placeBubble(
  bubble: Bubble,
  anchors: Anchors,
  slot: number,
): { x: number; y: number; tail: "down" | "left" | "right" } {
  const self = anchors[bubble.anchor];
  if (bubble.to === "you") return { x: self.x, y: self.y - 14, tail: "down" };
  const peer = anchors[bubble.to];
  return {
    x: (self.x + peer.x) / 2,
    // Bot-to-bot pills sit in a band above the to-you bubbles, between the two heads.
    y: self.y - 44 + slot * 18,
    tail: peer.x > self.x ? "right" : "left",
  };
}

const seqOf = (b: Bubble) => Number(b.eventId.split("-")[1]);
/**
 * Phones show one in-room bubble: the newest, with a bubble to the learner
 * taking priority. Bot-to-bot text stays in the rail.
 */
const onePerRoom = (bubbles: Bubble[]): Bubble[] => {
  const toYou = bubbles.filter((b) => b.variant === "to-you");
  const pool = toYou.length > 0 ? toYou : bubbles;
  const newest = pool.reduce<Bubble | null>(
    (best, b) => (best && seqOf(best) > seqOf(b) ? best : b),
    null,
  );
  return newest ? [newest] : [];
};
/** At most 80 characters in the room on phones, name included. */
const shorten = (text: string, name: string): string => {
  const room = 80 - name.length - 1;
  return text.length <= room ? text : `${text.slice(0, room - 1)}…`;
};

/** A bubble stays at least this long before the same bot's next one replaces it. */
export const DWELL_MS = 700;

/**
 * View-only: holds each bot's current bubble for DWELL_MS so a short line
 * ("Let me check with Nova.") is readable before the handoff pill replaces it.
 * The ledger and deriveBubbles are untouched.
 */
function useDwell(target: Bubble[], ms: number): Bubble[] {
  const [shown, setShown] = useState<Bubble[]>(target);
  const [tick, setTick] = useState(0);
  const held = useRef(shown);
  const since = useRef(new Map<string, number>());
  useEffect(() => {
    const now = Date.now();
    const timers: number[] = [];
    const next: Bubble[] = [];
    for (const t of target) {
      const cur = held.current.find((s) => s.anchor === t.anchor);
      const age = cur ? now - (since.current.get(cur.eventId) ?? 0) : ms;
      if (!cur || cur.eventId === t.eventId || age >= ms) {
        next.push(t);
        if (!since.current.has(t.eventId)) since.current.set(t.eventId, now);
      } else {
        next.push(cur);
        timers.push(window.setTimeout(() => setTick((n) => n + 1), ms - age));
      }
    }
    const same =
      next.length === held.current.length &&
      next.every((b, i) => b.eventId === held.current[i]!.eventId);
    if (!same) {
      held.current = next;
      setShown(next);
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [target, tick, ms]);
  return shown;
}

export function BubbleLayer({
  bubbles: latest,
  anchors,
  staleBefore = null,
}: {
  bubbles: Bubble[];
  anchors: Anchors;
  /** Bubbles from events with a lower seq were cut off by Stop and read as stopped. */
  staleBefore?: number | null;
}) {
  const compact = useCompact();
  const all = useDwell(latest, DWELL_MS);
  const bubbles = compact ? onePerRoom(all) : all;
  let slot = 0;
  return (
    <div className={styles.layer} data-testid="bubble-layer">
      {bubbles.map((b) => {
        const p = placeBubble(
          b,
          anchors,
          b.variant === "bot-to-bot" ? slot++ : 0,
        );
        return (
          <div
            key={b.eventId}
            className={styles.bubble}
            data-testid="bubble"
            data-bubble-id={b.eventId}
            data-to={b.to}
            data-variant={b.variant}
            data-anchor={b.anchor}
            data-tail={p.tail}
            data-source={b.source}
            data-stale={staleBefore !== null && seqOf(b) < staleBefore}
            role="group"
            aria-label={b.ariaLabel}
            style={{ "--x": `${p.x}%`, "--y": `${p.y}%` } as CSSProperties}
          >
            <div className={styles.meta}>
              <span className={styles.chip} data-testid="bubble-chip">
                {b.to === "you" ? (
                  <Eye size={13} aria-hidden="true" />
                ) : (
                  <BotGlyph bot={b.to} />
                )}
                {b.chip}
              </span>
              <span className={styles.source} data-testid="bubble-source">
                {b.source}
              </span>
              {staleBefore !== null && seqOf(b) < staleBefore && (
                <span className={styles.stopped} data-testid="bubble-stopped">
                  stopped
                </span>
              )}
            </div>
            <p className={styles.text}>
              <strong>{BOT_NAMES[b.anchor]}</strong>{" "}
              {compact ? shorten(b.text, BOT_NAMES[b.anchor]) : b.text}
            </p>
          </div>
        );
      })}
    </div>
  );
}
