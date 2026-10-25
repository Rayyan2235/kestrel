import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LedgerEventSchema } from "@kestrel/contracts";
import { createCoordinator } from "./index.js";
import type { CoordinatorConfig } from "./types.js";
import type { Provider } from "../provider/types.js";
import { createFakeSim } from "../simulation/fake/index.js";
import type { ApplyResult, SimAdapter, SimTask } from "../simulation/types.js";
import { createMockProvider } from "../provider/mock.js";
import {
  askPeer,
  controlledProvider,
  flush,
  instantProvider,
  say,
} from "../testing/fixtures.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = (provider: Provider, config: Partial<CoordinatorConfig> = {}) => {
  const sim = createFakeSim();
  return { sim, c: createCoordinator({ sim, provider, config }) };
};

/** The stub, but each apply waits like a physical push until the test settles it. */
const slowSim = () => {
  const inner = createFakeSim();
  const pushes: {
    task: SimTask;
    signal?: AbortSignal;
    land: (summary?: string) => void;
    fail: (summary: string) => void;
  }[] = [];
  const sim: SimAdapter = {
    ...inner,
    apply: (task, version, signal) =>
      new Promise<ApplyResult>((resolve) => {
        signal?.addEventListener(
          "abort",
          () => {
            inner.release(task);
            resolve({ ok: false, reason: "failed", summary: "Stopped." });
          },
          { once: true },
        );
        pushes.push({
          task,
          signal,
          land: (summary) =>
            void inner
              .apply(task, version)
              .then((r) => resolve(r.ok && summary ? { ...r, summary } : r)),
          fail: (summary) => {
            inner.release(task);
            resolve({ ok: false, reason: "failed", summary });
          },
        });
      }),
  };
  return { sim, pushes };
};

const move = (side: "left" | "right", cm: number, say = "Moving.") => ({
  say,
  action: { side, cm },
  ask_peer: null,
});

