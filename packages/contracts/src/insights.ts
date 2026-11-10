import { z } from "zod";

// What the owner-only insights page shows (GET /api/owner/insights). The
// numbers come from the nightly analytics job (verifier/kestrel_analytics):
// concept_mastery and prompt_stats. No learner ids leave the server.

/** Below this many learners with mastery rows, the page labels everything demo data. */
export const DEMO_MIN_LEARNERS = 20;

export const ConceptInsightSchema = z.object({
  concept: z.string(),
  learners: z.number().int().nonnegative(),
  /** Mean of each learner's Beta posterior mean, alpha / (alpha + beta). */
  meanMastery: z.number().min(0).max(1),
  /** Verified attempts behind it, across learners. */
  evidence: z.number().int().nonnegative(),
});

export const PromptInsightSchema = z.object({
  challengeId: z.string(),
  promptId: z.string(),
  attempts: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  /** Smoothed success rate, (successes + 1) / (attempts + 2), as kestrel_analytics/model.py ranks prompts. */
  rate: z.number().min(0).max(1),
  medianTries: z.number().nullable(),
});

export const InsightsSchema = z.object({
  learners: z.number().int().nonnegative(),
  demo: z.boolean(),
  /** When the nightly job last wrote; null before its first run. */
  updatedAt: z.string().nullable(),
  concepts: z.array(ConceptInsightSchema),
  /** Hardest first. */
  prompts: z.array(PromptInsightSchema),
});

export type ConceptInsight = z.infer<typeof ConceptInsightSchema>;
export type PromptInsight = z.infer<typeof PromptInsightSchema>;
export type Insights = z.infer<typeof InsightsSchema>;
