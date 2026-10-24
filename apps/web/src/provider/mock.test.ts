import { describe, expect, it } from "vitest";
import { RespondSchema } from "@kestrel/contracts";
import { createMockProvider } from "./mock.js";
import type { ProviderRequest } from "./types.js";

const req = (over: Partial<ProviderRequest> = {}): ProviderRequest => ({
  bot: "pip",
  rootTurnId: "t0",
  worldVersion: 0,
  input: "why does it tilt?",
  peer: null,
  ...over,
});

const instantSleep = () => {
  const waits: number[] = [];
  return {
    waits,
    sleep: async (ms: number) => {
      waits.push(ms);
    },
  };
};

describe("L3 gate: mock provider", () => {
  it.each([1000, 3000, 6000])("honors the injected %i ms delay", async (ms) => {
    const { waits, sleep } = instantSleep();
    const p = createMockProvider({ delayMs: ms, sleep });
    await p.respond(req(), new AbortController().signal);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(ms);
  });

  it("returns a schema-valid respond labelled mock", async () => {
    const { sleep } = instantSleep();
    const p = createMockProvider({ delayMs: 1000, sleep });
    const r = await p.respond(req(), new AbortController().signal);
    expect(r.source).toBe("mock");
    expect(RespondSchema.safeParse(r.respond).success).toBe(true);
  });

  it("is deterministic for the same request", async () => {
    const { sleep } = instantSleep();
    const p = createMockProvider({ delayMs: 1000, sleep });
    const a = await p.respond(req(), new AbortController().signal);
    const b = await p.respond(req(), new AbortController().signal);
    expect(a).toEqual(b);
  });

  it("the peer-answering call never asks another peer", async () => {
    const { sleep } = instantSleep();
    const p = createMockProvider({ delayMs: 1000, sleep });
    const r = await p.respond(
      req({
        bot: "nova",
        peer: { from: "pip", question: "What do you see?", evidence: "x" },
      }),
      new AbortController().signal,
    );
    expect(r.respond.ask_peer).toBeNull();
  });

  it("a request can produce an ask_peer somewhere in the scripted set", async () => {
    const { sleep } = instantSleep();
    const p = createMockProvider({ delayMs: 1000, sleep });
    const inputs = [
      "why does it tilt?",
      "what should I try?",
      "ask nova",
      "is the left side heavier?",
      "help",
    ];
    const outs = await Promise.all(
      inputs.map((input) =>
        p.respond(req({ input }), new AbortController().signal),
      ),
    );
    expect(outs.some((o) => o.respond.ask_peer !== null)).toBe(true);
  });

  it("abort rejects a waiting call and the default sleep releases its timer", async () => {
    const p = createMockProvider({ delayMs: 6000 });
    const ac = new AbortController();
    const pending = p.respond(req(), ac.signal);
    ac.abort();
    await expect(pending).rejects.toBeDefined();
  });

  it("an already-aborted signal never produces a reply", async () => {
    const p = createMockProvider({ delayMs: 1000 });
    const ac = new AbortController();
    ac.abort();
    await expect(p.respond(req(), ac.signal)).rejects.toBeDefined();
  });
});
