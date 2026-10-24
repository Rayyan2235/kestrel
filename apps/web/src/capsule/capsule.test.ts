import { describe, expect, it } from "vitest";
import { planCapsule } from "./model.js";
import { ev } from "../testing/fixtures.js";

const handoff = ev(1, "pip", "nova", { kind: "handoff" });
const handback = ev(3, "nova", "you", { kind: "handback" });

describe("L7 gate: capsule plan is pure, timed data", () => {
  it("a handoff plans a capsule from speaker to listener", () => {
    const p = planCapsule(handoff, { reducedMotion: false })!;
    expect(p).toMatchObject({
      eventId: handoff.id,
      from: "pip",
      to: "nova",
      kind: "handoff",
      glyphOnly: false,
    });
  });

  it("a handback plans a capsule that exits toward the learner", () => {
    const p = planCapsule(handback, { reducedMotion: false })!;
    expect(p).toMatchObject({ kind: "handback", from: "nova", to: "you" });
    expect(p.phases.some((ph) => ph.name === "exit")).toBe(true);
  });

  it("phases are contiguous, start at 0 and sum to durationMs", () => {
    const p = planCapsule(handoff, { reducedMotion: false })!;
    expect(p.phases[0]!.startMs).toBe(0);
    p.phases.forEach((ph, i) => {
      expect(ph.endMs).toBeGreaterThan(ph.startMs);
      if (i > 0) expect(ph.startMs).toBe(p.phases[i - 1]!.endMs);
    });
    expect(p.phases.at(-1)!.endMs).toBe(p.durationMs);
  });

  it("is deterministic so a fake clock can drive it", () => {
    expect(planCapsule(handoff, { reducedMotion: false })).toEqual(
      planCapsule(handoff, { reducedMotion: false }),
    );
  });

  it("reduced motion yields a still glyph with no travel phase", () => {
    const p = planCapsule(handoff, { reducedMotion: true })!;
    expect(p.glyphOnly).toBe(true);
    expect(p.phases.some((ph) => ph.name === "travel")).toBe(false);
  });

  it("full motion has a real travel phase", () => {
    const p = planCapsule(handoff, { reducedMotion: false })!;
    const t = p.phases.find((ph) => ph.name === "travel")!;
    expect(t.endMs - t.startMs).toBeGreaterThan(0);
  });

  it("plain says, learner turns and notices carry no capsule", () => {
    for (const e of [
      ev(0, "pip", "you", { kind: "say" }),
      ev(0, "you", "pip", { kind: "learner" }),
      ev(0, "pip", "you", { kind: "notice" }),
    ])
      expect(planCapsule(e, { reducedMotion: false })).toBeNull();
  });
});
