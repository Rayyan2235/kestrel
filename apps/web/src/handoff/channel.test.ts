import { describe, expect, it } from "vitest";
import { deriveChannel } from "./model.js";
import type { BotState, Budget } from "../coordinator/types.js";
import { ev } from "../testing/fixtures.js";

const status: Record<"pip" | "nova", BotState> = {
  pip: "waiting",
  nova: "thinking",
};
const budget: Budget = { callsUsed: 1, hopsUsed: 1, capMs: 16000 };

describe("L6 gate: channel view from the ledger", () => {
  const led = [
    ev(0, "you", "pip", { kind: "learner", source: "built-in" }),
    ev(1, "pip", "nova", { kind: "handoff" }),
    ev(2, "nova", "pip"),
    ev(3, "pip", "you", { kind: "say" }),
  ];

  it("splits learner thread and bot channel; no event lands in both", () => {
    const v = deriveChannel(led, status, budget);
    expect(v.youThread.map((e) => e.seq)).toEqual([0, 3]);
    expect(v.botChannel.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("a nova-to-you event belongs to the learner thread", () => {
    const v = deriveChannel([ev(0, "nova", "you")], status, budget);
    expect(v.youThread).toHaveLength(1);
    expect(v.botChannel).toHaveLength(0);
  });

  it("the learner can never type in the bot channel", () => {
    expect(deriveChannel(led, status, budget).learnerCanType).toBe(false);
  });

  it("passes through status and budget unchanged", () => {
    const v = deriveChannel(led, status, budget);
    expect(v.status).toEqual(status);
    expect(v.budget).toEqual(budget);
  });

  it("handback is set only while the last event is a handback to the learner", () => {
    const hb = ev(4, "nova", "you", { kind: "handback" });
    expect(deriveChannel([...led, hb], status, budget).handback).toEqual(hb);
    expect(deriveChannel(led, status, budget).handback).toBeNull();
    expect(
      deriveChannel(
        [...led, hb, ev(5, "you", "pip", { kind: "learner" })],
        status,
        budget,
      ).handback,
    ).toBeNull();
  });

  it("a handback to a bot is not a learner handback", () => {
    const v = deriveChannel(
      [ev(0, "pip", "nova", { kind: "handback" })],
      status,
      budget,
    );
    expect(v.handback).toBeNull();
  });

  it("preserves ledger order and does not mutate its input", () => {
    const copy = structuredClone(led);
    const v = deriveChannel(led, status, budget);
    expect(led).toEqual(copy);
    const seqs = v.botChannel.map((e) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });
});
