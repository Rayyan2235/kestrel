import { createWorld } from "@kestrel/contracts";
import { describe, expect, it, vi } from "vitest";
import { createLiveProvider } from "./live.js";
import type { Provider, ProviderRequest } from "./types.js";

const req: ProviderRequest = {
  bot: "pip",
  rootTurnId: "t1",
  worldVersion: 3,
  input: "Ask Nova to move the right weight to 25 cm",
  peer: null,
};
const reply = {
  say: "Let me ask Nova.",
  action: null,
  ask_peer: {
    to: "nova",
    question: "Can you move it to 25 cm?",
    evidence: "Right at 20 cm",
  },
};
const fallback: Provider = {
  respond: async () => ({
    respond: { say: "Mock reply.", action: null, ask_peer: null },
    source: "mock",
  }),
};
const json = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("live provider", () => {
  it("returns the API's Respond labelled live, sending the bot, input and measured world", async () => {
    const fetch = json(reply);
    const p = createLiveProvider({
      world: () => ({ ...createWorld(), rightCm: 21.4 }),
      fallback,
      fetch,
    });
    const r = await p.respond(req, new AbortController().signal);
    expect(r).toEqual({ respond: reply, source: "live" });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/two-bot/respond");
    expect(JSON.parse(init.body as string)).toEqual({
      bot: "pip",
      input: req.input,
      peer: null,
      world: { leftCm: 20, rightCm: 21.4, leftGrams: 200, rightGrams: 100 },
    });
  });

  it("a reply outside the contract, or an API error, falls back to the labelled mock", async () => {
    for (const fetch of [
      json({ ...reply, action: { side: "up", cm: 99 } }),
      json({ message: "no keys" }, 503),
    ]) {
      const p = createLiveProvider({ world: createWorld, fallback, fetch });
      const r = await p.respond(req, new AbortController().signal);
      expect(r.source).toBe("mock");
      expect(r.respond.say).toBe("Mock reply.");
    }
  });

  it("an abort rejects instead of falling back", async () => {
    const ctl = new AbortController();
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener("abort", () =>
            reject(init.signal!.reason),
          ),
        ),
    );
    const p = createLiveProvider({
      world: createWorld,
      fallback,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const pending = p.respond(req, ctl.signal);
    ctl.abort(new Error("stopped"));
    await expect(pending).rejects.toThrow("stopped");
  });
});