describe("L2 gate: coordinator", () => {
  it("a learner turn appends addressed, valid, contiguous ledger events", async () => {
    const { provider } = instantProvider(() => say("Try 30 cm."));
    const { c } = setup(provider);
    await c.learnerTurn("why does it tilt?", "pip").done;
    const led = c.ledger();
    expect(led.length).toBeGreaterThanOrEqual(2);
    led.forEach((e, i) => {
      expect(LedgerEventSchema.safeParse(e).success).toBe(true);
      expect(e.seq).toBe(i);
    });
    expect(led[0]).toMatchObject({ kind: "learner", from: "you", to: "pip" });
    expect(led.at(-1)).toMatchObject({
      from: "pip",
      to: "you",
      text: "Try 30 cm.",
    });
    expect(new Set(led.map((e) => e.rootTurnId)).size).toBe(1);
  });

  it("the target is fixed at resolution: a dispatched turn keeps its recipient", () => {
    const { calls, provider } = controlledProvider();
    const { c } = setup(provider);
    const h = c.learnerTurn("hello", "nova");
    expect(h.recipient).toBe("nova");
    expect(calls[0]!.req.bot).toBe("nova");
  });

  it("bot state goes thinking while a call is out, and back to rest after", async () => {
    const { calls, provider } = controlledProvider();
    const { c } = setup(provider);
    expect(c.botState("pip")).toBe("idle");
    const h = c.learnerTurn("hi", "pip");
    expect(c.botState("pip")).toBe("thinking");
    expect(c.botState("nova")).toBe("idle");
    calls[0]!.resolve(say("hello"));
    await h.done;
    expect(["idle", "done"]).toContain(c.botState("pip"));
  });

  it("drops a late reply after Stop and aborts the in-flight call", async () => {
    const { calls, provider } = controlledProvider();
    const { c } = setup(provider);
    const h = c.learnerTurn("hi", "pip");
    c.stop();
    expect(calls[0]!.signal.aborted).toBe(true);
    calls[0]!.resolve(say("too late"));
    await h.done;
    await flush();
    expect(c.ledger().some((e) => e.text === "too late")).toBe(false);
    expect(c.botState("pip")).toBe("idle");
  });

  it("a new learner turn aborts the old chain and drops its late result", async () => {
    const { calls, provider } = controlledProvider();
    const { c } = setup(provider);
    c.learnerTurn("first", "pip");
    const h2 = c.learnerTurn("second", "nova");
    expect(calls[0]!.signal.aborted).toBe(true);
    calls[0]!.resolve(say("stale answer"));
    calls[1]!.resolve(say("fresh answer"));
    await h2.done;
    await flush();
    const texts = c.ledger().map((e) => e.text);
    expect(texts).toContain("fresh answer");
    expect(texts).not.toContain("stale answer");
  });

  it("drops a late result after Reset; Reset bumps world version and epoch", async () => {
    const { calls, provider } = controlledProvider();
    const { c, sim } = setup(provider);
    const v0 = sim.snapshot().version;
    const h = c.learnerTurn("hi", "pip");
    const epochBefore = c.ledger().at(-1)!.epoch;
    c.reset();
    calls[0]!.resolve(say("ghost"));
    await h.done;
    await flush();
    expect(c.ledger().some((e) => e.text === "ghost")).toBe(false);
    expect(sim.snapshot().version).toBeGreaterThan(v0);
    c.learnerTurn("after", "pip");
    expect(c.ledger().at(-1)!.epoch).toBeGreaterThan(epochBefore);
  });

  it("applies a model action through the sim and stamps the new worldVersion", async () => {
    const { provider } = instantProvider(() => ({
      say: "Moving left to 35.",
      action: { side: "left", cm: 35 },
      ask_peer: null,
    }));
    const { c, sim } = setup(provider);
    const v0 = sim.snapshot().version;
    await c.learnerTurn("move left to 35", "pip").done;
    expect(sim.snapshot().leftCm).toBe(35);
    expect(c.ledger().at(-1)!.worldVersion).toBeGreaterThan(v0);
  });

  it("does not apply an action whose world changed underneath it", async () => {
    const { calls, provider } = controlledProvider();
    const { c, sim } = setup(provider);
    const h = c.learnerTurn("move left to 35", "pip");
    sim.reset();
    calls[0]!.resolve({
      say: "Moving.",
      action: { side: "left", cm: 35 },
      ask_peer: null,
    });
    await h.done;
    expect(sim.snapshot().leftCm).toBe(20);
  });

  it("waits for a slow physical action: the bot stays acting and replies once it lands", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider(() => move("left", 25));
    const c = createCoordinator({ sim, provider });
    const h = c.learnerTurn("move left to 25", "pip");
    await flush();
    expect(c.botState("pip")).toBe("acting");
    expect(c.ledger().some((e) => e.kind === "say")).toBe(false);
    pushes[0]!.land();
    await h.done;
    expect(sim.snapshot().leftCm).toBe(25);
    expect(c.ledger().at(-1)).toMatchObject({ kind: "say", from: "pip" });
  });

  it("the chain cap counts talk time, not a push: a long push is not cut off", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider(() => move("left", 25, "Done."));
    const c = createCoordinator({
      sim,
      provider,
      config: { callTimeoutMs: 1000, chainCapMs: 2500 },
    });
    const h = c.learnerTurn("move left to 25", "pip");
    await vi.advanceTimersByTimeAsync(5000);
    expect(pushes[0]!.signal?.aborted).toBe(false);
    pushes[0]!.land();
    await h.done;
    expect(sim.snapshot().leftCm).toBe(25);
    expect(c.ledger().at(-1)).toMatchObject({ kind: "say", text: "Done." });
  });

  it("a push that outlasts actTimeoutMs is aborted, its lock freed, and the learner told", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider(() => move("left", 25));
    const c = createCoordinator({
      sim,
      provider,
      config: { actTimeoutMs: 3000 },
    });
    const h = c.learnerTurn("move left to 25", "pip");
    await vi.advanceTimersByTimeAsync(2900);
    expect(pushes[0]!.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await h.done;
    expect(pushes[0]!.signal?.aborted).toBe(true);
    expect(sim.snapshot().leftCm).toBe(20);
    expect(c.ledger().at(-1)).toMatchObject({ kind: "notice", to: "you" });
    expect(sim.propose({ ...pushes[0]!.task, id: "next" }).ok).toBe(true);
  });

  it("Stop during a push aborts it, frees the lock and appends nothing more", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider(() => move("left", 25));
    const c = createCoordinator({ sim, provider });
    const h = c.learnerTurn("move left to 25", "pip");
    await flush();
    const len = c.ledger().length;
    c.stop();
    await h.done;
    expect(pushes[0]!.signal?.aborted).toBe(true);
    expect(c.ledger().length).toBe(len);
    expect(c.botState("pip")).toBe("idle");
    expect(sim.propose({ ...pushes[0]!.task, id: "next" }).ok).toBe(true);
  });

  it("a failed push tells the learner what the sim measured, not a generic notice", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider(() => move("left", 25));
    const c = createCoordinator({ sim, provider });
    const h = c.learnerTurn("move left to 25", "pip");
    await flush();
    pushes[0]!.fail(
      "I lost contact with the paddle. The weight is at 22.4 cm.",
    );
    await h.done;
    expect(c.ledger().at(-1)).toMatchObject({
      kind: "notice",
      from: "pip",
      to: "you",
      text: "I lost contact with the paddle. The weight is at 22.4 cm.",
    });
  });

  it("a refused proposal passes on the sim's reason", async () => {
    const sim: SimAdapter = {
      ...createFakeSim(),
      propose: () => ({
        ok: false,
        reason: "invalid",
        summary: "The rails run from 5 to 30 cm.",
      }),
    };
    const { provider } = instantProvider(() => move("left", 40));
    const c = createCoordinator({ sim, provider });
    await c.learnerTurn("move left to 40", "pip").done;
    expect(c.ledger().at(-1)).toMatchObject({
      kind: "notice",
      text: "The rails run from 5 to 30 cm.",
    });
  });

  it("a landed push adds its measured result; on a handoff the handback stays last", async () => {
    const { sim, pushes } = slowSim();
    const { provider } = instantProvider((req) =>
      req.peer ? move("right", 15, "Try this.") : askPeer("nova"),
    );
    const c = createCoordinator({ sim, provider });
    const h = c.askPeer("pip", "nova");
    await flush();
    expect(c.botState("nova")).toBe("acting");
    pushes[0]!.land("Moved the 100 g weight from 20 cm to 15.1 cm.");
    await h.done;
    const tail = c.ledger().slice(-2);
    expect(tail[0]).toMatchObject({
      kind: "notice",
      from: "nova",
      text: "Moved the 100 g weight from 20 cm to 15.1 cm.",
    });
    expect(tail[1]).toMatchObject({ kind: "handback", text: "Try this." });
  });

  it("a pulled handoff makes at most two calls and ends with a handback to the learner", async () => {
    const { provider, seen } = instantProvider((req) =>
      req.peer ? say("Nova sees the left side heavier.") : askPeer("nova"),
    );
    const { c } = setup(provider);
    await c.askPeer("pip", "nova").done;
    expect(seen.length).toBeLessThanOrEqual(2);
    const led = c.ledger();
    const handoff = led.find((e) => e.kind === "handoff");
    expect(handoff).toMatchObject({ from: "pip", to: "nova" });
    expect(handoff!.causedBy).not.toBeNull();
    expect(led.at(-1)).toMatchObject({
      kind: "handback",
      from: "nova",
      to: "you",
    });
    expect(Math.max(...led.map((e) => e.hop))).toBeLessThanOrEqual(1);
    expect(c.focus()).toBe("you");
  });

  it("caps the chain: a peer that keeps asking never causes a third call or second hop", async () => {
    const { provider, seen } = instantProvider((req) =>
      askPeer(req.bot === "pip" ? "nova" : "pip"),
    );
    const { c } = setup(provider);
    await c.askPeer("pip", "nova").done;
    expect(seen.length).toBeLessThanOrEqual(2);
    const led = c.ledger();
    expect(Math.max(...led.map((e) => e.hop))).toBeLessThanOrEqual(1);
    expect(led.at(-1)).toMatchObject({
      kind: "handback",
      to: "you",
      source: "scripted",
    });
    expect(c.budget().callsUsed).toBeLessThanOrEqual(2);
    expect(c.budget().hopsUsed).toBeLessThanOrEqual(1);
  });

  it("scripted handback when the chain cap expires on a hung second call", async () => {
    const { calls, provider } = controlledProvider();
    const { c } = setup(provider, { callTimeoutMs: 1000, chainCapMs: 2500 });
    const h = c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(900);
    expect(calls.length).toBe(1);
    calls[0]!.resolve(askPeer("nova"));
    await vi.advanceTimersByTimeAsync(10);
    expect(calls.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1700);
    await h.done;
    expect(calls[1]!.signal.aborted).toBe(true);
    expect(c.ledger().at(-1)).toMatchObject({
      kind: "handback",
      to: "you",
      source: "scripted",
    });
  });

  it("a single hung call times out and the learner is told, not left hanging", async () => {
    const { provider } = controlledProvider();
    const { c } = setup(provider, { callTimeoutMs: 1000, chainCapMs: 2500 });
    const h = c.learnerTurn("hi", "pip");
    await vi.advanceTimersByTimeAsync(1100);
    await h.done;
    expect(["error", "idle"]).toContain(c.botState("pip"));
    expect(c.ledger().at(-1)!.to).toBe("you");
  });

  it("notifies subscribers and stops after unsubscribe", async () => {
    const { provider } = instantProvider(() => say("ok"));
    const { c } = setup(provider);
    const fn = vi.fn();
    const off = c.subscribe(fn);
    await c.learnerTurn("hi", "pip").done;
    expect(fn).toHaveBeenCalled();
    off();
    const n = fn.mock.calls.length;
    await c.learnerTurn("again", "pip").done;
    expect(fn.mock.calls.length).toBe(n);
  });

  it("end to end with the mock provider: a pulled handoff ends in a handback", async () => {
    const sim = createFakeSim();
    const c = createCoordinator({
      sim,
      provider: createMockProvider({ delayMs: 1000 }),
    });
    const h = c.askPeer("pip", "nova");
    await vi.advanceTimersByTimeAsync(7000);
    await h.done;
    expect(c.ledger().at(-1)).toMatchObject({ kind: "handback", to: "you" });
  });
});
