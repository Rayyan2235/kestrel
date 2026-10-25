import type { LabKit, Vec2 } from "./lab.js";
export type RescueBeacon = "A" | "B" | "C" | "D" | "E" | "F" | "H";
export type RescueRoute = RescueBeacon[];
const node = (x: number, y: number) => ({
  at: [x, y] as Vec2,
  color: "#246d85",
});
/** Four directed paths, matching the learner's branching network reference. */
export const RESCUE = {
  start: [-1.2, 0] as Vec2,
  dock: [1.2, 0.95] as Vec2,
  beacons: {
    A: node(-1.2, 0),
    B: node(-0.9, 0.95),
    C: node(-0.9, -1.2),
    D: node(0.4, -0.6),
    E: node(0.45, 0.95),
    F: node(0.8, -1.2),
    H: node(1.2, 0.95),
  },
  barriers: [
    { center: [-0.05, 0.6] as Vec2, size: [0.16, 0.14] as Vec2 },
    { center: [-0.7, -0.45] as Vec2, size: [0.1, 0.22] as Vec2 },
  ],
  clearance: 0.15,
  // Actual trunk travel, with gait/turning allowance for the shortest path.
  batteryMeters: 4.2,
};
export const RESCUE_EDGES: [RescueBeacon, RescueBeacon][] = [
  ["A", "B"],
  ["A", "C"],
  ["B", "E"],
  ["B", "D"],
  ["C", "D"],
  ["C", "F"],
  ["F", "D"],
  ["D", "E"],
  ["E", "H"],
];
export function isRescueRoute(route: readonly string[]): route is RescueRoute {
  return (
    route.length >= 2 &&
    route.length <= 7 &&
    route[0] === "A" &&
    route.at(-1) === "H" &&
    new Set(route).size === route.length &&
    route
      .slice(1)
      .every((id, i) =>
        RESCUE_EDGES.some(([a, b]) => a === route[i] && b === id),
      )
  );
}
export function rescuePoints(route: RescueRoute): Vec2[] {
  if (!isRescueRoute(route)) return [];
  return route.map((id) => [...RESCUE.beacons[id].at]);
}
export function routeLengthCm(points: Vec2[]): number {
  return points
    .slice(1)
    .reduce(
      (sum, p, i) =>
        sum + Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]) * 100,
      0,
    );
}
export function routeIsClear(points: Vec2[]): boolean {
  return RESCUE.barriers.every(({ center, size }) =>
    points.slice(1).every((b, i) => {
      const a = points[i]!;
      let lo = 0,
        hi = 1;
      for (const axis of [0, 1] as const) {
        const half = size[axis] / 2 + RESCUE.clearance,
          start = a[axis] - center[axis],
          d = b[axis] - a[axis];
        if (Math.abs(d) < 1e-9) {
          if (Math.abs(start) > half) return true;
        } else {
          const t0 = (-half - start) / d,
            t1 = (half - start) / d;
          lo = Math.max(lo, Math.min(t0, t1));
          hi = Math.min(hi, Math.max(t0, t1));
        }
      }
      return lo > hi;
    }),
  );
}
/** Require explicit connected letters; never fill in a missing junction. */
export function parseRescueDirection(text: string): RescueRoute | null {
  const t = text
    .toUpperCase()
    .replace(/[’‘]/g, "'")
    .replace(/\bSTOP (AT|BY)\b/g, "VISIT");
  if (
    /\b(NOT|DON'T|DONT|AVOID|NEVER|WITHOUT|STOP|INSTEAD|EITHER|OR|BEFORE|AFTER|REVERSE)\b/.test(
      t,
    )
  )
    return null;
  const route: string[] = t.match(/\b[A-Z]\b/g) ?? [];
  // Rescue commands can only start at A (also checked against live pose by TaskRunner).
  // Omit that known origin, but never infer any intermediate junction.
  if (route.length && route[0] !== "A") route.unshift("A");
  if (route.at(-1) !== "H" && /\b(CHARGER|DESTINATION)\b/.test(t))
    route.push("H");
  return isRescueRoute(route) ? route : null;
}
export function rescueKit(): LabKit {
  return {
    id: "rescue",
    subject: "Maths",
    topic: "Robot rescue",
    focus: [0, 0],
    spawns: { pip: [...RESCUE.start, 0], nova: [1.15, 1.35, Math.PI] },
    props: RESCUE.barriers.map((b, i) => ({
      id: `rescue-barrier-${i}`,
      label: "Supply island",
      role: "furniture",
      shape: { type: "box", size: [...b.size, 0.24] },
      joint: "fixed",
      pos: [...b.center, 0.12],
      yaw: 0,
      mass: 0,
      color: ["#d98b65", "#e5b37d"][i]!,
    })),
    slots: [],
  };
}
