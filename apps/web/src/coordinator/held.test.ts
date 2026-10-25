import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance } from "@kestrel/contracts";
import { createCoordinator } from "./index.js";
import { createFakeSim } from "../simulation/fake/index.js";
import { createLabEventLog } from "../progress/events.js";
import { CHALLENGES, challengeById } from "../progress/challenges.js";
import { instantProvider, say } from "../testing/fixtures.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const rig = () => {
  const sim = createFakeSim();
  const log = createLabEventLog();
  const { provider } = instantProvider(() => say("ok"));
  // `log` is an optional dep (see tester note to implementer).
  const c = createCoordinator({ sim, provider, log } as Parameters<typeof createCoordinator>[0]);
  return { sim, log, c };
};
const ctx = { challengeId: "moments-1", promptId: "moments-1/p1" };
const reply = { say: "Lock your prediction, then I'll move it", action: { side: "right" as const, cm: 30 } };
const held = (c: ReturnType<typeof rig>["c"]) =>
  c.heldTurn("pip", "move the right weight to 30 cm", reply as never, ctx);
const types = (log: ReturnType<typeof rig>["log"]) => log.events().map((e) => e.type);

describe("G2 gate: challenge data", () => {
  it("masses are fixed and answers sit on the 5-30 cm grid (fits DuckSim rails)", async () => {
    expect(CHALLENGES.map((c) => c.challengeId)).toEqual(["moments-1", "moments-2"]);
    const m1 = challengeById("moments-1")!;
    expect(m1.setup).toEqual([{ side: "left", cm: 15 }, { side: "right", cm: 20 }]);
    expect(m1.prompts[0]!.answer).toEqual({ side: "right", cm: 30 });
    const m2 = challengeById("moments-2")!;
    expect(m2.setup).toEqual([{ side: "left", cm: 10 }, { side: "right", cm: 30 }]);
    expect(m2.prompts[0]!.answer).toEqual({ side: "right", cm: 20 });
    for (const c of CHALLENGES) for (const s of c.setup) expect(s.cm >= 5 && s.cm <= 30).toBe(true);
  });
});

describe("G2 gate: held move and startChallenge", () => {
  it("a held move leaves snapshot() unchanged until commit", async () => {
    const { sim, c } = rig();
    const before = sim.snapshot();
    held(c);
    expect(sim.snapshot()).toEqual(before);
  });

  it("commit logs prediction_locked then move_applied; outcome equals balance(world)", async () => {
    const { sim, log, c } = rig();
    const h = held(c);
    await h.commit("balanced");
    expect(types(log)).toEqual(["prediction_locked", "move_applied"]);
    const m = log.events().at(-1)!;
    expect(m).toMatchObject({ type: "move_applied", bot: "nova", outcome: balance(sim.snapshot()), attempt: 1 });
    expect(log.events()[0]).toMatchObject({ type: "prediction_locked", attempt: 1, choice: "balanced", ...ctx });
  });

  it("the second commit on the same prompt carries attempt 2", async () => {
    const { log, c } = rig();
    await held(c).commit("left-down");
    await held(c).commit("balanced");
    const locks = log.events().filter((e) => e.type === "prediction_locked");
    expect(locks.map((e) => (e as { attempt: number }).attempt)).toEqual([1, 2]);
  });

  it("locking does not bump worldVersion", async () => {
    const { sim, log, c } = rig();
    const v = sim.snapshot().version;
    held(c);
    expect(sim.snapshot().version).toBe(v);
    expect(log.events()).toEqual([]);
  });

  it("skip applies and logs a scorable move_applied with no attempt and no prediction", async () => {
    const { log, c } = rig();
    await held(c).skip();
    expect(types(log)).toEqual(["move_applied"]);
    expect((log.events()[0] as { attempt?: number }).attempt).toBeUndefined();
  });

  it("stop while held releases the lock: a following propose on the same object succeeds", async () => {
    const { sim, log, c } = rig();
    held(c);
    c.stop();
    expect(types(log)).toContain("prediction_voided");
    const r = sim.propose({ id: "t", object: "right-weight", owner: "pip", cm: 30 });
    expect(r.ok).toBe(true);
  });

  it("reset, a new same-object command, and a 60 s idle timeout each void the held move; commit is then refused", async () => {
    const cases: [string, (c: ReturnType<typeof rig>["c"]) => unknown][] = [
      ["reset", (c) => c.reset()],
      ["same-object", (c) => { c.heldTurn("pip", "again", reply as never, ctx); }],
      ["timeout", async () => { await vi.advanceTimersByTimeAsync(60_001); }],
    ];
    for (const [name, act] of cases) {
      const { sim, log, c } = rig();
      const h = held(c);
      const v = sim.snapshot().version;
      await act(c);
      expect(types(log), name).toContain("prediction_voided");
      await h.commit("balanced");
      expect(log.events().some((e) => e.type === "move_applied" && !(e as { setup?: boolean }).setup), name).toBe(false);
      expect(balance(sim.snapshot()), name).toBe(balance(sim.snapshot()));
      expect(sim.snapshot().version, name).toBeGreaterThanOrEqual(v);
    }
  });

  it("a stale apply logs no move_applied and the next lock on that prompt is still attempt 1", async () => {
    const { sim, log, c } = rig();
    const h = held(c);
    // another writer bumps the world version while the move is held
    sim.reset();
    await h.commit("balanced");
    expect(log.events().some((e) => e.type === "move_applied")).toBe(false);
    await held(c).commit("balanced");
    const lock = log.events().filter((e) => e.type === "prediction_locked").at(-1) as { attempt: number };
    expect(lock.attempt).toBe(1);
  });

  it("startChallenge loads authored cm values as tagged setup, with no attempt", async () => {
    const { sim, log, c } = rig();
    await c.startChallenge("moments-2", challengeById("moments-2")!.setup);
    const w = sim.snapshot();
    expect([w.leftCm, w.rightCm]).toEqual([10, 30]);
    const moves = log.events().filter((e) => e.type === "move_applied");
    expect(moves.length).toBeGreaterThan(0);
    moves.forEach((e) => {
      const m = e as { setup?: boolean; attempt?: number };
      expect(m.setup).toBe(true);
      expect(m.attempt).toBeUndefined();
    });
    expect(log.events().some((e) => e.type === "prediction_locked")).toBe(false);
  });

  it("startChallenge clears epoch state: a held move from before is voided", async () => {
    const { log, c } = rig();
    held(c);
    await c.startChallenge("moments-1", challengeById("moments-1")!.setup);
    expect(types(log)).toContain("prediction_voided");
  });

  it("existing coordinator contract still holds: ledger stays contiguous after a held turn", async () => {
    const { c } = rig();
    held(c);
    c.ledger().forEach((e, i) => expect(e.seq).toBe(i));
  });
});
