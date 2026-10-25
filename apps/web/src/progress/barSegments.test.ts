import { describe, expect, it } from "vitest";
import { barSegments } from "./barSegments.js";
import { need } from "./levels.js";

describe("G4 gate: barSegments", () => {
  it("an award that crosses a threshold ranks up: old segment 0, positive carry", () => {
    const s = barSegments(95, 120);
    expect(s.rankedUp).toBe(true);
    expect(s.oldWidth).toBe(0);
    expect(s.leftXp).toBe(120 - need(2));
    expect(s.leftXp).toBeGreaterThan(0);
  });

  it("inside one level: both segments positive, no rank up", () => {
    const s = barSegments(110, 140);
    expect(s.rankedUp).toBe(false);
    expect(s.oldWidth).toBeGreaterThan(0);
    expect(s.newWidth).toBeGreaterThan(0);
  });

  it("never negative or non-finite for any input", () => {
    for (let a = 0; a < 800; a += 17) {
      for (let b = a; b < a + 300; b += 23) {
        const s = barSegments(a, b);
        expect(s.oldWidth).toBeGreaterThanOrEqual(0);
        expect(s.newWidth).toBeGreaterThanOrEqual(0);
        expect(s.leftXp).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(s.oldWidth + s.newWidth + s.leftXp)).toBe(true);
      }
    }
  });

  it("no award: the new segment is empty", () => {
    expect(barSegments(130, 130).newWidth).toBe(0);
  });
});
