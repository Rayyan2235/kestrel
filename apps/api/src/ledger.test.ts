import { fileURLToPath } from "node:url";
import pg from "pg";
import { expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { down, loadMigrations, up } from "./db/migrations.js";
import { eligible, pgLedger } from "./ledger.js";
import type { LiveProviders } from "./live.js";

const learnerId = "7a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f";
const providers: LiveProviders = { agentTurn: vi.fn(), speak: vi.fn(), transcribe: vi.fn() };

it("awards a comeback only for a right prediction after a wrong one", () => {
  expect(eligible("locked", [], "level")).toBe(false);
  expect(eligible("locked", ["left"], "level")).toBe(true);
  expect(eligible("matched", ["left"], "level")).toBe(false);
  expect(eligible("matched", ["level"], "level")).toBe(true);
  expect(eligible("comeback", ["level"], "level")).toBe(false); // right first time: no bonus
  expect(eligible("comeback", ["left", "level"], "level")).toBe(true);
  expect(eligible("comeback", ["left", "level", "right"], "level")).toBe(false);
});

it("refuses malformed ledger requests and answers 503 without a database", async () => {
  const app = buildApp(providers, null, null);
  try {
    const lock = { learnerId, challengeId: "moments", promptId: "m-10-20", value: "level" };
    expect((await app.inject({ method: "POST", url: "/api/locks", payload: { ...lock, promptId: "m-99" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/locks", payload: lock })).statusCode).toBe(503);
    const award = { learnerId, ruleId: "matched", challengeId: "moments", promptId: "m-10-20" };
    expect((await app.inject({ method: "POST", url: "/api/xp-events", payload: { ...award, xp: 500 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/xp-events", payload: award })).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});

// Runs only against a throwaway database: CI starts one; locally `pnpm db:up` then set KESTREL_TEST_DATABASE_URL.
const testUrl = process.env.KESTREL_TEST_DATABASE_URL;
it.runIf(Boolean(testUrl))("awards each event once, and Reset then retry earns no extra XP", async () => {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  // Its own schema, so other database tests in parallel never see these tables.
  await client.query("CREATE SCHEMA IF NOT EXISTS test_ledger");
  await client.query("SET search_path TO test_ledger");
  const migrations = loadMigrations(fileURLToPath(new URL("../migrations", import.meta.url)));
  try {
    await down(client, migrations, Infinity);
    await up(client, migrations);
    const ledger = pgLedger(client);
    const prompt = { learnerId, challengeId: "moments" as const, promptId: "m-10-20" };
    const award = (ruleId: "locked" | "matched" | "comeback") => ledger.award({ ...prompt, ruleId });

    // No lock, no award; no lock, no trial.
    expect(await award("locked")).toBeNull();
    expect(await ledger.startAttempt({ learnerId, lockId: "00000000-0000-4000-8000-000000000000" })).toBeNull();

    // First try: predicted wrong. Locking earns 10; nothing else.
    const first = await ledger.lock({ ...prompt, value: "left" });
    const started = await ledger.startAttempt({ learnerId, lockId: first.lockId });
    expect(new Date(started!.trialStartedAt) >= new Date(first.lockedAt)).toBe(true);
    expect(await award("locked")).toEqual({ awarded: true, xp: 10, level: 1 });
    expect(await award("matched")).toBeNull();

    // The same event twice gives one row.
    expect(await award("locked")).toEqual({ awarded: false, xp: 10, level: 1 });
    const rows = await client.query("SELECT count(*)::int AS n FROM xp_events WHERE learner_id = $1 AND rule_id = 'locked'", [learnerId]);
    expect(rows.rows[0].n).toBe(1);

    // Reset, second try, right: matched and comeback. 35, the cap.
    await ledger.lock({ ...prompt, value: "level" });
    expect((await award("matched"))!.awarded).toBe(true);
    expect(await award("comeback")).toEqual({ awarded: true, xp: 35, level: 1 });

    // Reset-farm: more tries on the same prompt earn nothing more.
    for (let i = 0; i < 3; i++) {
      await ledger.lock({ ...prompt, value: i % 2 ? "level" : "right" });
      for (const rule of ["locked", "matched", "comeback"] as const) {
        const r = await award(rule);
        if (r) expect(r.awarded).toBe(false);
      }
    }
    expect(await ledger.totals(learnerId)).toEqual({ xp: 35, level: 1 });

    // An objective win is 100 once; level 2 at 135.
    const win = { learnerId, ruleId: "objective" as const, challengeId: "balance-beam" as const, promptId: "" as const };
    expect(await ledger.award(win)).toEqual({ awarded: true, xp: 135, level: 2 });
    expect(await ledger.award(win)).toEqual({ awarded: false, xp: 135, level: 2 });
  } finally {
    await down(client, migrations, Infinity).catch(() => {});
    await client.end();
  }
});
