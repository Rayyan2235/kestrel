import type { Addressee, LedgerEvent } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

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

/** Null for events that carry no capsule. Timing is pure data so tests can drive a fake clock. */
export const planCapsule = (
  _event: LedgerEvent,
  _opts: { reducedMotion: boolean },
): CapsulePlan | null => notImplemented("planCapsule");
