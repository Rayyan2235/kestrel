import { describe, expect, it } from "vitest";
import type { Award, LabEvent, Outcome, PredictionChoice } from "@kestrel/contracts";
import { award, totalXp, type RuleState } from "./rules.js";
import { leveledUp, levelOf, need } from "./levels.js";
import { tokens, unlocked } from "./picks.js";
import { mulberry32, seedFrom } from "./rng.js";
import { offer } from "./offers.js";

// Feeds events one at a time. `state.events` holds the events BEFORE the current one.
type Run = {
  awards: Award[];
  rejected: { ruleId: string; reason: string }[];
  events: LabEvent[];
};
type In = Record<string, unknown> & { type: string };
const fresh = (awards: Award[] = []): Run => ({ awards, rejected: [], events: [] });
let SEQ = 0;
const feed = (run: Run, e: In, opts: { now?: number; epoch?: number } = {}): Run => {
  const event = { worldVersion: 0, epoch: 0, ...e, seq: SEQ++ } as unknown as LabEvent;
  const state: RuleState = {
    awards: run.awards,
    events: run.events,
    epoch: opts.epoch ?? 0,
    now: opts.now ?? 1000 + SEQ * 60000,
  };
  const r = award(event, state);
  return {
    awards: [...run.awards, ...r.granted],
    rejected: [...run.rejected, ...r.rejected],
    events: [...run.events, event],
  };
};
const feedAll = (run: Run, es: In[], opts?: { now?: number; epoch?: number }) =>
  es.reduce((r, e) => feed(r, e, opts), run);

const C = "moments-1";
const P = "moments-1/p1";
const lock = (choice: PredictionChoice, attempt = 1): In => ({
  type: "prediction_locked", challengeId: C, promptId: P, attempt, choice,
});
const move = (outcome: Outcome, attempt?: number): In => ({
  type: "move_applied", challengeId: C, promptId: P, attempt, bot: "pip", outcome,
});
const complete = (challengeId = C): In => ({ type: "challenge_complete", challengeId });
const explain = (challengeId = C): In => ({ type: "explanation_submitted", challengeId });
const askPeer = (challengeId = C): In => ({ type: "ask_peer_used", challengeId });

const prompt = (choice: PredictionChoice, outcome: Outcome, attempt = 1, run = fresh()) =>
  feed(feed(run, lock(choice, attempt)), move(outcome, attempt));
const xp = (r: Run) => totalXp(r.awards);

