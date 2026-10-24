import { z } from "zod";
import { BotSchema } from "./bot.js";

/** Who an event is for. `to` is the single source of truth for addressee. */
export const AddresseeSchema = z.enum(["you", ...BotSchema.options]);
export type Addressee = z.infer<typeof AddresseeSchema>;
export const SpeakerSchema = AddresseeSchema;

/** Where the words came from. Nothing here claims live AI. */
export const SourceSchema = z.enum(["built-in", "mock", "scripted"]);
export type Source = z.infer<typeof SourceSchema>;

export const LedgerKindSchema = z.enum([
  "learner",
  "say",
  "handoff",
  "handback",
  "notice",
]);
export type LedgerKind = z.infer<typeof LedgerKindSchema>;

/** One call may hand off once; a second hop is refused by the coordinator. */
export const MAX_HOP = 1;

export const LedgerEventSchema = z
  .object({
    id: z.string().min(1),
    seq: z.number().int().nonnegative(),
    rootTurnId: z.string().min(1),
    causedBy: z.string().min(1).nullable(),
    epoch: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    source: SourceSchema,
    kind: LedgerKindSchema,
    hop: z.number().int().min(0).max(MAX_HOP),
    from: SpeakerSchema,
    to: AddresseeSchema,
    text: z.string().min(1).max(500),
  })
  .strict()
  .refine((e) => e.from !== e.to, {
    message: "from and to must differ",
    path: ["to"],
  });
export type LedgerEvent = z.infer<typeof LedgerEventSchema>;

/** Stable id: derived from epoch and seq, never from text or time. */
export const eventId = (epoch: number, seq: number): string =>
  `e${epoch}-${seq}`;

/**
 * The single tool a model (or the mock) may call. Strict-mode shaped: every
 * field required, optional ones nullable, no extra keys.
 */
export const RespondSchema = z
  .object({
    say: z.string().trim().min(1).max(500),
    action: z
      .object({
        side: z.enum(["left", "right"]),
        cm: z.number().min(5).max(45),
      })
      .strict()
      .nullable(),
    ask_peer: z
      .object({
        to: BotSchema,
        question: z.string().trim().min(1).max(200),
        evidence: z.string().trim().min(1).max(200),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type Respond = z.infer<typeof RespondSchema>;
