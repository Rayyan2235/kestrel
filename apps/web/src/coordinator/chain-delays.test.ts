import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoordinator } from "./index.js";
import { createFakeSim } from "../simulation/fake/index.js";
import { createMockProvider } from "../provider/mock.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const build = (delayMs: number) => {
  const sim = createFakeSim();
  const c = createCoordinator({
    sim,
    provider: createMockProvider({ delayMs }),
  });
  return { sim, c };
};

describe("L2/L3 gate: the demo delays fit inside the default chain cap", () => {
  it.each([1000, 3000, 6000])(
    "%i ms: a pulled handoff ends in a real (mock) handback, not the scripted fallback",
    async (ms) => {
      const { c } = build(ms);
      const h = c.askPeer("pip", "nova");
      await vi.advanceTimersByTimeAsync(ms * 2 + 100);
      await h.done;
      const last = c.ledger().at(-1)!;
      expect(last).toMatchObject({
        kind: "handback",
        to: "you",
        source: "mock",
      });
      expect(c.budget().callsUsed).toBe(2);
    },
  );

  it.each([1000, 3000, 6000])(
    "%i ms: an open question escalates through ask_peer to a handback",
    async (ms) => {
      const { c } = build(ms);
      const h = c.learnerTurn("why does it tilt?", "pip");
      await vi.advanceTimersByTimeAsync(ms * 2 + 100);
      await h.done;
      const kinds = c.ledger().map((e) => e.kind);
      expect(kinds).toContain("handoff");
      expect(c.ledger().at(-1)).toMatchObject({ kind: "handback", to: "you" });
    },
  );

  it("a plain fast reply makes one call and no handoff", async () => {
    const { c } = build(1000);
    const h = c.learnerTurn("hello there", "nova");
    await vi.advanceTimersByTimeAsync(1100);
    await h.done;
    expect(c.budget().callsUsed).toBe(1);
    expect(c.ledger().some((e) => e.kind === "handoff")).toBe(false);
  });
});

describe("L2 gate: Stop and Reset mid-chain", () => {
  it("Stop during call 2 leaves no handback and no late events, and bots go idle", async () => {
    const { c } = build(3000);
    const h = c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(3100);
    expect(c.botState("nova")).toBe("thinking");
    const len = c.ledger().length;
    c.stop();
    await vi.advanceTimersByTimeAsync(20000);
    await h.done;
    expect(c.ledger().length).toBe(len);
    expect(c.ledger().some((e) => e.kind === "handback")).toBe(false);
    expect(c.botState("pip")).toBe("idle");
    expect(c.botState("nova")).toBe("idle");
  });

  it("the coordinator is reusable right after Stop", async () => {
    const { c } = build(1000);
    c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(500);
    c.stop();
    const h = c.askPeer("nova", "pip");
    await vi.advanceTimersByTimeAsync(2100);
    await h.done;
    expect(c.ledger().at(-1)).toMatchObject({
      kind: "handback",
      from: "pip",
      to: "you",
    });
  });

  it("Reset clears the ledger and leaves no timers that fire a late event", async () => {
    const { c, sim } = build(3000);
    c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(1000);
    c.reset();
    expect(c.ledger()).toEqual([]);
    await vi.advanceTimersByTimeAsync(30000);
    expect(c.ledger()).toEqual([]);
    expect(sim.snapshot().leftCm).toBe(20);
  });

  it("a bot cannot hand off to itself", async () => {
    const { c } = build(1000);
    const h = c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(2100);
    await h.done;
    for (const e of c.ledger()) expect(e.from).not.toBe(e.to);
  });
});
