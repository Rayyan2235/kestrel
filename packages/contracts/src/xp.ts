import { z } from "zod";
import { LearnerIdSchema, ObjectiveIdSchema } from "./progress.js";

/*
 * The XP ledger's shared rules: the level curve, what each rule is worth, and
 * the prompts a learner can predict on. Client-trusted until P4: the browser
 * reports what the simulator measured, and the server checks only that the
 * event is well formed, known and not already awarded.
 */

export const CURVE_VERSION = 1;

/** Cumulative XP to reach level L: 25 (L - 1)(L + 2). Level 2 at 100, 3 at 250, 4 at 450. */
export const need = (level: number, _curveVersion = CURVE_VERSION): number =>
  25 * (Math.max(1, level) - 1) * (Math.max(1, level) + 2);

/** The level a total of XP reaches: the closed-form inverse of `need`, corrected at the edges. */
export const levelOf = (xp: number, curveVersion = CURVE_VERSION): number => {
  let level = Math.max(1, Math.floor((-1 + Math.sqrt(9 + (4 * Math.max(0, xp)) / 25)) / 2));
  // Closed form can be off by one near a threshold in floating point.
  while (need(level + 1, curveVersion) <= xp) level++;
  while (level > 1 && need(level, curveVersion) > xp) level--;
  return level;
};

/**
 * What each rule is worth. The server sets the amount; the client only names the rule.
 * Per prompt: locked + matched + comeback = 35 at most, since each rule is awarded once.
 * `objective` is one award per objective won, with no prompt.
 */
export const XP_RULES = { locked: 10, matched: 15, comeback: 10, objective: 100 } as const;
export type XpRule = keyof typeof XP_RULES;
export const XpRuleSchema = z.enum(Object.keys(XP_RULES) as [XpRule, ...XpRule[]]);
export const XP_PER_PROMPT_CAP = XP_RULES.locked + XP_RULES.matched + XP_RULES.comeback;

export const PredictionSchema = z.enum(["left", "level", "right"]);
export type Prediction = z.infer<typeof PredictionSchema>;

/** The Moments setups a learner predicts on: the 200 g at `left` cm, the 100 g at `right` cm. */
export const MOMENTS_PROMPTS = [
  { id: "m-10-20", left: 10, right: 20, answer: "level" },
  { id: "m-15-20", left: 15, right: 20, answer: "left" },
  { id: "m-10-30", left: 10, right: 30, answer: "right" },
  { id: "m-15-30", left: 15, right: 30, answer: "level" },
] as const satisfies readonly { id: string; left: number; right: number; answer: Prediction }[];
export const PROMPT_CHALLENGE = "moments";
export const promptFor = (left: number, right: number) =>
  MOMENTS_PROMPTS.find((p) => p.left === left && p.right === right) ?? null;

const PromptIdSchema = z.enum(MOMENTS_PROMPTS.map((p) => p.id) as [string, ...string[]]);

/** POST /api/locks: the prediction, before the trial. The server stamps locked_at. */
export const LockRequestSchema = z
  .object({ learnerId: LearnerIdSchema, challengeId: z.literal(PROMPT_CHALLENGE), promptId: PromptIdSchema, value: PredictionSchema })
  .strict();
export type LockRequest = z.infer<typeof LockRequestSchema>;

/** POST /api/attempts/start: a trial under a lock. The server stamps trial_started_at. */
export const AttemptStartSchema = z.object({ learnerId: LearnerIdSchema, lockId: z.string().uuid() }).strict();
export type AttemptStart = z.infer<typeof AttemptStartSchema>;

/**
 * POST /api/xp-events. Prompt rules name a Moments prompt; `objective` names an objective
 * as challengeId and has no prompt. The key (learner, rule, challenge, prompt) makes it idempotent.
 */
export const XpEventSchema = z.union([
  z
    .object({
      learnerId: LearnerIdSchema,
      ruleId: z.enum(["locked", "matched", "comeback"]),
      challengeId: z.literal(PROMPT_CHALLENGE),
      promptId: PromptIdSchema,
      attemptId: z.string().uuid().optional(),
    })
    .strict(),
  z
    .object({
      learnerId: LearnerIdSchema,
      ruleId: z.literal("objective"),
      challengeId: ObjectiveIdSchema,
      promptId: z.literal(""),
      attemptId: z.string().uuid().optional(),
    })
    .strict(),
]);
export type XpEvent = z.infer<typeof XpEventSchema>;

/** XP and level, derived on read from the ledger. */
export const XpTotalsSchema = z.object({ xp: z.number().int().min(0), level: z.number().int().min(1) });
export type XpTotals = z.infer<typeof XpTotalsSchema>;
export const totalsOf = (xp: number): XpTotals => ({ xp, level: levelOf(xp) });

/** POST /api/xp-events reply: whether this event was new, and the totals after it. */
export const XpAwardSchema = XpTotalsSchema.extend({ awarded: z.boolean() });
export type XpAward = z.infer<typeof XpAwardSchema>;
