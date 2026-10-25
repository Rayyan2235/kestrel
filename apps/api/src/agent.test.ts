import { describe, expect, it } from "vitest";
import { DuckTaskSchema } from "../../../packages/contracts/src/index.js";
import { normalizeTask } from "./agent.js";

describe("normalizeTask", () => {
  it("accepts a forward walk that carries a redundant direction", () => {
    const task = normalizeTask({ kind: "move", meters: 0.2, direction: "forward" });
    expect(DuckTaskSchema.parse(task)).toEqual({ kind: "move", meters: 0.2 });
  });
  it("turns a backward direction into a negative distance", () => {
    expect(normalizeTask({ kind: "move", meters: 0.3, direction: "backward" })).toEqual({ kind: "move", meters: -0.3 });
  });
  it("signs a turn by its direction (positive is left)", () => {
    expect(normalizeTask({ kind: "turn", degrees: 90, direction: "right" })).toEqual({ kind: "turn", degrees: -90 });
    expect(normalizeTask({ kind: "turn", degrees: -45, direction: "left" })).toEqual({ kind: "turn", degrees: 45 });
  });
  it("keeps a push direction, which pushes use", () => {
    const task = { kind: "push", target: "crate", direction: "right", meters: 0.2 };
    expect(normalizeTask(task)).toEqual(task);
  });
  it("does not turn a sideways walk into a forward one", () => {
    expect(DuckTaskSchema.safeParse(normalizeTask({ kind: "move", meters: 0.2, direction: "left" })).success).toBe(false);
  });
  it("drops stray fields from simple tasks", () => {
    expect(DuckTaskSchema.parse(normalizeTask({ kind: "sit", meters: 0 }))).toEqual({ kind: "sit" });
  });
});
