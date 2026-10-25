import { expect, it } from "vitest";
import { leveledUp, levelOf, need } from "./levels";

it("follows 25 (L - 1)(L + 2)", () => {
  expect([1, 2, 3, 4].map((l) => need(l))).toEqual([0, 100, 250, 450]);
});

it("finds the level at and around each threshold", () => {
  expect(levelOf(0)).toBe(1);
  expect(levelOf(99)).toBe(1);
  expect(levelOf(100)).toBe(2);
  expect(levelOf(249)).toBe(2);
  expect(levelOf(250)).toBe(3);
  expect(levelOf(-5)).toBe(1);
  for (let l = 1; l < 40; l++) {
    expect(levelOf(need(l))).toBe(l);
    expect(levelOf(need(l + 1) - 1)).toBe(l);
  }
});

it("lists every level crossed, and none when XP stays inside one", () => {
  expect(leveledUp(0, 100)).toEqual([{ from: 1, to: 2 }]);
  expect(leveledUp(0, 300)).toEqual([{ from: 1, to: 2 }, { from: 2, to: 3 }]);
  expect(leveledUp(100, 200)).toEqual([]);
  expect(leveledUp(200, 100)).toEqual([]);
});
