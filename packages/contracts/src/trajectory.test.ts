import { expect, it } from "vitest";
import { logPose, RescueRouteSchema, TRAJECTORY_HZ, TRAJECTORY_MAX_SAMPLES, TrajectorySchema } from "./trajectory.js";

const series = (n: number) => Array.from({ length: n }, (_, i) => logPose(i * 0.1, 0, 0));

it("accepts a log whose series all have the same length, at the agreed rate", () => {
  const log = { hz: TRAJECTORY_HZ, bots: { pip: series(3) }, props: { "square-3": series(3) } };
  expect(TrajectorySchema.parse(log)).toEqual(log);
});

it("refuses mismatched lengths, another rate, unknown robots, extra keys and oversized logs", () => {
  const bad = [
    { hz: TRAJECTORY_HZ, bots: { pip: series(3) }, props: { "square-3": series(4) } },
    { hz: 50, bots: { pip: series(3) }, props: {} },
    { hz: TRAJECTORY_HZ, bots: { kestrel: series(3) }, props: {} },
    { hz: TRAJECTORY_HZ, bots: { pip: series(3) }, props: {}, ok: true },
    { hz: TRAJECTORY_HZ, bots: { pip: series(TRAJECTORY_MAX_SAMPLES + 1) }, props: {} },
    { hz: TRAJECTORY_HZ, bots: {}, props: {} },
  ];
  for (const log of bad) expect(TrajectorySchema.safeParse(log).success).toBe(false);
});

it("rounds logged poses to mm and 0.1°", () => {
  expect(logPose(0.12345, -1.00049, 89.96)).toEqual([0.123, -1, 90]);
});

it("accepts only legal rescue routes", () => {
  expect(RescueRouteSchema.safeParse(["A", "B", "E", "H"]).success).toBe(true);
  expect(RescueRouteSchema.safeParse(["A", "E", "H"]).success).toBe(false);
});
