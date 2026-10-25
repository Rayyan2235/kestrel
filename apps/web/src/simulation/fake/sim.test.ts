import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createFakeSim } from "./index.js";
import type { SimTask } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));

const task = (over: Partial<SimTask> = {}): SimTask => ({
  id: "k1",
  object: "left-weight",
  owner: "pip",
  cm: 30,
  ...over,
});

describe("L1 gate: SimAdapter over the stub world", () => {
  it("propose does not mutate; apply at the proposed version mutates and bumps", () => {
    const sim = createFakeSim();
    const before = sim.snapshot();
    expect(sim.propose(task()).ok).toBe(true);
    expect(sim.snapshot()).toEqual(before);
    expect(sim.apply(task(), before.version)).toMatchObject({ ok: true });
    expect(sim.snapshot().leftCm).toBe(30);
    expect(sim.snapshot().version).toBeGreaterThan(before.version);
  });

  it("a second bot cannot take a locked object; another object stays free", () => {
    const sim = createFakeSim();
    expect(sim.propose(task()).ok).toBe(true);
    expect(sim.propose(task({ id: "k2", owner: "nova" }))).toEqual({
      ok: false,
      reason: "locked",
    });
    expect(
      sim.propose(task({ id: "k3", owner: "nova", object: "right-weight" })).ok,
    ).toBe(true);
  });

  it("release frees the lock without applying", () => {
    const sim = createFakeSim();
    const before = sim.snapshot();
    sim.propose(task());
    sim.release(task());
    expect(sim.snapshot()).toEqual(before);
    expect(sim.propose(task({ id: "k2", owner: "nova" })).ok).toBe(true);
  });

  it("apply frees the lock", () => {
    const sim = createFakeSim();
    sim.propose(task());
    sim.apply(task(), sim.snapshot().version);
    expect(sim.propose(task({ id: "k2", owner: "nova", cm: 10 })).ok).toBe(
      true,
    );
  });

  it("rejects a stale apply and leaves the world untouched", () => {
    const sim = createFakeSim();
    const v0 = sim.snapshot().version;
    sim.propose(task());
    sim.reset();
    const after = sim.snapshot();
    expect(sim.apply(task(), v0)).toEqual({ ok: false, reason: "stale" });
    expect(sim.snapshot()).toEqual(after);
  });

  it("rejects apply without propose", () => {
    const sim = createFakeSim();
    expect(sim.apply(task(), sim.snapshot().version)).toEqual({
      ok: false,
      reason: "not-proposed",
    });
  });

  it("refuses out-of-range positions at propose time", () => {
    const sim = createFakeSim();
    expect(sim.propose(task({ cm: 50 }))).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(sim.propose(task({ cm: 2 }))).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("reset restores the start layout, bumps the version and frees locks", () => {
    const sim = createFakeSim();
    const v0 = sim.snapshot().version;
    sim.propose(task());
    sim.apply(task(), v0);
    const moved = sim.snapshot().version;
    sim.propose(task({ id: "k2", object: "right-weight", cm: 40 }));
    const w = sim.reset();
    expect(w.version).toBeGreaterThan(moved);
    expect(w.leftCm).toBe(20);
    expect(w.rightCm).toBe(20);
    expect(sim.snapshot()).toEqual(w);
    expect(sim.propose(task({ id: "k3", object: "right-weight" })).ok).toBe(
      true,
    );
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const sim = createFakeSim();
    const fn = vi.fn();
    const off = sim.subscribe(fn);
    sim.propose(task());
    sim.apply(task(), sim.snapshot().version);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0].leftCm).toBe(30);
    off();
    sim.reset();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("simulation/ imports no React, store or model code", () => {
    const dir = join(here, "..");
    const files = [
      join(dir, "types.ts"),
      ...readdirSync(here)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => join(here, f)),
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(
        /from\s+["'](react|react-dom|zustand|@react-three)/,
      );
      expect(src, f).not.toMatch(/from\s+["'][^"']*(provider|coordinator)\//);
    }
  });
});
