import type { FastifyInstance } from "fastify";
import pg from "pg";
import {
  AttemptStartSchema,
  LearnerIdSchema,
  LockRequestSchema,
  MOMENTS_PROMPTS,
  XP_RULES,
  XpEventSchema,
  totalsOf,
  type AttemptStart,
  type LockRequest,
  type XpAward,
  type XpEvent,
  type XpTotals,
} from "../../../packages/contracts/src/index.js";
import { retrying } from "./db/retry.js";

/*
 * The XP ledger: an append-only log of awards, one row per (learner, rule,
 * challenge, prompt). XP and level are derived on read, never stored.
 * Client-trusted until P4: the browser reports what the simulator measured;
 * the server stamps the clock, sets the amounts, checks the prediction locks
 * and refuses repeats. Server-side replay verification arrives in P4.
 */
export type LedgerStore = {
  lock(req: LockRequest): Promise<{ lockId: string; lockedAt: string }>;
  /** Null when the lock is unknown or another learner's. */
  startAttempt(req: AttemptStart): Promise<{ attemptId: string; trialStartedAt: string } | null>;
  /** Null when a prompt rule's prediction-lock prerequisite is not met. */
  award(event: XpEvent): Promise<XpAward | null>;
  totals(learnerId: string): Promise<XpTotals>;
};
type Queryable = Pick<pg.Pool, "query">;
const code = (error: unknown) => (error as { code?: string }).code;
const iso = (t: Date | string) => new Date(t).toISOString();

/**
 * Whether a prompt rule may be awarded, from this learner's locks on the prompt, oldest first.
 * locked: any lock. matched: the newest lock predicted the right answer.
 * comeback: matched, after an earlier wrong prediction (a Reset and a second try).
 */
export function eligible(rule: "locked" | "matched" | "comeback", values: string[], answer: string): boolean {
  if (values.length === 0) return false;
  const matched = values.at(-1) === answer;
  if (rule === "locked") return true;
  if (rule === "matched") return matched;
  return matched && values.slice(0, -1).some((v) => v !== answer);
}

export function pgLedger(db: Queryable): LedgerStore {
  /** Registers the learner (the ledger's foreign keys need it) and marks them active. */
  const touch = async (learnerId: string) => {
    try {
      await db.query(
        "INSERT INTO learners (id) VALUES ($1) ON CONFLICT (id) DO UPDATE SET last_seen_at = now()",
        [learnerId],
      );
    } catch (error) {
      // Where ON CONFLICT is unavailable (DSQL, unconfirmed), a duplicate key means the learner exists.
      if (code(error) !== "23505") throw error;
      await db.query("UPDATE learners SET last_seen_at = now() WHERE id = $1", [learnerId]);
    }
  };
  const totals = async (learnerId: string) => {
    const { rows } = await db.query<{ xp: number }>(
      "SELECT coalesce(sum(xp), 0)::int AS xp FROM xp_events WHERE learner_id = $1",
      [learnerId],
    );
    return totalsOf(rows[0]?.xp ?? 0);
  };
  return {
    lock: (req) =>
      retrying(async () => {
        await touch(req.learnerId);
        const { rows } = await db.query<{ id: string; locked_at: Date }>(
          "INSERT INTO prediction_locks (learner_id, challenge_id, prompt_id, value) VALUES ($1, $2, $3, $4) RETURNING id, locked_at",
          [req.learnerId, req.challengeId, req.promptId, req.value],
        );
        return { lockId: rows[0]!.id, lockedAt: iso(rows[0]!.locked_at) };
      }),
    startAttempt: (req) =>
      retrying(async () => {
        const lock = await db.query<{ challenge_id: string }>(
          "SELECT challenge_id FROM prediction_locks WHERE id = $1 AND learner_id = $2",
          [req.lockId, req.learnerId],
        );
        if (lock.rows.length === 0) return null;
        // ok stays false and status pending until the result is verified (P4).
        const { rows } = await db.query<{ id: string; trial_started_at: Date }>(
          "INSERT INTO attempts (learner_id, objective, status, lock_id, trial_started_at, ok) VALUES ($1, $2, 'pending', $3, now(), false) RETURNING id, trial_started_at",
          [req.learnerId, lock.rows[0]!.challenge_id, req.lockId],
        );
        return { attemptId: rows[0]!.id, trialStartedAt: iso(rows[0]!.trial_started_at) };
      }),
    award: (event) =>
      retrying(async () => {
        if (event.ruleId !== "objective") {
          const { rows } = await db.query<{ value: string }>(
            "SELECT value FROM prediction_locks WHERE learner_id = $1 AND challenge_id = $2 AND prompt_id = $3 ORDER BY locked_at",
            [event.learnerId, event.challengeId, event.promptId],
          );
          const answer = MOMENTS_PROMPTS.find((p) => p.id === event.promptId)!.answer;
          if (!eligible(event.ruleId, rows.map((r) => r.value), answer)) return null;
        }
        await touch(event.learnerId);
        let awarded = false;
        try {
          const r = await db.query(
            "INSERT INTO xp_events (learner_id, rule_id, challenge_id, prompt_id, xp, attempt_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
            [event.learnerId, event.ruleId, event.challengeId, event.promptId, XP_RULES[event.ruleId], event.attemptId ?? null],
          );
          awarded = r.rowCount === 1;
        } catch (error) {
          // The unique key refused a repeat: already awarded, not an error.
          if (code(error) !== "23505") throw error;
        }
        return { awarded, ...(await totals(event.learnerId)) };
      }),
    totals: (learnerId) => retrying(() => totals(learnerId)),
  };
}

export function registerLedger(app: FastifyInstance, ledger: LedgerStore | null) {
  const off = { message: "The XP ledger is not connected. Set DATABASE_URL and run pnpm db:migrate." };
  const failed = { message: "The XP ledger is unavailable." };
  app.post("/api/locks", async (request, reply) => {
    const parsed = LockRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid prediction lock." });
    if (!ledger) return reply.code(503).send(off);
    try {
      return reply.code(201).send(await ledger.lock(parsed.data));
    } catch {
      return reply.code(502).send(failed);
    }
  });
  app.post("/api/attempts/start", async (request, reply) => {
    const parsed = AttemptStartSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid attempt start." });
    if (!ledger) return reply.code(503).send(off);
    try {
      const started = await ledger.startAttempt(parsed.data);
      if (!started) return reply.code(409).send({ message: "Lock a prediction before the trial starts." });
      return reply.code(201).send(started);
    } catch {
      return reply.code(502).send(failed);
    }
  });
  app.post("/api/xp-events", async (request, reply) => {
    const parsed = XpEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "Invalid XP event." });
    if (!ledger) return reply.code(503).send(off);
    try {
      const award = await ledger.award(parsed.data);
      if (!award) return reply.code(409).send({ message: "No prediction lock earns this award." });
      return award;
    } catch {
      return reply.code(502).send(failed);
    }
  });
  app.get<{ Params: { learner: string } }>("/api/xp/:learner", async (request, reply) => {
    const learner = LearnerIdSchema.safeParse(request.params.learner);
    if (!learner.success) return reply.code(400).send({ message: "Invalid learner ID." });
    if (!ledger) return reply.code(503).send(off);
    try {
      return await ledger.totals(learner.data);
    } catch {
      return reply.code(502).send(failed);
    }
  });
}