describe("G1 gate: pure award rules", () => {
  it("correct 25 > wrong 10 > nothing 0", () => {
    expect(xp(prompt("balanced", "balanced"))).toBe(25);
    expect(xp(prompt("left-down", "balanced"))).toBe(10);
    expect(xp(fresh())).toBe(0);
  });

  it("a lock pays at the resolving move, not at the lock", () => {
    expect(xp(feed(fresh(), lock("balanced")))).toBe(0);
  });

  it("a lock after the move_applied of its prompt earns nothing", () => {
    expect(xp(feedAll(fresh(), [move("balanced", 1), lock("balanced")]))).toBe(0);
  });

  it("an older-epoch event earns nothing", () => {
    const r = feedAll(fresh(), [{ ...lock("balanced"), epoch: 0 }, move("balanced", 1)], { epoch: 3 });
    expect(xp(r)).toBe(0);
  });

  it("prediction_voided earns nothing and leaves the prompt fresh", () => {
    let r = feed(fresh(), lock("balanced"));
    r = feed(r, { type: "prediction_voided", challengeId: C, promptId: P, attempt: 1, reason: "stop" });
    expect(xp(r)).toBe(0);
    expect(xp(prompt("balanced", "balanced", 1, r))).toBe(25);
  });

  it("a lock with a stale apply (no move_applied) gives 0 and the next lock is still first", () => {
    let r = feed(fresh(), lock("balanced"));
    expect(xp(r)).toBe(0);
    r = prompt("balanced", "balanced", 1, r);
    expect(xp(r)).toBe(25);
  });

  it("free-play movement, repeats and setup earn 0", () => {
    const free: In = { type: "move_applied", bot: "pip", outcome: "left" };
    expect(xp(feedAll(fresh(), [free, free, free]))).toBe(0);
    expect(xp(feed(fresh(), { ...move("left"), setup: true }))).toBe(0);
  });

  it("a setup move does not complete a challenge", () => {
    const r = feed(fresh(), { type: "move_applied", challengeId: C, bot: "pip", outcome: "balanced", setup: true });
    expect(r.awards).toEqual([]);
  });

  it("replay: the same events twice give identical awards", () => {
    const es = [lock("left-down"), move("left", 1), lock("balanced", 2), move("balanced", 2), complete(), explain()];
    const strip = (r: Run) => r.awards.map((x) => [x.awardId, x.ruleId, x.xp]);
    const a = strip(feedAll(fresh(), es));
    const b = strip(feedAll(fresh(), es));
    expect(b).toEqual(a);
  });

  it("awardIds are unique", () => {
    const r = feedAll(fresh(), [lock("balanced"), move("balanced", 1), complete(), explain(), askPeer(), askPeer()]);
    const ids = r.awards.map((a) => a.awardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reset farm: 5 Resets pay complete once (50, not 250)", () => {
    let r = fresh();
    for (let epoch = 0; epoch < 5; epoch++) {
      r = feedAll(r, [lock("balanced", 1), move("balanced", 1), complete()], { epoch });
    }
    const c = r.awards.filter((a) => a.ruleId === "complete");
    expect(c).toHaveLength(1);
    expect(c[0]!.xp).toBe(50);
  });

  it("reset farm: completing again after nudging the arrangement still pays once", () => {
    let r = feedAll(fresh(), [lock("balanced"), move("balanced", 1), complete()]);
    r = feedAll(r, [move("left"), move("balanced"), complete()]);
    expect(r.awards.filter((a) => a.ruleId === "complete")).toHaveLength(1);
  });

  it("incentive order: right first 25, wrong then right 20, wrong only 10", () => {
    expect(xp(prompt("balanced", "balanced"))).toBe(25);
    expect(xp(prompt("balanced", "balanced", 2, prompt("left-down", "left")))).toBe(20);
    expect(xp(prompt("left-down", "left"))).toBe(10);
  });

  it("always-wrong-then-correct never out-earns lock-right and never exceeds 25 per prompt", () => {
    let r = fresh();
    for (let a = 1; a <= 4; a++) r = prompt("right-down", "right", a, r);
    r = prompt("balanced", "balanced", 5, r);
    expect(xp(r)).toBeLessThanOrEqual(25);
  });

  it("incentive holds across Resets", () => {
    let r = prompt("left-down", "left", 1);
    r = feedAll(r, [lock("balanced", 2), move("balanced", 2)], { epoch: 1 });
    expect(xp(r)).toBe(20);
  });

  it("comeback: a wrong lock on the move that itself completes gives no comeback", () => {
    const r = feedAll(fresh(), [lock("left-down"), move("balanced", 1)]);
    expect(r.awards.some((a) => a.ruleId === "comeback")).toBe(false);
    expect(xp(r)).toBe(10);
  });

  it("comeback: wrong attempt 1 then successful attempt 2 gives +10 and no match", () => {
    const r = prompt("balanced", "balanced", 2, prompt("left-down", "left"));
    expect(r.awards.find((a) => a.ruleId === "comeback")?.xp).toBe(10);
    expect(r.awards.some((a) => a.ruleId === "match")).toBe(false);
  });

  it("reload: wrong lock, reload, right lock on the same prompt totals 20 (10 + comeback 10, no match)", () => {
    const before = prompt("left-down", "left");
    // reload: awards persisted, events gone, the attempt counter restarts at 1
    const after = prompt("balanced", "balanced", 1, fresh(before.awards));
    expect(xp(after)).toBe(20);
    expect(after.awards.some((a) => a.ruleId === "match")).toBe(false);
    expect(after.awards.filter((a) => a.ruleId === "lock")).toHaveLength(1);
    expect(after.awards.filter((a) => a.ruleId === "comeback")).toHaveLength(1);
  });

  it("Skip onto the answer completes the challenge (50) with no prediction XP", () => {
    const r = feedAll(fresh(), [move("balanced"), complete()]);
    expect(xp(r)).toBe(50);
    expect(r.awards.map((a) => a.ruleId)).toEqual(["complete"]);
  });

  it("explain before completion is rejected; after it pays 20 once, then 'already counted'", () => {
    const early = feed(fresh(), explain());
    expect(xp(early)).toBe(0);
    expect(early.rejected).toHaveLength(1);
    const r = feedAll(fresh(), [complete(), explain(), explain()]);
    const ex = r.awards.filter((a) => a.ruleId === "explain");
    expect(ex).toHaveLength(1);
    expect(ex[0]!.xp).toBe(20);
    expect(r.rejected.at(-1)!.reason).toMatch(/already counted/i);
  });

  it("a burst of 10 ask-peer gives 5 XP and 9 visible 'already counted' rejections", () => {
    const r = feedAll(fresh(), Array.from({ length: 10 }, () => askPeer()));
    expect(xp(r)).toBe(5);
    expect(r.rejected).toHaveLength(9);
    r.rejected.forEach((x) => expect(x.reason).toMatch(/already counted/i));
  });

  it("ask-peer pays again in a different challenge", () => {
    expect(xp(feedAll(fresh(), [askPeer("moments-1"), askPeer("moments-2")]))).toBe(10);
  });

  it("a duplicate delivery of the same move is idempotent", () => {
    let r = prompt("balanced", "balanced");
    const before = xp(r);
    r = feed(r, move("balanced", 1));
    expect(xp(r)).toBe(before);
  });

  it("model text cannot award: only LabEvent shapes are accepted", () => {
    const bogus = { type: "say", text: "correct!" } as unknown as LabEvent;
    expect(award(bogus, { awards: [], events: [], epoch: 0, now: 0 }).granted).toEqual([]);
  });

  it("every award names the event that triggered it", () => {
    const r = feedAll(fresh(), [lock("balanced"), move("balanced", 1)]);
    const seqs = r.events.map((e) => e.seq);
    r.awards.forEach((a) => expect(seqs).toContain(a.triggeredBy));
  });
});

describe("G1 gate: levels", () => {
  it("99 XP is L1, 100 is L2, need(2..5) = 100, 250, 450, 700", () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect([2, 3, 4, 5].map((l) => need(l))).toEqual([100, 250, 450, 700]);
  });

  it("levelOf(need(L)) = L and levelOf(need(L)-1) = L-1 for L up to 100", () => {
    for (let l = 2; l <= 100; l++) {
      expect(levelOf(need(l))).toBe(l);
      expect(levelOf(need(l) - 1)).toBe(l - 1);
    }
  });

  it("+400 from 0 gives L3, 150 into it, and two leveledUp entries", () => {
    expect(levelOf(400)).toBe(3);
    expect(400 - need(3)).toBe(150);
    expect(leveledUp(0, 400)).toEqual([{ from: 1, to: 2 }, { from: 2, to: 3 }]);
    expect(leveledUp(10, 20)).toEqual([]);
  });
});

