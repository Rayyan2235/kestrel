import { describe, expect, it } from "vitest";
import {
  DuckTaskSchema,
  UNIT,
  parseDuckTask,
  pythagorasKit,
  pythagorasSlots,
  roomProps,
  slotFilled,
} from "./index.js";

describe("Pythagoras slots", () => {
  it("place each square flush against its side of the right triangle", () => {
    const { slots, c } = pythagorasSlots(4, 3, [0, 0], { a: "a", b: "b", c: "c" });
    expect(c).toBe(5);
    const [a, b, hyp] = slots;
    // Leg squares: edge lies on the leg, square sits outside the triangle.
    expect(a!.pos[1] + a!.side / 2).toBeCloseTo(0);
    expect(b!.pos[0] + b!.side / 2).toBeCloseTo(0);
    // Hypotenuse square: its center is c/2 from the hypotenuse's midpoint,
    // on the side away from the right angle, and its edge runs along it.
    const mid = [2 * UNIT, 1.5 * UNIT];
    expect(Math.hypot(hyp!.pos[0] - mid[0]!, hyp!.pos[1] - mid[1]!)).toBeCloseTo(2.5 * UNIT);
    expect(Math.hypot(...hyp!.pos)).toBeGreaterThan(Math.hypot(...(mid as [number, number])));
    const edge = Math.atan2(3, -4);
    expect(Math.abs(Math.sin(2 * (hyp!.yaw - edge)))).toBeLessThan(1e-9);
    // The areas are the theorem.
    expect(a!.side ** 2 + b!.side ** 2).toBeCloseTo(hyp!.side ** 2);
  });

  it("only count a square as placed when it is on its slot", () => {
    const kit = pythagorasKit();
    const slot = kit.slots[0]!;
    expect(slotFilled(slot.pos, slot)).toBe(true);
    expect(slotFilled([slot.pos[0] + 0.1, slot.pos[1]], slot)).toBe(false);
    // Every slot is for a tile that exists in the kit.
    for (const s of kit.slots) expect(kit.props.some((p) => p.id === s.forProp)).toBe(true);
  });
});

describe("duck task grammar", () => {
  const props = [...roomProps(), ...pythagorasKit().props];

  it("maps spoken-style phrases to bounded tasks", () => {
    expect(parseDuckTask("Push the 3 square to its slot.", props)).toEqual({
      ok: true,
      task: { kind: "push", target: "square-3", toward: "slot" },
    });
    expect(parseDuckTask("go to the five by five", props)).toEqual({
      ok: true,
      task: { kind: "go_to", target: "square-5" },
    });
    expect(parseDuckTask("turn right 45 degrees", props)).toEqual({
      ok: true,
      task: { kind: "turn", degrees: -45 },
    });
    expect(parseDuckTask("walk forward 30 cm", props)).toEqual({
      ok: true,
      task: { kind: "move", meters: 0.3 },
    });
    expect(parseDuckTask("kick with your left foot", props)).toEqual({
      ok: true,
      task: { kind: "kick", foot: "left" },
    });
  });

  it("refuses skills and objects that do not exist instead of guessing", () => {
    const jump = parseDuckTask("jump over the square", props);
    expect(jump.ok).toBe(false);
    expect(!jump.ok && jump.reason).toMatch(/no jump/);
    expect(parseDuckTask("push the hippo", props).ok).toBe(false);
    expect(parseDuckTask("write my homework", props).ok).toBe(false);
  });

  it("caps distances so a transcript cannot send the duck across the room", () => {
    const far = parseDuckTask("walk forward 900 cm", props);
    expect(far.ok && far.task).toEqual({ kind: "move", meters: 2 });
    expect(DuckTaskSchema.safeParse({ kind: "move", meters: 50 }).success).toBe(false);
    expect(DuckTaskSchema.safeParse({ kind: "fly" }).success).toBe(false);
  });
});
