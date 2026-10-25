import type { LedgerEvent } from "@kestrel/contracts";
import { planCapsule, type CapsulePlan } from "../capsule/model.js";

/**
 * Presentation pacing. The ledger and coordinator run at model speed; the room
 * shows one bubble at a time, each held long enough to read. Pure and
 * clock-free: the caller feeds it elapsed milliseconds.
 */
export const MIN_HOLD_MS = 1800;
export const MAX_HOLD_MS = 7000;
export const MS_PER_CHAR = 60;
export const FADE_MS = 250;
/** Gap between bubbles. It overlaps the fade, so the next bubble starts when the fade ends. */
export const GAP_MS = 250;

export const readingMs = (text: string): number =>
  Math.min(MAX_HOLD_MS, Math.max(MIN_HOLD_MS, text.length * MS_PER_CHAR));

export type Beat = {
  event: LedgerEvent;
  /** Time the bubble stays fully shown. Never shorter than its capsule flight. */
  holdMs: number;
  capsule: CapsulePlan | null;
};

export type Phase = "idle" | "show" | "fade";
export type CapsuleState = "idle" | "flying" | "landed";

export type Snapshot = {
  phase: Phase;
  beat: Beat | null;
  capsuleState: CapsuleState;
  queued: number;
  /** Bot-to-bot pills dropped from the room since the queue last drained; the rail still has them. */
  collapsed: number;
  /** Changes whenever anything a view renders changes. */
  key: string;
};

export const makeBeat = (event: LedgerEvent, reducedMotion: boolean): Beat => {
  const capsule = planCapsule(event, { reducedMotion });
  return {
    event,
    capsule,
    holdMs: Math.max(readingMs(event.text), capsule?.durationMs ?? 0),
  };
};

export function createDirector() {
  let queue: Beat[] = [];
  let beat: Beat | null = null;
  let phase: Phase = "idle";
  let t = 0;
  let collapsed = 0;

  // The gap overlaps the fade, so the room never holds two bubbles and never idles longer than FADE_MS.
  const length = (): number =>
    phase === "show"
      ? beat!.holdMs
      : phase === "fade"
        ? Math.max(FADE_MS, GAP_MS)
        : 0;

  const startNext = (carry: number) => {
    const next = queue.shift();
    beat = next ?? null;
    phase = next ? "show" : "idle";
    t = next ? carry : 0;
  };

  return {
    enqueue(b: Beat) {
      queue.push(b);
      if (phase === "idle") startNext(0);
    },
    /** Moves time forward; several phase changes may happen in one call. */
    advance(dtMs: number) {
      if (phase === "idle" || dtMs <= 0) return;
      t += dtMs;
      while ((phase as Phase) !== "idle" && t >= length()) {
        t -= length();
        if (phase === "show") phase = "fade";
        else startNext(t);
      }
    },
    /**
     * A new learner turn: older bot-to-bot pills collapse to the rail ("+N").
     * Bubbles to the learner and handbacks are never dropped.
     */
    dropPills() {
      const kept = queue.filter((b) => b.event.to === "you");
      collapsed += queue.length - kept.length;
      queue = kept;
    },
    /** Stop or Reset: drop everything waiting and fade the current bubble now. */
    interrupt() {
      queue = [];
      if (phase === "show") {
        phase = "fade";
        t = 0;
      }
    },
    clear() {
      collapsed = 0;
      queue = [];
      beat = null;
      phase = "idle";
      t = 0;
    },
    snapshot(): Snapshot {
      const capsuleState: CapsuleState =
        !beat?.capsule || (phase !== "show" && phase !== "fade")
          ? "idle"
          : phase === "show" && t < beat.capsule.durationMs
            ? "flying"
            : "landed";
      return {
        phase,
        beat,
        capsuleState,
        queued: queue.length,
        collapsed: phase === "idle" && queue.length === 0 ? 0 : collapsed,
        key: `${beat?.event.id ?? "-"}|${phase}|${capsuleState}|${queue.length}|${collapsed}`,
      };
    },
  };
}
