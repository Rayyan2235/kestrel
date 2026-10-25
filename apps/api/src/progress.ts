import type { FastifyInstance } from "fastify";
import pg from "pg";
import { AttemptSchema, LearnerIdSchema, type Attempt, type Progress } from "../../../packages/contracts/src/index.js";

/** Where attempts live. Only the anonymous learner ID and the measurements are stored. */
export type ProgressStore = {
  record(attempt: Attempt): Promise<void>;
  progress(learnerId: string): Promise<Progress>;
};
type Queryable = Pick<pg.Pool, "query">;

// A hypertable partitioned on time, so attempts are Tiger Data (TimescaleDB) time series.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS attempts (
    learner_id text NOT NULL,
    objective text NOT NULL,
    at timestamptz NOT NULL DEFAULT now(),
    ok boolean NOT NULL,
    tilt_deg double precision,
    left_cm double precision,
    right_cm double precision
  )`,
  `SELECT create_hypertable('attempts', by_range('at'), if_not_exists => TRUE)`,
  `CREATE INDEX IF NOT EXISTS attempts_learner_at ON attempts (learner_id, at DESC)`,
];

export function pgStore(db: Queryable): ProgressStore {
  return {
    async record(a) {
      await db.query(
        "INSERT INTO attempts (learner_id, objective, ok, tilt_deg, left_cm, right_cm) VALUES ($1, $2, $3, $4, $5, $6)",
        [a.learnerId, a.objective, a.ok, a.tiltDeg, a.leftCm, a.rightCm],
      );
    },
    async progress(learnerId) {
      const { rows } = await db.query<{ objective: Attempt["objective"]; attempts: number; earned: boolean }>(
        "SELECT objective, count(*)::int AS attempts, bool_or(ok) AS earned FROM attempts WHERE learner_id = $1 GROUP BY objective",
        [learnerId],
      );
      return {
        earned: rows.filter((r) => r.earned).map((r) => r.objective),
        attempts: Object.fromEntries(rows.map((r) => [r.objective, r.attempts])),
      };
    },
  };
}

/** Connect and create the hypertable. Without a URL, or if the database is unreachable, progress stays off. */
export async function connectProgress(url = process.env.TIGER_DATABASE_URL): Promise<{ store: ProgressStore; close(): Promise<void> } | null> {
  if (!url) return null;
  const pool = new pg.Pool({ connectionString: url, max: 4, connectionTimeoutMillis: 5000 });
  try {
    for (const sql of SCHEMA) await pool.query(sql);
    return { store: pgStore(pool), close: () => pool.end() };
  } catch (error) {
    // The code only: a driver message can echo the host or user.
    console.error(`Tiger Data unavailable (${(error as { code?: string }).code ?? "error"}); progress is not stored.`);
    await pool.end().catch(() => {});
    return null;
  }
}

export function registerProgress(app: FastifyInstance, store: ProgressStore | null) {
  const off = { message: "Progress storage is not connected. Set TIGER_DATABASE_URL in the server .env." };
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
      return await store.progress(learner.data);
    } catch {
      return reply.code(502).send({ message: "Could not read progress." });
    }
  });
}
