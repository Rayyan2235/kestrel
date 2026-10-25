import { z } from "zod";
import { BotSchema } from "./bot.js";

/**
 * Learning-progress contracts. Separate from the conversation ledger:
 * `LedgerKindSchema` never carries these kinds.
 */

const stamp = {
  seq: z.number().int().nonnegative(),
  epoch: z.number().int().nonnegative(),
  worldVersion: z.number().int().nonnegative(),
};

export const PredictionChoiceSchema = z.enum([
  "left-down",
  "balanced",
  "right-down",
]);
export type PredictionChoice = z.infer<typeof PredictionChoiceSchema>;

export const OutcomeSchema = z.enum(["left", "right", "balanced"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

/** Measured events only. There is deliberately no text field anywhere. */
export const LabEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("prediction_locked"),
      challengeId: z.string().min(1),
      promptId: z.string().min(1),
      attempt: z.number().int().min(1),
      choice: PredictionChoiceSchema,
      ...stamp,
    })
    .strict(),
  z
    .object({
      type: z.literal("prediction_voided"),
      challengeId: z.string().min(1),
      promptId: z.string().min(1),
      attempt: z.number().int().min(1),
      reason: z.string().min(1),
      ...stamp,
    })
    .strict(),
  z
    .object({
      type: z.literal("move_applied"),
      challengeId: z.string().min(1).optional(),
      promptId: z.string().min(1).optional(),
      /** Absent for a Skip, free play and setup. */
      attempt: z.number().int().min(1).optional(),
      bot: BotSchema,
      outcome: OutcomeSchema,
      /** Challenge setup move: never scorable. */
      setup: z.boolean().optional(),
      ...stamp,
    })
    .strict(),
  z
    .object({
      type: z.literal("challenge_complete"),
      challengeId: z.string().min(1),
      ...stamp,
    })
    .strict(),
  z
    .object({
      type: z.literal("explanation_submitted"),
      challengeId: z.string().min(1),
      ...stamp,
    })
    .strict(),
  z
    .object({
      type: z.literal("ask_peer_used"),
      challengeId: z.string().min(1),
      ...stamp,
    })
    .strict(),
]);
export type LabEvent = z.infer<typeof LabEventSchema>;

const itemId = z.string().min(1).max(40);

export const BotLookSchema = z
  .object({
    shell: itemId,
    accent: itemId,
    eye: itemId,
    eyeShape: itemId,
    head: itemId,
    back: itemId,
    neck: itemId,
  })
  .strict();
export type BotLook = z.infer<typeof BotLookSchema>;

export const AwardSchema = z
  .object({
    awardId: z.string().min(1),
    ruleId: z.enum([
      "lock",
      "match",
      "comeback",
      "complete",
      "explain",
      "askPeer",
    ]),
    xp: z.number().int().positive(),
    reason: z.string().min(1),
    /** `seq` of the lab event that caused it. */
    triggeredBy: z.number().int().nonnegative(),
  })
  .strict();
export type Award = z.infer<typeof AwardSchema>;

export const ProgressSchema = z
  .object({
    schema: z.literal(1),
    curveVersion: z.number().int().positive(),
    awards: z.array(AwardSchema),
    picks: z.array(
      z.object({ itemId, atLevel: z.number().int().min(2) }).strict(),
    ),
    equipped: z.object({ pip: BotLookSchema, nova: BotLookSchema }).strict(),
    /** Awards and items already shown to the learner. Awards stay immutable. */
    seen: z.array(z.string().min(1)),
  })
  .strict();
export type Progress = z.infer<typeof ProgressSchema>;

const todo = (what: string): never => {
  throw new Error(`not implemented: ${what}`);
};

export const DEFAULT_LOOKS: { pip: BotLook; nova: BotLook } = {
  pip: {
    shell: "shell-sky",
    accent: "accent-amber",
    eye: "eye-white",
    eyeShape: "round",
    head: "none",
    back: "none",
    neck: "none",
  },
  nova: {
    shell: "shell-mint",
    accent: "accent-coral",
    eye: "eye-white",
    eyeShape: "round",
    head: "none",
    back: "none",
    neck: "none",
  },
};

/** Falls back per field to `fallback` and keeps every valid field. */
export const parseBotLook = (_input: unknown, _fallback: BotLook): BotLook =>
  todo("parseBotLook");

/** Corrupt input gives a fresh profile; never throws. */
export const parseProgress = (_input: unknown): Progress =>
  todo("parseProgress");

export const freshProgress = (): Progress => todo("freshProgress");
