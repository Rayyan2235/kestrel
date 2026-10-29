import { fileURLToPath } from "node:url";
import pg from "pg";
import { expect, it } from "vitest";
import { retrying } from "../progress.js";
import { down, loadMigrations, up } from "./migrations.js";

const dir = fileURLToPath(new URL("../../migrations", import.meta.url));
const migrations = loadMigrations(dir);
const TABLES = ["learners", "prediction_locks", "attempts", "xp_events", "concept_mastery", "prompt_stats"];

it("pairs every migration with a down, one DSQL-safe statement each", () => {
  expect(migrations.map((m) => m.version)).toEqual(migrations.map((_, i) => String(i + 1).padStart(4, "0")));
  for (const m of migrations) {
    for (const sql of [m.up, m.down]) {
      expect(sql, m.name).not.toMatch(/\b(SERIAL|BIGSERIAL|SEQUENCE)\b/i); // ids are uuids
      expect(sql, m.name).not.toMatch(/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i); // DSQL needs ASYNC; keep keys inline
      expect(sql, m.name).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i); // no DML beside DDL
    }
    expect(m.up, m.name).toMatch(/IF NOT EXISTS/);
    expect(m.down, m.name).toMatch(/IF EXISTS/);
  }
});

it("retries a DSQL optimistic-concurrency conflict (40001) and nothing else", async () => {
  let calls = 0;
  const conflict = Object.assign(new Error("change conflicts"), { code: "40001" });
  expect(await retrying(async () => (++calls < 3 ? Promise.reject(conflict) : "ok"))).toBe("ok");
  expect(calls).toBe(3);
  calls = 0;
  await expect(retrying(async () => (calls++, Promise.reject(Object.assign(new Error("dup"), { code: "23505" }))))).rejects.toThrow("dup");
  expect(calls).toBe(1);
});

// Runs only against a throwaway database: CI starts one; locally `pnpm db:up` then set KESTREL_TEST_DATABASE_URL.
const testUrl = process.env.KESTREL_TEST_DATABASE_URL;
it.runIf(Boolean(testUrl))("migrates up, all the way down, and up again on a clean database", async () => {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  // Its own schema, so other database tests in parallel never see these tables.
  await client.query("CREATE SCHEMA IF NOT EXISTS test_migrations");
  await client.query("SET search_path TO test_migrations");
  const tables = async () =>
    (await client.query<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema()"))
      .rows.map((r) => r.t).filter((t) => TABLES.includes(t)).sort();
  try {
    await down(client, migrations, Infinity);
    expect(await tables()).toEqual([]);
    expect(await up(client, migrations)).toHaveLength(migrations.length);
    expect(await tables()).toEqual([...TABLES].sort());
    expect(await up(client, migrations)).toEqual([]); // already applied: a no-op

    // The ledger key makes a repeated award a no-op.
    const learner = "2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f";
    await client.query("INSERT INTO learners (id) VALUES ($1)", [learner]);
    const award = "INSERT INTO xp_events (learner_id, rule_id, challenge_id, prompt_id, xp) VALUES ($1, 'balanced', 'balance-beam', 'p1', 15) ON CONFLICT DO NOTHING";
    expect((await client.query(award, [learner])).rowCount).toBe(1);
    expect((await client.query(award, [learner])).rowCount).toBe(0);

    expect(await down(client, migrations, Infinity)).toHaveLength(migrations.length);
    expect(await tables()).toEqual([]);
    expect(await up(client, migrations)).toHaveLength(migrations.length);
    expect(await tables()).toEqual([...TABLES].sort());
  } finally {
    await client.end();
  }
});

it.runIf(Boolean(testUrl))("moves a legacy Tiger attempts table aside and copies its rows across once", async () => {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS test_legacy CASCADE");
  await client.query("CREATE SCHEMA test_legacy");
  await client.query("SET search_path TO test_legacy");
  try {
    // The shape the old app created at startup (without the Timescale hypertable call).
    await client.query(`CREATE TABLE attempts (
      learner_id text NOT NULL, objective text NOT NULL, at timestamptz NOT NULL DEFAULT now(),
      ok boolean NOT NULL, tilt_deg double precision, left_cm double precision, right_cm double precision)`);
    await client.query(
      "INSERT INTO attempts (learner_id, objective, ok, tilt_deg, left_cm, right_cm) VALUES ($1, 'balance-beam', true, 0.2, 10, 20), ('not-a-uuid', 'rescue-pip', true, null, null, null)",
      ["2f1c8f3e-6a4b-4c1d-9e2f-0a1b2c3d4e5f"],
    );

    expect(await up(client, migrations)).toHaveLength(migrations.length);
    const copied = await client.query("SELECT objective, status, tilt_deg FROM attempts");
    expect(copied.rows).toEqual([{ objective: "balance-beam", status: "unverified", tilt_deg: 0.2 }]);
    expect((await client.query("SELECT count(*)::int AS n FROM attempts_legacy")).rows[0].n).toBe(2);

    // Running again copies nothing twice.
    expect(await up(client, migrations)).toEqual([]);
    expect((await client.query("SELECT count(*)::int AS n FROM attempts")).rows[0].n).toBe(1);
  } finally {
    await client.query("DROP SCHEMA IF EXISTS test_legacy CASCADE").catch(() => {});
    await client.end();
  }
});
