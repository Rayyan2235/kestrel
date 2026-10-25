import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BotId, DuckTask } from "@kestrel/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SimEvent } from "../duckSim";
import type { SimTask } from "../types.js";
import { createDuckSimAdapter, type DuckLab } from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A DuckSim stand-in: rails the test moves by hand, and the events it would emit. */
const fakeLab = () => {
  const rails = new Map([
    ["weight-200", -0.2],
    ["weight-100", 0.2],
  ]);
  const listeners = new Set<(e: SimEvent) => void>();
  const emit = (e: SimEvent) => listeners.forEach((fn) => fn(e));
  const started: { task: DuckTask; id: BotId | undefined }[] = [];
  const cancelled: BotId[] = [];
  let refusal: string | null = null;
  const lab: DuckLab = {
    status: () => ({ balance: { pin: "locked", angle: 0, rails } }),
    runTask: (task, id) => {
      if (refusal) return refusal;
      started.push({ task, id });
      return null;
    },
    reset: (reason = "Reset") => {
      rails.set("weight-200", -0.2).set("weight-100", 0.2);
      emit({ type: "reset", reason });
    },
    robot: (id) => ({ tasks: { cancel: () => void cancelled.push(id) } }),
  };
  const events = (fn: (e: SimEvent) => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  };
  /** The robot finishes the n-th started task, as DuckSim reports it. */
  const finish = (n: number, ok: boolean, summary: string) => {
    const s = started[n]!;
    emit({ type: "task-done", duck: s.id!, task: s.task, ok, summary });
  };
  const refuse = (why: string) => void (refusal = why);
  return { lab, events, rails, started, cancelled, emit, finish, refuse };
};

const setup = () => {
  const f = fakeLab();
  return { ...f, sim: createDuckSimAdapter(f.lab, f.events) };
};

const task = (over: Partial<SimTask> = {}): SimTask => ({
  id: "k1",
  object: "left-weight",
  owner: "pip",
  cm: 10,
  ...over,
});

