import { expect, it } from "vitest";
import type { SimStatus } from "../simulation/duckSim";
import { beamLevel } from "./objectives";

const rails = new Map([["weight-200", -0.1], ["weight-100", 0.2]]);
function status(over: Partial<SimStatus> = {}, balance: Partial<NonNullable<SimStatus["balance"]>> = {}): SimStatus {
  return {
    mode: "walk", sitting: false, task: null, phase: null, pose: { x: 0, y: 0, yawDeg: 0 }, hz: 50,
    balance: { pin: "free", angle: 0.001, rails, ...balance },
    experiment: null,
    ...over,
  };
}

it("counts a released plank that reads level", () => {
  expect(beamLevel(status())).toBe(true);
});

it("does not count a plank held level by its pin", () => {
  expect(beamLevel(status({}, { pin: "locked", angle: 0 }))).toBe(false);
  expect(beamLevel(status({}, { pin: "levelling", angle: 0 }))).toBe(false);
});

it("does not count a tipped plank (0.5° or more)", () => {
  expect(beamLevel(status({}, { angle: 0.1 }))).toBe(false);
  expect(beamLevel(status({}, { angle: -0.0105 }))).toBe(false);
});

it("waits until the robots have finished", () => {
  expect(beamLevel(status({ task: { kind: "set_balance", left_cm: 10, right_cm: 20 } }))).toBe(false);
  expect(beamLevel(status({ experiment: { phase: "RELEASE", result: null } }))).toBe(false);
  expect(beamLevel(status({ experiment: { phase: "DONE", result: null } }))).toBe(true);
});

it("needs a beam at all", () => {
  expect(beamLevel(status({ balance: null }))).toBe(false);
});
