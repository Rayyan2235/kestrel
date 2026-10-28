// pnpm db:migrate [up | down <n|all> --yes | status]. Runs from apps/api.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { down, loadMigrations, up } from "./migrations.js";

const envFile = [resolve("../../.env"), resolve(".env")].find(existsSync);
if (envFile) process.loadEnvFile(envFile);

// DATABASE_URL only: the legacy Tiger `attempts` hypertable has another shape and is never migrated.
const url = process.env.DATABASE_URL;
const [command = "up", arg, confirm] = process.argv.slice(2);

if (!url) {
  console.log("DATABASE_URL is not set; nothing to migrate.");
  process.exit(0);
}
const migrations = loadMigrations(resolve("migrations"));
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  if (command === "up") {
    const ran = await up(client, migrations);
    console.log(ran.length ? `Applied ${ran.join(", ")}.` : "Schema is up to date.");
  } else if (command === "down") {
    // Down drops tables and their data, so it never runs by accident.
    if (confirm !== "--yes") throw new Error("down drops tables and data: run `down <n|all> --yes`.");
    const steps = arg === "all" ? Infinity : Number(arg ?? 1);
    if (!(steps >= 1)) throw new Error("down needs a count or `all`.");
    const reverted = await down(client, migrations, steps);
    console.log(reverted.length ? `Reverted ${reverted.join(", ")}.` : "Nothing to revert.");
  } else if (command === "status") {
    const { rows } = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations ORDER BY version",
    ).catch(() => ({ rows: [] as { version: string }[] }));
    const done = new Set(rows.map((r) => r.version));
    for (const m of migrations) console.log(`${done.has(m.version) ? "applied" : "pending"}  ${m.version}_${m.name}`);
  } else throw new Error(`Unknown command: ${command}`);
} catch (error) {
  // The message and code only: never the connection string.
  const e = error as { code?: string; message?: string };
  console.error(`Migration failed${e.code ? ` (${e.code})` : ""}: ${e.message ?? "error"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
