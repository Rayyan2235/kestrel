import { expect, it } from "vitest";
import { VEL_FWD } from "../simulation/constants";
import { aimError, chargeTwist, faceTwist, isClash } from "./fight";

it("aims at the other robot, left positive", () => {
  expect(aimError({ x: 0, y: 0, yaw: 0 }, { x: 1, y: 0, yaw: 0 })).toBeCloseTo(0);
  expect(aimError({ x: 0, y: 0, yaw: 0 }, { x: 0, y: 1, yaw: 0 })).toBeCloseTo(Math.PI / 2);
  expect(aimError({ x: 0, y: 0, yaw: 3 }, { x: 0, y: -1, yaw: 0 })).toBeCloseTo(-Math.PI / 2 - 3 + 2 * Math.PI);
});

it("turns toward the target and charges once roughly facing it", () => {
  expect(faceTwist(1).wz).toBeGreaterThan(0);
  expect(faceTwist(-1).wz).toBeLessThan(0);
  expect(faceTwist(0.5).vx).toBe(0);
  expect(chargeTwist(0.1).vx).toBe(VEL_FWD);
  expect(chargeTwist(1.2).vx).toBeLessThan(VEL_FWD);
});

it("counts a fast approach into contact as a clash, not a slow bump or a near miss", () => {
  expect(isClash(0.3, 0.19, 0.1)).toBe(true); // 1.1 m/s, inside 20 cm
  expect(isClash(0.21, 0.19, 0.1)).toBe(false); // 0.2 m/s: a nudge
  expect(isClash(0.3, 0.19, 0.3)).toBe(false); // 0.37 m/s over 300 ms: gait sway, not a charge
  expect(isClash(0.4, 0.19, 0.3)).toBe(true); // 0.7 m/s: a measured charge
  expect(isClash(0.5, 0.4, 0.1)).toBe(false); // fast but still apart
  expect(isClash(0.2, 0.25, 0.1)).toBe(false); // moving apart
});
