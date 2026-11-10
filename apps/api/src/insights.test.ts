import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import { DEMO_MIN_LEARNERS, InsightsSchema, type Insights } from "../../../packages/contracts/src/index.js";
import { buildApp } from "./app.js";
import { pgInsights, registerInsights, summarize, type InsightsStore } from "./insights.js";
import type { LiveProviders } from "./live.js";

const providers: LiveProviders = { agentTurn: vi.fn(), speak: vi.fn(), transcribe: vi.fn() };
const TOKEN = "t".repeat(40);
const NIGHT = new Date("2026-11-10T07:00:05Z");

function prompt(prompt_id: string, attempts: number, successes: number) {
  return { challenge_id: "moments", prompt_id, attempts, successes, median_tries: 1, updated_at: NIGHT };
}

it("ranks prompts hardest first by the job's smoothed rate, and labels a small cohort demo data", () => {
  const s = summarize(
    [{ concept: "moments", learners: 3, mean_mastery: 0.6, evidence: 9, updated_at: NIGHT }],
    [prompt("m-10-20", 10, 9), prompt("m-10-30", 10, 2), prompt("m-15-20", 10, 5)],
    3,
  );
  expect(InsightsSchema.parse(s)).toEqual(s);
  expect(s.prompts.map((p) => p.promptId)).toEqual(["m-10-30", "m-15-20", "m-10-20"]);
  expect(s.prompts[0]!.rate).toBeCloseTo(3 / 12);
  expect(s).toMatchObject({ learners: 3, demo: true, updatedAt: NIGHT.toISOString() });
  expect(summarize([], [], DEMO_MIN_LEARNERS).demo).toBe(false);
  expect(summarize([], [], 0).updatedAt).toBeNull();
});

it("reads only aggregates from the summary tables", async () => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("FROM concept_mastery GROUP BY")) return { rows: [{ concept: "moments", learners: 2, mean_mastery: 0.5, evidence: 4, updated_at: NIGHT }] };
    if (sql.includes("FROM prompt_stats")) return { rows: [prompt("m-10-20", 4, 2)] };
    return { rows: [{ n: 2 }] };
  });
  const s = await pgInsights({ query } as never).insights();
  expect(s.learners).toBe(2);
  expect(JSON.stringify(s)).not.toMatch(/learner_id|[0-9a-f]{8}-[0-9a-f]{4}/);
  for (const [sql] of query.mock.calls) expect(sql).toMatch(/^SELECT/);
});

it("needs the owner token, compared in full, and is off without one", async () => {
  const insights: Insights = summarize([], [], 0);
  const store: InsightsStore = { insights: vi.fn().mockResolvedValue(insights) };
  // buildApp registers the route; with no OWNER_TOKEN in the test env it is off.
  const app = buildApp(providers, { insights: store });
  expect((await app.inject({ url: "/api/owner/insights", headers: { authorization: `Bearer ${TOKEN}` } })).statusCode).toBe(503);
  await app.close();

  const on = Fastify();
  registerInsights(on, store, { OWNER_TOKEN: TOKEN });
  const off = Fastify();
  registerInsights(off, store, {});
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const short = Fastify();
  registerInsights(short, store, { OWNER_TOKEN: "short" });
  log.mockRestore();
  try {
    const get = (a: typeof on, authorization?: string) => a.inject({ url: "/api/owner/insights", headers: authorization ? { authorization } : {} });
    const ok = await get(on, `Bearer ${TOKEN}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(ok.json()).toEqual(insights);
    expect((await get(on)).statusCode).toBe(401);
    expect((await get(on, `Bearer ${TOKEN.slice(1)}`)).statusCode).toBe(401);
    expect((await get(on, TOKEN)).statusCode).toBe(401); // the Bearer scheme is required
    expect((await get(off, `Bearer ${TOKEN}`)).statusCode).toBe(503);
    expect((await get(short, "Bearer short")).statusCode).toBe(503);
    expect(store.insights).toHaveBeenCalledTimes(1);
  } finally {
    await Promise.all([on.close(), off.close(), short.close()]);
  }
});
