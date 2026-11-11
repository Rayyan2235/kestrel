import { fileURLToPath } from "node:url";
import pg from "pg";
import { expect, it, vi } from "vitest";
import { buildApp } from "./app.js";
import { down, loadMigrations, up } from "./db/migrations.js";
import { pgLedger, type LedgerStore } from "./ledger.js";
import type { LiveProviders } from "./live.js";
import { verifier, type Verifier } from "./verify.js";

const learnerId = "7a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f";
const attemptId = "11111111-2222-4333-8444-555555555555";
const providers: LiveProviders = { agentTurn: vi.fn(), speak: vi.fn(), transcribe: vi.fn() };

function fakeLedger(pending = true): LedgerStore {
  return {
    lock: vi.fn(),
    startAttempt: vi.fn(),
    award: vi.fn().mockResolvedValue({ awarded: true, xp: 100, level: 2 }),
    totals: vi.fn(),
    pendingAttempt: vi.fn().mockResolvedValue(pending),
    startObjective: vi.fn().mockResolvedValue(attemptId),
  };
}

it("puts the claim in S3 before the message that points at it", async () => {
  const order: string[] = [];
  const claims = { put: vi.fn(async (id: string) => (order.push("put"), `replays/${id}.json`)) };
  const queue = { send: vi.fn(async () => void order.push("send")) };
  const claim = { attemptId, learnerId, leftCm: 10, rightCm: 20 };
  await verifier(claims, queue).submit(claim);
  expect(claims.put).toHaveBeenCalledWith(attemptId, claim);
  expect(queue.send).toHaveBeenCalledWith(attemptId, `replays/${attemptId}.json`);
  expect(order).toEqual(["put", "send"]);
});

it("submits a pending prompt trial and a met objective to the verifier", async () => {
  const verify: Verifier = { submit: vi.fn().mockResolvedValue(undefined) };
  const ledger = fakeLedger();
  const app = buildApp(providers, null, ledger, null, verify);
  try {
    expect((await app.inject("/api/health")).json().verifiedXp).toBe(true);
    const prompt = await app.inject({ method: "POST", url: "/api/attempts/submit", payload: { learnerId, attemptId, leftCm: 10, rightCm: 20 } });
    expect(prompt.statusCode).toBe(202);
    expect(ledger.pendingAttempt).toHaveBeenCalledWith(attemptId, learnerId);
    const objective = await app.inject({ method: "POST", url: "/api/attempts/submit", payload: { learnerId, objective: "balance-beam", leftCm: 10.1, rightCm: 20 } });
    expect(objective.statusCode).toBe(202);
    expect(ledger.startObjective).toHaveBeenCalledWith(learnerId, "balance-beam");
    expect(verify.submit).toHaveBeenLastCalledWith({ attemptId, learnerId, leftCm: 10.1, rightCm: 20 });
  } finally {
    await app.close();
  }
});

it("refuses submissions it cannot verify", async () => {
  const verify: Verifier = { submit: vi.fn() };
  const app = buildApp(providers, null, fakeLedger(false), null, verify);
  const off = buildApp(providers, null, fakeLedger(), null, null);
  try {
    const submit = (a: typeof app, payload: object) => a.inject({ method: "POST", url: "/api/attempts/submit", payload });
    expect((await submit(app, { learnerId, attemptId, leftCm: 10, rightCm: 20 })).statusCode).toBe(409); // not pending, or not theirs
    for (const bad of [
      { learnerId, attemptId, leftCm: 4, rightCm: 20 }, // off the rail
      { learnerId, objective: "build-triangle", leftCm: 10, rightCm: 20 }, // no verifier for it
      { learnerId, attemptId, leftCm: 10, rightCm: 20, xp: 100 }, // the client never names XP
    ])
      expect((await submit(app, bad)).statusCode).toBe(400);
    expect(verify.submit).not.toHaveBeenCalled();
    expect((await submit(off, { learnerId, attemptId, leftCm: 10, rightCm: 20 })).statusCode).toBe(503);
    expect((await off.inject("/api/health")).json().verifiedXp).toBe(false);
  } finally {
    await app.close();
    await off.close();
  }
});

it("with a verifier, the browser can no longer award what the verifier owns", async () => {
  const ledger = fakeLedger();
  const app = buildApp(providers, null, ledger, null, { submit: vi.fn() });
  try {
    const award = (payload: object) => app.inject({ method: "POST", url: "/api/xp-events", payload: { learnerId, ...payload } });
    expect((await award({ ruleId: "matched", challengeId: "moments", promptId: "m-10-20" })).statusCode).toBe(409);
    expect((await award({ ruleId: "objective", challengeId: "balance-beam", promptId: "" })).statusCode).toBe(409);
    // Objectives without a verifier yet are still awarded by the ledger.
    expect((await award({ ruleId: "objective", challengeId: "build-triangle", promptId: "" })).statusCode).toBe(200);
    expect(ledger.award).toHaveBeenCalledTimes(1);
  } finally {
    await app.close();
  }
});

// Runs only against a throwaway database: CI starts one; locally `pnpm db:up` then set KESTREL_TEST_DATABASE_URL.
const testUrl = process.env.KESTREL_TEST_DATABASE_URL;
it.runIf(Boolean(testUrl))("stamps objective attempts and finds only this learner's pending trials", async () => {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  await client.query("CREATE SCHEMA IF NOT EXISTS test_submit");
  await client.query("SET search_path TO test_submit");
  const migrations = loadMigrations(fileURLToPath(new URL("../migrations", import.meta.url)));
  try {
    await down(client, migrations, Infinity);
    await up(client, migrations);
    const ledger = pgLedger(client);
    const id = await ledger.startObjective(learnerId, "balance-beam");
    const { rows } = await client.query("SELECT objective, status, trial_started_at IS NOT NULL AS stamped, ok FROM attempts WHERE id = $1", [id]);
    expect(rows[0]).toEqual({ objective: "balance-beam", status: "pending", stamped: true, ok: false });
    expect(await ledger.pendingAttempt(id, learnerId)).toBe(true);
    expect(await ledger.pendingAttempt(id, "9a1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f")).toBe(false);
    await client.query("UPDATE attempts SET status = 'verified' WHERE id = $1", [id]);
    expect(await ledger.pendingAttempt(id, learnerId)).toBe(false);
  } finally {
    await down(client, migrations, Infinity).catch(() => {});
    await client.end();
  }
});
