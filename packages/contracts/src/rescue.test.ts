import { describe, expect, it } from "vitest";
import {
  RESCUE,
  RESCUE_EDGES,
  rescuePoints,
  routeLengthCm,
  routeIsClear,
  parseRescueDirection,
  type RescueRoute,
  type RescueBeacon,
} from "./rescue.js";
import { DuckTaskSchema } from "./lab.js";
function paths(
  at: RescueBeacon = "A",
  route: RescueRoute = ["A"],
): RescueRoute[] {
  if (at === "H") return [route];
  return RESCUE_EDGES.filter(([a]) => a === at).flatMap(([, b]) =>
    paths(b, [...route, b]),
  );
}
describe("branching rescue network", () => {
  it("has exactly four distinct A–H paths and only the shortest fits the battery", () => {
    const routes = paths();
    expect(routes).toHaveLength(4);
    const lengths = routes
      .map((r) => routeLengthCm(rescuePoints(r)) / 100)
      .sort((a, b) => a - b);
    expect(new Set(lengths).size).toBe(4);
    expect(lengths[0]).toBeLessThan(RESCUE.batteryMeters - 0.8);
    expect(lengths[1]).toBeGreaterThan(RESCUE.batteryMeters + 0.5);
    for (const r of routes) expect(routeIsClear(rescuePoints(r))).toBe(true);
  });
  it("preserves connected spoken letters without solving or filling missing junctions", () => {
    expect(parseRescueDirection("A, C, D, E, H")).toEqual([
      "A",
      "C",
      "D",
      "E",
      "H",
    ]);
    expect(parseRescueDirection("From start to B then E then charger")).toEqual(
      ["A", "B", "E", "H"],
    );
    expect(parseRescueDirection("stop at A then B then E then H")).toEqual([
      "A",
      "B",
      "E",
      "H",
    ]);
    for (const text of [
      "A H",
      "A C E H",
      "A B D B E H",
      "not A B E H",
      "A B or C E H",
      "A G H",
      "blue orange mint",
    ])
      expect(parseRescueDirection(text)).toBeNull();
  });
  it("accepts directions from Pip's known starting point without requiring A", () => {
    expect(parseRescueDirection("go to B then E then H")).toEqual(["A", "B", "E", "H"]);
    expect(parseRescueDirection("B, E, charger")).toEqual(["A", "B", "E", "H"]);
    expect(parseRescueDirection("C then D then E then H")).toEqual(["A", "C", "D", "E", "H"]);
    for (const text of ["E then H", "B then H", "C then E then H", "H", "don't go to B then E then H"]) expect(parseRescueDirection(text)).toBeNull();
  });
  it("validates graph adjacency at the contract boundary", () => {
    for (const route of paths())
      expect(
        DuckTaskSchema.safeParse({ kind: "rescue_route", route }).success,
      ).toBe(true);
    for (const route of [
      ["A", "H"],
      ["A", "C", "E", "H"],
      ["H", "E", "B", "A"],
      [],
    ]) {
      expect(
        DuckTaskSchema.safeParse({ kind: "rescue_route", route }).success,
      ).toBe(false);
      expect(rescuePoints(route as RescueRoute)).toEqual([]);
    }
  });
});
