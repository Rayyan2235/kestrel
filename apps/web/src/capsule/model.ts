import type { Addressee, LedgerEvent } from "@kestrel/contracts";

export type CapsulePhase = {
  name: "depart" | "travel" | "arrive" | "exit";
  startMs: number;
  endMs: number;
};

export type CapsulePlan = {
  eventId: string;
  from: Addressee;
  to: Addressee;
  kind: "handoff" | "handback";
  /** Reduced motion: a still glyph, no travel. */
  glyphOnly: boolean;
  phases: CapsulePhase[];
  durationMs: number;
};

const FULL = {
  handoff: [
    ["depart", 150],
    ["travel", 600],
    ["arrive", 150],
  ],
  handback: [
    ["depart", 150],
    ["travel", 450],
    ["arrive", 100],
    ["exit", 200],
  ],
} as const;

/** Reduced motion: no travel; the glyph holds still, then a handback leaves. */
const STILL = {
  handoff: [["arrive", 600]],
  handback: [
    ["arrive", 600],
    ["exit", 300],
  ],
} as const;

/** Null for events that carry no capsule. Timing is pure data so tests can drive a fake clock. */
export const planCapsule = (
  event: LedgerEvent,
  opts: { reducedMotion: boolean },
): CapsulePlan | null => {
  if (event.kind !== "handoff" && event.kind !== "handback") return null;
  const steps = (opts.reducedMotion ? STILL : FULL)[event.kind];
  let t = 0;
  const phases: CapsulePhase[] = steps.map(([name, ms]) => {
    const phase = { name, startMs: t, endMs: t + ms };
    t += ms;
    return phase;
  });
  return {
    eventId: event.id,
    from: event.from,
    to: event.to,
    kind: event.kind,
    glyphOnly: opts.reducedMotion,
    phases,
    durationMs: t,
  };
};
