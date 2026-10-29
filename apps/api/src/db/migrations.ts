import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Versioned, reversible schema changes: numbered `NNNN_name.up.sql` and
 * `NNNN_name.down.sql` files, one DDL statement each, applied in order and
 * recorded in `schema_migrations`.
 *
 * Aurora DSQL rules (ADR-002) shape the runner: each DDL statement runs in its
 * own transaction and is never mixed with DML, so the bookkeeping row is
 * written in a second transaction. Every statement uses IF [NOT] EXISTS, so a
 * crash between the two only means the next run repeats a harmless no-op.
 */
export type Migration = { version: string; name: string; up: string; down: string };
type Db = { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> };

const FILE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/;

/** Statement text without `--` comments and the final semicolon. */
export function statementOf(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .trim()
    .replace(/;\s*$/, "");
}

/** Reads and checks the migrations folder: paired files, one statement each, in order. */
export function loadMigrations(dir: string): Migration[] {
  const byVersion = new Map<string, Partial<Migration>>();
  for (const file of readdirSync(dir)) {
    const m = FILE.exec(file);
    if (!m) throw new Error(`Unexpected file in migrations: ${file}`);
    const [, version, name, direction] = m as unknown as [string, string, string, "up" | "down"];
    const entry = byVersion.get(version) ?? { version, name };
    if (entry.name !== name) throw new Error(`Migration ${version} has two names: ${entry.name}, ${name}`);
    const sql = statementOf(readFileSync(join(dir, file), "utf8"));
    if (!sql) throw new Error(`${file} is empty.`);
    if (sql.includes(";")) throw new Error(`${file} has more than one statement; DSQL allows one DDL per transaction.`);
    entry[direction] = sql;
    byVersion.set(version, entry);
  }
  const out = [...byVersion.values()].sort((a, b) => a.version!.localeCompare(b.version!));
  for (const m of out) if (!m.up || !m.down) throw new Error(`Migration ${m.version} needs both .up.sql and .down.sql.`);
  return out as Migration[];
}

const LEDGER = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  name text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

async function applied(db: Db): Promise<string[]> {
  await db.query(LEDGER);
  const { rows } = await db.query("SELECT version FROM schema_migrations ORDER BY version");
  return (rows as { version: string }[]).map((r) => r.version);
}

async function ddl(db: Db, sql: string) {
  await db.query("BEGIN");
  try {
    await db.query(sql);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/*
 * The legacy Tiger Data `attempts` hypertable predates migrations: it has no id or status
 * and would make 0003 a silent no-op. Before migrating, rename it out of the way; after,
 * copy its rows across. This is code, not a migration file, because it is conditional and
 * DSQL has no PL/pgSQL; on a database without the legacy table both steps do nothing.
 */
const LEGACY = "attempts_legacy";

async function columns(db: Db, table: string): Promise<string[]> {
  const { rows } = await db.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1",
    [table],
  );
  return (rows as { column_name: string }[]).map((r) => r.column_name);
}

/** Renames a legacy-shaped `attempts` (no id column) to attempts_legacy. True if it did. */
export async function adoptLegacy(db: Db): Promise<boolean> {
  const cols = await columns(db, "attempts");
  if (cols.length === 0 || cols.includes("id")) return false;
  if ((await columns(db, LEGACY)).length > 0) throw new Error(`Both attempts (legacy shape) and ${LEGACY} exist; resolve by hand.`);
  await ddl(db, `ALTER TABLE attempts RENAME TO ${LEGACY}`);
  return true;
}

/**
 * Copies legacy rows into the migrated `attempts` once each (matched on learner, objective
 * and time), as unverified. Rows whose learner ID is not a UUID stay behind. Returns rows copied.
 */
export async function copyLegacy(db: Db): Promise<number> {
  if ((await columns(db, LEGACY)).length === 0 || !(await columns(db, "attempts")).includes("id")) return 0;
  const r = await db.query(
    `INSERT INTO attempts (learner_id, objective, at, ok, tilt_deg, left_cm, right_cm)
     SELECT l.learner_id::uuid, l.objective, l.at, l.ok, l.tilt_deg, l.left_cm, l.right_cm
     FROM ${LEGACY} l
     WHERE l.learner_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       AND NOT EXISTS (
         SELECT 1 FROM attempts a
         WHERE a.learner_id = l.learner_id::uuid AND a.objective = l.objective AND a.at = l.at
       )`,
  );
  return (r as { rowCount?: number | null }).rowCount ?? 0;
}

/** Applies every pending migration in order. Returns the versions applied. */
export async function up(db: Db, migrations: Migration[]): Promise<string[]> {
  await adoptLegacy(db);
  const done = new Set(await applied(db));
  const ran: string[] = [];
  for (const m of migrations) {
    if (done.has(m.version)) continue;
    await ddl(db, m.up);
    await db.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2) ON CONFLICT DO NOTHING", [m.version, m.name]);
    ran.push(m.version);
  }
  await copyLegacy(db);
  return ran;
}

/** Reverts the newest `steps` applied migrations (all of them for Infinity). Returns the versions reverted. */
export async function down(db: Db, migrations: Migration[], steps = 1): Promise<string[]> {
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const reverted: string[] = [];
  for (const version of (await applied(db)).reverse().slice(0, steps)) {
    const m = byVersion.get(version);
    if (!m) throw new Error(`Applied migration ${version} has no file; refusing to guess how to revert it.`);
    await ddl(db, m.down);
    await db.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
    reverted.push(version);
  }
  return reverted;
}