describe("SimAdapter over the real two-robot DuckSim", () => {
  it("snapshots come from measured rail positions, in cm from the pivot", () => {
    const { sim } = setup();
    expect(sim.snapshot()).toMatchObject({
      leftCm: 20,
      rightCm: 20,
      leftGrams: 200,
      rightGrams: 100,
    });
  });

  it("a measured rail change bumps the version and notifies subscribers", async () => {
    const { sim, rails } = setup();
    const fn = vi.fn();
    sim.subscribe(fn);
    const v0 = sim.snapshot().version;
    rails.set("weight-200", -0.1234);
    await vi.advanceTimersByTimeAsync(150);
    expect(sim.snapshot()).toMatchObject({ leftCm: 12.3, rightCm: 20 });
    expect(sim.snapshot().version).toBeGreaterThan(v0);
    expect(fn).toHaveBeenCalledWith(sim.snapshot());
  });

  it("nothing measured changes: no new version and no notification", async () => {
    const { sim } = setup();
    const fn = vi.fn();
    sim.subscribe(fn);
    const before = sim.snapshot();
    await vi.advanceTimersByTimeAsync(1000);
    expect(sim.snapshot()).toBe(before);
    expect(fn).not.toHaveBeenCalled();
  });

  it("refuses marks off the real rails (5 to 30 cm) and says why", () => {
    const { sim } = setup();
    expect(sim.propose(task({ cm: 40 }))).toEqual({
      ok: false,
      reason: "invalid",
      summary: "The rails run from 5 to 30 cm from the pivot.",
    });
    expect(sim.propose(task({ cm: 4 })).ok).toBe(false);
    expect(sim.propose(task({ cm: 30 })).ok).toBe(true);
  });

  it("propose takes the per-object lock and does not move anything", () => {
    const { sim, started } = setup();
    const before = sim.snapshot();
    expect(sim.propose(task()).ok).toBe(true);
    expect(sim.propose(task({ id: "k2", owner: "nova" }))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(sim.propose(task({ id: "k3", object: "right-weight" })).ok).toBe(
      true,
    );
    expect(started).toEqual([]);
    expect(sim.snapshot()).toBe(before);
  });

  it("apply pushes the weight with its owner robot, holding the lock until the push lands", async () => {
    const { sim, started, finish, rails } = setup();
    const v0 = sim.snapshot().version;
    sim.propose(task());
    let settled = false;
    const done = sim.apply(task(), v0).then((r) => ((settled = true), r));
    expect(started).toEqual([
      {
        task: { kind: "place_weight", target: "weight-200", cm: 10 },
        id: "pip",
      },
    ]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(settled).toBe(false);
    expect(sim.propose(task({ id: "k2", cm: 25 }))).toMatchObject({
      reason: "locked",
    });
    rails.set("weight-200", -0.1012);
    finish(
      0,
      true,
      "Moved the 200 g weight from 20 cm to 10.1 cm (asked for 10 cm).",
    );
    const r = await done;
    expect(r).toMatchObject({
      ok: true,
      world: { leftCm: 10.1, rightCm: 20 },
      summary:
        "Moved the 200 g weight from 20 cm to 10.1 cm (asked for 10 cm).",
    });
    expect(sim.snapshot().leftCm).toBe(10.1);
    expect(sim.snapshot().version).toBeGreaterThan(v0);
    expect(sim.propose(task({ id: "k2", cm: 25 })).ok).toBe(true);
  });

  it("the right weight is Nova's: object and owner map onto MOMENTS.weights", () => {
    const { sim, started } = setup();
    const t = task({ object: "right-weight", owner: "nova", cm: 15 });
    sim.propose(t);
    void sim.apply(t, sim.snapshot().version);
    expect(started[0]).toEqual({
      task: { kind: "place_weight", target: "weight-100", cm: 15 },
      id: "nova",
    });
  });

  it("a failed push settles failed with the sim's words, and frees the lock", async () => {
    const { sim, finish, rails } = setup();
    sim.propose(task());
    const done = sim.apply(task(), sim.snapshot().version);
    rails.set("weight-200", -0.164);
    finish(0, false, "I lost contact with the paddle. I tried 3 times.");
    expect(await done).toEqual({
      ok: false,
      reason: "failed",
      summary: "I lost contact with the paddle. I tried 3 times.",
    });
    expect(sim.snapshot().leftCm).toBe(16.4);
    expect(sim.propose(task({ id: "k2" })).ok).toBe(true);
  });

  it("a push the sim refuses settles failed with its reason and frees the lock", async () => {
    const { sim, refuse } = setup();
    refuse("There isn't room between the weights for me to stand.");
    sim.propose(task());
    expect(await sim.apply(task(), sim.snapshot().version)).toEqual({
      ok: false,
      reason: "failed",
      summary: "There isn't room between the weights for me to stand.",
    });
    expect(sim.propose(task({ id: "k2" })).ok).toBe(true);
  });

  it("rejects a stale apply and an apply without propose, and starts nothing", async () => {
    const { sim, started, rails } = setup();
    const v0 = sim.snapshot().version;
    expect(await sim.apply(task(), v0)).toEqual({
      ok: false,
      reason: "not-proposed",
    });
    sim.propose(task());
    rails.set("weight-100", 0.25);
    await vi.advanceTimersByTimeAsync(150);
    expect(await sim.apply(task(), v0)).toEqual({ ok: false, reason: "stale" });
    expect(started).toEqual([]);
  });

  it("an abort stops the owner's push where it is, says where, and frees the lock", async () => {
    const { sim, cancelled, rails } = setup();
    const ctl = new AbortController();
    sim.propose(task());
    const done = sim.apply(task(), sim.snapshot().version, ctl.signal);
    rails.set("weight-200", -0.143);
    ctl.abort(new Error("stop"));
    expect(cancelled).toEqual(["pip"]);
    expect(await done).toEqual({
      ok: false,
      reason: "failed",
      summary: "Stopped. The 200 g weight is at 14.3 cm.",
    });
    expect(sim.propose(task({ id: "k2" })).ok).toBe(true);
  });

  it("an already-aborted signal starts no push", async () => {
    const { sim, started } = setup();
    sim.propose(task());
    const r = await sim.apply(
      task(),
      sim.snapshot().version,
      AbortSignal.abort(),
    );
    expect(r).toMatchObject({ ok: false, reason: "failed" });
    expect(started).toEqual([]);
  });

  it("release during a push cancels it, so the lock never outlives the robot's work", async () => {
    const { sim, cancelled } = setup();
    sim.propose(task());
    const done = sim.apply(task(), sim.snapshot().version);
    sim.release(task());
    expect(cancelled).toEqual(["pip"]);
    expect(await done).toMatchObject({ ok: false, reason: "failed" });
  });

  it("a lab reset mid-push fails the push; reset() bumps the version and frees locks", async () => {
    const { sim, rails, emit } = setup();
    sim.propose(task());
    const done = sim.apply(task(), sim.snapshot().version);
    rails.set("weight-200", -0.15);
    emit({ type: "reset", reason: "The duck tipped over, so the lab reset" });
    expect(await done).toEqual({
      ok: false,
      reason: "failed",
      summary: "The duck tipped over, so the lab reset.",
    });
    const moved = sim.snapshot().version;
    sim.propose(task({ id: "k2", object: "right-weight", owner: "nova" }));
    const w = sim.reset();
    expect(w).toMatchObject({ leftCm: 20, rightCm: 20 });
    expect(w.version).toBeGreaterThan(moved);
    expect(sim.snapshot()).toBe(w);
    expect(sim.propose(task({ id: "k3", object: "right-weight" })).ok).toBe(
      true,
    );
  });

  it("when Nova asks for the left weight, Pip (its owner) pushes it and the summary says so", async () => {
    const { sim, started, finish } = setup();
    const t = task({ owner: "nova" });
    sim.propose(t);
    const done = sim.apply(t, sim.snapshot().version);
    expect(started[0]!.id).toBe("pip");
    finish(
      0,
      true,
      "Moved the 200 g weight from 20 cm to 10 cm (asked for 10 cm).",
    );
    expect(await done).toMatchObject({
      summary:
        "Pip works the left rail. Moved the 200 g weight from 20 cm to 10 cm (asked for 10 cm).",
    });
  });

  it("dispose stops reading the sim", async () => {
    const { sim, rails } = setup();
    sim.dispose();
    rails.set("weight-200", -0.1);
    await vi.advanceTimersByTimeAsync(500);
    expect(sim.snapshot().leftCm).toBe(20);
  });

  it("simulation/real imports no React, store, provider or coordinator code", () => {
    for (const f of readdirSync(here).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    )) {
      const src = readFileSync(join(here, f), "utf8");
      expect(src, f).not.toMatch(
        /from\s+["'](react|react-dom|zustand|@react-three)/,
      );
      expect(src, f).not.toMatch(/from\s+["'][^"']*(provider|coordinator)\//);
    }
  });
});
