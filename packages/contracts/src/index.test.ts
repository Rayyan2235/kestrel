import { describe, expect, it } from "vitest";
import {
  CommandSchema,
  messageFor,
  previewExchange,
  createWorld,
  applyWeight,
  balance,
} from "./index.js";

describe("bounded preview contracts", () => {
  it("rejects unrecognized bots, non-finite values and out-of-range positions", () => {
    expect(
      CommandSchema.safeParse({
        botId: "stranger",
        text: "hello",
        worldVersion: 0,
      }).success,
    ).toBe(false);
    expect(() => applyWeight(createWorld(), "right", 100, 0)).toThrow();
    expect(() => applyWeight(createWorld(), "right", NaN, 0)).toThrow();
  });
  it("computes equilibrium from quantities, not model text", () => {
    const initial = createWorld();
    expect(balance(initial)).toBe("left");
    const next = applyWeight(initial, "right", 40, 0);
    expect(balance(next)).toBe("balanced");
    expect(initial.rightCm).toBe(20);
  });
  it("rejects an action from before reset", () => {
    expect(() =>
      applyWeight({ ...createWorld(), version: 2 }, "left", 10, 1),
    ).toThrow("stale");
  });
  it("preserves the captured recipient and refuses unsupported input without inventing an action", () => {
    const command = CommandSchema.parse({
      botId: "pip",
      text: "fly to Mars",
      worldVersion: 0,
    });
    const result = messageFor(command, createWorld());
    expect(result.speaker).toBe("pip");
    expect(result.action).toBeUndefined();
    expect(result.text).toMatch(/preview/i);
  });
  it("creates only two addressed bot turns, grounded in the current world", () => {
    const turns = previewExchange("pip", createWorld());
    expect(turns).toHaveLength(2);
    expect(turns.map((x) => [x.speaker, x.recipient])).toEqual([
      ["pip", "nova"],
      ["nova", "pip"],
    ]);
    expect(turns[1].text).toContain("left");
    const changed = previewExchange(
      "nova",
      applyWeight(createWorld(), "right", 40, 0),
    );
    expect(changed[1].text).toContain("balanced");
  });
});
