import { describe, expect, it } from "vitest";
import { clampZoom, panGround, fitZoom } from "./camera";

describe("lab camera", () => {
  it("bounds zoom and adapts framing to narrow viewports", () => {
    expect(clampZoom(10000)).toBe(650);
    expect(clampZoom(0)).toBe(70);
    expect(fitZoom(390, 500, 2)).toBeLessThan(fitZoom(1100, 800, 2));
  });
  it("pans in camera-relative ground directions without leaving the room", () => {
    const right = panGround([0, 0], 100, 0, 200);
    expect(right[0]).toBeLessThan(0);
    expect(right[1]).toBeGreaterThan(0);
    const far = panGround([0, 0], 100000, 100000, 70);
    expect(Math.abs(far[0])).toBeLessThanOrEqual(1.5);
    expect(Math.abs(far[1])).toBeLessThanOrEqual(1.5);
  });
});
