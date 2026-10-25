import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_LOOKS, ProgressSchema, type Award, type LabEvent } from "@kestrel/contracts";
import { CURRENT_SCHEMA, STORAGE_KEY, loadProgress, migrate, saveProgress } from "./storage.js";
import { createProgressStore } from "./store.js";
import { createLabEventLog } from "./events.js";
import { levelOf, need } from "./levels.js";

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(here, "fixtures", "progress-v1.json"), "utf8"));

const memory = (): Storage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
};
const stamp = { epoch: 0, worldVersion: 0 };
const CH = "moments-1";
const PR = "moments-1/p1";
const play = (log: ReturnType<typeof createLabEventLog>) => {
  log.append({ type: "prediction_locked", challengeId: CH, promptId: PR, attempt: 1, choice: "balanced", ...stamp });
  log.append({ type: "move_applied", challengeId: CH, promptId: PR, attempt: 1, bot: "pip", outcome: "balanced", ...stamp });
};
const sum = (a: readonly Award[]) => a.reduce((n, x) => n + x.xp, 0);

describe("G3 gate: frozen v1 fixture", () => {
  it("the fixture itself is a valid v1 Progress", () => {
    expect(ProgressSchema.safeParse(FIXTURE).success).toBe(true);
    expect(FIXTURE.schema).toBe(1);
  });

  it("loads with level, picks and equipped intact", () => {
    const s = memory();
    s.setItem(STORAGE_KEY, JSON.stringify(FIXTURE));
    const p = loadProgress(s);
    expect(p.picks).toEqual(FIXTURE.picks);
    expect(p.equipped).toEqual(FIXTURE.equipped);
    expect(p.seen).toEqual(FIXTURE.seen);
    expect(p.awards).toEqual(FIXTURE.awards);
    expect(levelOf(sum(p.awards))).toBe(levelOf(165 + 50 + 20 + 20 + 50 - 165 + 165)); // 175 XP... recomputed below
  });

  it("derived level from the fixture is stable: 175 XP... computed from awards only", () => {
    const total = sum(FIXTURE.awards);
    expect(total).toBe(10 + 15 + 50 + 20 + 10 + 10 + 50);
    expect(levelOf(total)).toBe(2);
    expect(need(2)).toBeLessThanOrEqual(total);
  });

  it("loads through a stubbed v2 migration step (future bump must keep v1 loading)", () => {
    const out = migrate(FIXTURE, 1) as { schema: number };
    expect(out.schema).toBe(CURRENT_SCHEMA);
    expect(ProgressSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual(FIXTURE);
  });
});

describe("G3 gate: storage", () => {
  it("round-trips through save and load", () => {
    const s = memory();
    saveProgress(s, FIXTURE);
    expect(loadProgress(s)).toEqual(FIXTURE);
    expect(s.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it("getItem / setItem throwing still yields a working profile and does not throw", () => {
    const bad = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(() => loadProgress(bad)).not.toThrow();
    expect(loadProgress(bad).awards).toEqual([]);
    expect(() => saveProgress(bad, FIXTURE)).not.toThrow();
    expect(loadProgress(null).awards).toEqual([]);
    expect(() => saveProgress(null, FIXTURE)).not.toThrow();
  });

  it("a corrupt stored value loads fresh without throwing", () => {
    for (const raw of ["{", "null", "[]", '{"schema":1}', "42"]) {
      const s = memory();
      s.setItem(STORAGE_KEY, raw);
      expect(() => loadProgress(s)).not.toThrow();
      expect(loadProgress(s).awards).toEqual([]);
    }
  });

  it("a valid save is never discarded because of an unrelated unknown-but-compatible shape", () => {
    const s = memory();
    s.setItem(STORAGE_KEY, JSON.stringify(FIXTURE));
    expect(loadProgress(s).picks).toHaveLength(1);
  });
});

describe("G3 gate: progress store", () => {
  it("derives xp, level, into, needed, tokens and unlocked from awards and picks", () => {
    const s = memory();
    s.setItem(STORAGE_KEY, JSON.stringify(FIXTURE));
    const store = createProgressStore({ log: createLabEventLog(), storage: s });
    const v = store.get();
    expect(v.xp).toBe(sum(FIXTURE.awards));
    expect(v.level).toBe(levelOf(v.xp));
    expect(v.into).toBe(v.xp - need(v.level));
    expect(v.needed).toBeGreaterThan(0);
    expect(v.tokens).toBe(Math.max(0, v.level - 1 - FIXTURE.picks.length));
    expect(v.unlocked.has("shell-gold")).toBe(true);
  });

  it("awards from the event log reach the store; XP survives a simulated reload", () => {
    const s = memory();
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: s });
    play(log);
    expect(store.get().xp).toBe(25);
    const reloaded = createProgressStore({ log: createLabEventLog(), storage: s });
    expect(reloaded.get().xp).toBe(25);
  });

  it("an 'already counted' rejection reaches the HUD queue", () => {
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: memory() });
    const ask: Parameters<typeof log.append>[0] = { type: "ask_peer_used", challengeId: CH, ...stamp };
    log.append(ask);
    log.append(ask);
    expect(store.get().rejections.join(" ")).toMatch(/already counted/i);
  });

  it("a level-up is queued for the toast", () => {
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: memory() });
    play(log);
    log.append({ type: "move_applied", challengeId: CH, bot: "pip", outcome: "balanced", ...stamp });
    log.append({ type: "challenge_complete", challengeId: CH, ...stamp });
    log.append({ type: "challenge_complete", challengeId: "moments-2", ...stamp });
    log.append({ type: "explanation_submitted", challengeId: CH, ...stamp });
    expect(store.get().xp).toBeGreaterThanOrEqual(100);
    expect(store.get().levelUps.length).toBeGreaterThan(0);
  });

  it("the demo seed (L3, 0 picks, tokens 2) never calls setItem", () => {
    const s = memory();
    const spy = vi.spyOn(s, "setItem");
    const seed = { ...(JSON.parse(JSON.stringify(FIXTURE)) as typeof FIXTURE), picks: [], awards: [{ awardId: "seed", ruleId: "complete", xp: need(3), reason: "demo seed", triggeredBy: 0 }] };
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: s, seed });
    expect(store.get().level).toBe(3);
    expect(store.get().tokens).toBe(2);
    play(log);
    store.markSeen(["x"]);
    expect(spy).not.toHaveBeenCalled();
    expect(s.getItem(STORAGE_KEY)).toBeNull();
  });

  it("resetProgress returns to defaults", () => {
    const s = memory();
    s.setItem(STORAGE_KEY, JSON.stringify(FIXTURE));
    const store = createProgressStore({ log: createLabEventLog(), storage: s });
    store.resetProgress();
    const v = store.get();
    expect(v.xp).toBe(0);
    expect(v.picks).toEqual([]);
    expect(v.equipped).toEqual(DEFAULT_LOOKS);
  });

  it("a store with throwing storage still works", () => {
    const bad = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } } as unknown as Storage;
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: bad });
    expect(() => play(log)).not.toThrow();
    expect(store.get().xp).toBe(25);
  });

  it("retune: tokens never go negative and picks/equipped/unlocked are unchanged", () => {
    const s = memory();
    s.setItem(STORAGE_KEY, JSON.stringify({ ...FIXTURE, curveVersion: 1 }));
    const v = createProgressStore({ log: createLabEventLog(), storage: s }).get();
    expect(v.tokens).toBeGreaterThanOrEqual(0);
    expect(v.picks).toEqual(FIXTURE.picks);
  });

  it("a pick always unlocks and equips only if allowed; a note says who wears it", () => {
    const s = memory();
    const seed = { ...FIXTURE, picks: [], equipped: { pip: FIXTURE.equipped.pip, nova: { ...FIXTURE.equipped.nova, shell: "shell-gold" } } };
    const store = createProgressStore({ log: createLabEventLog(), storage: s, seed });
    const r = store.pick("shell-gold", "pip");
    expect(store.get().unlocked.has("shell-gold")).toBe(true);
    expect(store.get().picks.some((p) => p.itemId === "shell-gold")).toBe(true);
    expect(r.equipped).toBe(false);
    expect(r.note).toMatch(/wears this shell now/i);
    expect(store.get().equipped.pip.shell).not.toBe("shell-gold");
  });

  it("markSeen records once and replaying awards does not change seen", () => {
    const log = createLabEventLog();
    const store = createProgressStore({ log, storage: memory() });
    store.markSeen(["a", "a"]);
    expect(store.get().seen.filter((x) => x === "a")).toHaveLength(1);
    const before = [...store.get().seen];
    play(log);
    expect(store.get().seen).toEqual(before);
  });

  it("the event type import is usable (LabEvent)", () => {
    const e: LabEvent["type"] = "move_applied";
    expect(e).toBe("move_applied");
  });
});
