import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { DEMO_MIN_LEARNERS, type Insights, type PromptInsight } from "../../../packages/contracts/src/index.js";
import { retrying } from "./db/retry.js";
import { sameSecret } from "./edge.js";

// GET /api/owner/insights: the owner-only summary of what the nightly job
// (verifier/kestrel_analytics) wrote. There are no teacher accounts. One
// owner token, a SecureString in SSM on AWS (OWNER_TOKEN_PARAM, loaded by
// secrets/ssm.ts) or OWNER_TOKEN locally, sent as `Authorization: Bearer`.
// Only aggregates leave the server, never a learner id.

export type InsightsStore = { insights(): Promise<Insights> };
type Queryable = Pick<pg.Pool, "query">;

/** A shorter token is treated as unset: it would be guessable through the 20 req/s route limit. */
export const MIN_TOKEN_CHARS = 32;

type ConceptRow = { concept: string; learners: number; mean_mastery: number; evidence: number; updated_at: Date | null };
type PromptRow = { challenge_id: string; prompt_id: string; attempts: number; successes: number; median_tries: number | null; updated_at: Date | null };

// The same smoothing kestrel_analytics/model.py ranks by.
const rate = (successes: number, attempts: number) => (successes + 1) / (attempts + 2);

export function summarize(concepts: ConceptRow[], prompts: PromptRow[], learners: number): Insights {
  const stamps = [...concepts, ...prompts].map((r) => r.updated_at?.getTime() ?? 0).filter(Boolean);
  const byDifficulty: PromptInsight[] = prompts
    .map((p) => ({
      challengeId: p.challenge_id,
      promptId: p.prompt_id,
      attempts: p.attempts,
      successes: p.successes,
      rate: rate(p.successes, p.attempts),
      medianTries: p.median_tries,
    }))
    .sort((a, b) => a.rate - b.rate || a.promptId.localeCompare(b.promptId));
  return {
    learners,
    demo: learners < DEMO_MIN_LEARNERS,
    updatedAt: stamps.length ? new Date(Math.max(...stamps)).toISOString() : null,
    concepts: concepts.map((c) => ({ concept: c.concept, learners: c.learners, meanMastery: c.mean_mastery, evidence: c.evidence })),
    prompts: byDifficulty,
  };
}

export function pgInsights(db: Queryable): InsightsStore {
  return {
    async insights() {
      const concepts = await retrying(() => db.query<ConceptRow>(
        "SELECT concept, count(*)::int AS learners, avg(alpha / (alpha + beta)) AS mean_mastery, sum(n)::int AS evidence, max(updated_at) AS updated_at FROM concept_mastery GROUP BY concept ORDER BY concept",
      ));
      const prompts = await retrying(() => db.query<PromptRow>(
        "SELECT challenge_id, prompt_id, attempts, successes, median_tries, updated_at FROM prompt_stats",
      ));
      const learners = await retrying(() => db.query<{ n: number }>("SELECT count(DISTINCT learner_id)::int AS n FROM concept_mastery"));
      return summarize(concepts.rows, prompts.rows, learners.rows[0]?.n ?? 0);
    },
  };
}

export function registerInsights(app: FastifyInstance, store: InsightsStore | null, env: NodeJS.ProcessEnv = process.env) {
  const token = env.OWNER_TOKEN && env.OWNER_TOKEN.length >= MIN_TOKEN_CHARS ? env.OWNER_TOKEN : null;
  if (env.OWNER_TOKEN && !token) console.error(`OWNER_TOKEN is shorter than ${MIN_TOKEN_CHARS} characters; insights are off.`);
  app.get("/api/owner/insights", async (request, reply) => {
    reply.header("cache-control", "no-store");
    if (!store || !token) return reply.code(503).send({ message: "Insights are off: the owner token or the database is not configured." });
    const auth = request.headers.authorization;
    const sent = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    if (!sameSecret(sent, token)) return reply.code(401).send({ message: "The owner token is required." });
    try {
      return await store.insights();
    } catch {
      return reply.code(502).send({ message: "Could not read insights." });
    }
  });
}