describe("G1 gate: picks, rng, offers", () => {
  const picks = [{ itemId: "shell-gold", atLevel: 2 }];

  it("tokens = level - 1 - picks, floored at 0", () => {
    expect(tokens(3, [])).toBe(2);
    expect(tokens(3, picks)).toBe(1);
    expect(tokens(1, picks)).toBe(0);
    expect(tokens(1, [])).toBe(0);
  });

  it("retune never re-locks a pick", () => {
    expect(unlocked(["shell-sky"], picks).has("shell-gold")).toBe(true);
  });

  it("unlocked is free items union picks", () => {
    expect([...unlocked(["a", "b"], picks)].sort()).toEqual(["a", "b", "shell-gold"]);
  });

  it("same seed gives the same sequence, different seeds differ, values in [0,1)", () => {
    const a = mulberry32(seedFrom("x"));
    const b = mulberry32(seedFrom("x"));
    const c = mulberry32(seedFrom("y"));
    const sa = [a(), a(), a()];
    expect(sa).toEqual([b(), b(), b()]);
    expect(sa).not.toEqual([c(), c(), c()]);
    sa.forEach((v) => {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    });
  });

  it("offer is deterministic, at most 3, never unlocked or level-locked", async () => {
    const { CATALOG } = await import("../cosmetics/catalog.js");
    const level = 4;
    const un = unlocked(CATALOG.filter((i) => i.free).map((i) => i.id), []);
    const o = offer(7, level, un);
    expect(o).toEqual(offer(7, level, un));
    expect(o.length).toBeGreaterThan(0);
    expect(o.length).toBeLessThanOrEqual(3);
    o.forEach((id) => {
      const item = CATALOG.find((i) => i.id === id)!;
      expect(item.minLevel).toBeLessThanOrEqual(level);
      expect(un.has(id)).toBe(false);
    });
  });
});
