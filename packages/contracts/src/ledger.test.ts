import { describe, expect, it } from "vitest";
import {
  LedgerEventSchema,
  RespondSchema,
  applyWeight,
  bumpVersion,
  createWorld,
  eventId,
  resetWorld,
} from "./index.js";

const event = {
  id: eventId(0, 0),
  seq: 0,
  rootTurnId: "t0",
  causedBy: null,
  epoch: 0,
  worldVersion: 0,
  source: "mock",
  kind: "say",
  hop: 0,
  from: "pip",
  to: "you",
  text: "Hello",
};

describe("ledger event", () => {
  it("accepts a fully addressed event", () => {
    expect(LedgerEventSchema.safeParse(event).success).toBe(true);
  });
  it("rejects a missing or unknown addressee", () => {
    const { to: _to, ...noTo } = event;
    expect(LedgerEventSchema.safeParse(noTo).success).toBe(false);
    expect(LedgerEventSchema.safeParse({ ...event, to: "all" }).success).toBe(
      false,
    );
  });
  it("rejects a second hop, a self-addressed event and unlabeled sources", () => {
    expect(LedgerEventSchema.safeParse({ ...event, hop: 2 }).success).toBe(
      false,
    );
    expect(LedgerEventSchema.safeParse({ ...event, to: "pip" }).success).toBe(
      false,
    );
    expect(
      LedgerEventSchema.safeParse({ ...event, source: "ai" }).success,
    ).toBe(false);
    // `live` is a real label now: only a real model call may carry it.
    expect(
      LedgerEventSchema.safeParse({ ...event, source: "live" }).success,
    ).toBe(true);
  });
  it("derives stable ids from epoch and seq only", () => {
    expect(eventId(2, 5)).toBe(eventId(2, 5));
    expect(eventId(2, 5)).not.toBe(eventId(3, 5));
  });
});

describe("respond tool", () => {
  const ok = { say: "Try 40 cm", action: null, ask_peer: null };
  it("requires every field; optional ones are nullable, not omitted", () => {
    expect(RespondSchema.safeParse(ok).success).toBe(true);
    expect(RespondSchema.safeParse({ say: "x" }).success).toBe(false);
    expect(RespondSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
  it("bounds action and names a bot peer", () => {
    expect(
      RespondSchema.safeParse({ ...ok, action: { side: "left", cm: 50 } })
        .success,
    ).toBe(false);
    expect(
      RespondSchema.safeParse({
        ...ok,
        ask_peer: { to: "nova", question: "q", evidence: "e" },
      }).success,
    ).toBe(true);
    expect(
      RespondSchema.safeParse({
        ...ok,
        ask_peer: { to: "you", question: "q", evidence: "e" },
      }).success,
    ).toBe(false);
  });
});

describe("world version", () => {
  it("bumps on every mutation", () => {
    const w = createWorld();
    expect(applyWeight(w, "left", 10, 0).version).toBe(1);
    expect(bumpVersion(w).version).toBe(1);
    expect(resetWorld({ ...w, version: 4 }).version).toBe(5);
  });
  it("rejects a late apply captured before another mutation", () => {
    const w = createWorld();
    const next = applyWeight(w, "left", 10, 0);
    expect(() => applyWeight(next, "right", 30, 0)).toThrow("stale");
  });
});
