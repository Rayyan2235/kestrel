import { expect, it } from "vitest";
import type { SimStatus } from "../simulation/duckSim";
import { OBJECTIVE_LEVEL_DEG, balanceHint, beamBalanced, xpOf } from "./objectives";

const deg = (d: number) => (d * Math.PI) / 180;
function status(angleDeg: number, left = -0.1, right = 0.2, over: Partial<SimStatus> = {}): SimStatus {
  return {
    mode: "walk", sitting: false, task: null, phase: null, pose: { x: 0, y: 0, yawDeg: 0 }, hz: 50,
    balance: { pin: "free", angle: deg(angleDeg), rails: new Map([["weight-200", left], ["weight-100", right]]) },
    experiment: null,
    ...over,
  };
}

it("counts a beam within the objective's tolerance, not past it", () => {
  expect(beamBalanced(status(0))).toBe(true);
  expect(beamBalanced(status(1.4))).toBe(true);
  expect(beamBalanced(status(-OBJECTIVE_LEVEL_DEG))).toBe(true);
  expect(beamBalanced(status(1.6))).toBe(false);
  expect(beamBalanced(status(-2))).toBe(false);
});

it("never counts a pinned beam or one the robots are still moving", () => {
  const s = status(0);
  expect(beamBalanced({ ...s, balance: { ...s.balance!, pin: "locked" } })).toBe(false);
  expect(beamBalanced(status(0, -0.1, 0.2, { task: { kind: "set_balance", left_cm: 10, right_cm: 20 } }))).toBe(false);
  expect(beamBalanced(status(0, -0.1, 0.2, { experiment: { phase: "RELEASE", result: null } }))).toBe(false);
});

it("says how far the 200 g is off its balance point when close", () => {
  // Measured: 200 g at 10.4 cm against 100 g at 20 cm tilts about 2.4°.
  expect(balanceHint(status(2.4, -0.104, 0.2))).toBe("200 g is 0.4 cm too far out (or move the 100 g to 20.8 cm).");
  expect(balanceHint(status(-2, -0.096, 0.2))).toBe("200 g is 0.4 cm too far in (or move the 100 g to 19.2 cm).");
});

it("stays quiet when balanced, far off, pinned or busy", () => {
  expect(balanceHint(status(0.3, -0.1005, 0.2))).toBeNull();
  expect(balanceHint(status(15, -0.2, 0.2))).toBeNull();
  const s = status(2.4, -0.104, 0.2);
  expect(balanceHint({ ...s, balance: { ...s.balance!, pin: "locked" } })).toBeNull();
  expect(balanceHint(status(2.4, -0.104, 0.2, { experiment: { phase: "PUSH", result: null } }))).toBeNull();
});

it("adds up earned objectives' XP once each", () => {
  expect(xpOf(new Set())).toBe(0);
  expect(xpOf(new Set(["balance-beam"]))).toBe(100);
  expect(xpOf(new Set(["balance-beam", "rescue-pip", "build-triangle"]))).toBe(300);
});
