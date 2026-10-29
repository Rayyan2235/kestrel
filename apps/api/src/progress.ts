import type { FastifyInstance } from "fastify";
import pg from "pg";
import { AttemptSchema, LearnerIdSchema, ObjectiveIdSchema, type Attempt, type Progress } from "../../../packages/contracts/src/index.js";
import { retrying } from "./db/retry.js";
import { pgLedger, type LedgerStore } from "./ledger.js";

/** Where attempts live. Only the anonymous learner ID and the measurements are stored. */
export type ProgressStore = {
  record(attempt: Attempt): Promise<void>;
  progress(learnerId: string): Promise<Progress>;
};
type Queryable = Pick<pg.Pool, "query">;

// The schema lives in apps/api/migrations (run `pnpm db:migrate`); startup no longer creates tables.
// Inserts name only the columns the legacy Tiger hypertable also has, so it keeps working until moved.

export { retrying } from "./db/retry.js";

export function pgStore(db: Queryable): ProgressStore {
  return {
    async record(a) {
      await retrying(() => db.query(
        "INSERT INTO attempts (learner_id, objective, ok, tilt_deg, left_cm, right_cm) VALUES ($1, $2, $3, $4, $5, $6)",
        [a.learnerId, a.objective, a.ok, a.tiltDeg, a.leftCm, a.rightCm],
      ));
    },
    async progress(learnerId) {
      const { rows } = await retrying(() => db.query<{ objective: Attempt["objective"]; attempts: number; earned: boolean }>(
        "SELECT objective, count(*)::int AS attempts, bool_or(ok) AS earned FROM attempts WHERE learner_id = $1 GROUP BY objective",
        [learnerId],
      ));
      // Moments prompt trials share the table; only objectives belong on the board.
      const objectives = rows.filter((r) => ObjectiveIdSchema.safeParse(r.objective).success);
      return {
        earned: objectives.filter((r) => r.earned).map((r) => r.objective),
        attempts: Object.fromEntries(objectives.map((r) => [r.objective, r.attempts])),
      };
    },
  };
}

/**
 * Connect and check the `attempts` table is there. Without a URL, if the database is
 * unreachable, or if it was never migrated, progress stays off.
 * DATABASE_URL is the migrated schema; TIGER_DATABASE_URL is the legacy hypertable, still read until moved.
 */
export async function connectProgress(
  url = process.env.DATABASE_URL || process.env.TIGER_DATABASE_URL,
): Promise<{ store: ProgressStore; ledger: LedgerStore | null; close(): Promise<void> } | null> {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 });
  try {
    await pool.query("SELECT 1 FROM attempts LIMIT 0");
    // The legacy Tiger hypertable has attempts but no ledger: progress works, XP stays in the browser.
    const ledger = await pool.query("SELECT 1 FROM xp_events LIMIT 0").then(() => pgLedger(pool), () => null);
    return { store: pgStore(pool), ledger, close: () => pool.end() };
  } catch (error) {
    // The code only: a driver message can echo the host or user.
    const code = (error as { code?: string }).code ?? "error";
    const hint = code === "42P01" ? " Run `pnpm db:migrate`." : "";
    console.error(`Progress database unavailable (${code}); progress is not stored.${hint}`);
    await pool.end().catch(() => {});
    return null;
  }
}

export function registerProgress(app: FastifyInstance, store: ProgressStore | null, ledger: LedgerStore | null = null) {
  const off = { message: "Progress storage is not connected. Set DATABASE_URL in the server .env and run pnpm db:migrate." };
  app.post("/api/progress", async (request, reply) => {
    const parsed = AttemptSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid attempt." });
    if (!store) return reply.code(503).send(off);
    try {
      await store.record(parsed.data);
      return reply.code(201).send({ ok: true });
    } catch {
      return reply.code(502).send({ message: "Could not store the attempt." });
    }
  });
  app.get<{ Params: { learner: string } }>("/api/progress/:learner", async (request, reply) => {
    const learner = LearnerIdSchema.safeParse(request.params.learner);
    if (!learner.success) return reply.code(400).send({ message: "Invalid learner ID." });
    if (!store) return reply.code(503).send(off);
    try {
      const progress = await store.progress(learner.data);
      // XP and level from the ledger, derived on read; left out when there is no ledger.
      const totals = ledger ? await ledger.totals(learner.data).catch(() => null) : null;
      return totals ? { ...progress, ...totals } : progress;
    } catch {
      return reply.code(502).send({ message: "Could not read progress." });
    }
  });
}
