import { z } from "zod";

export const ObjectiveIdSchema = z.enum(["balance-beam", "build-triangle", "rescue-pip"]);
export type ObjectiveId = z.infer<typeof ObjectiveIdSchema>;

/** An anonymous browser-made ID: no name, account or other learner data. */
export const LearnerIdSchema = z.string().uuid();

const cm = z.number().min(0).max(100).nullable();
/** One objective attempt with what the simulator measured. Beam readings are null elsewhere. */
export const AttemptSchema = z
  .object({
    learnerId: LearnerIdSchema,
    objective: ObjectiveIdSchema,
    ok: z.boolean(),
    tiltDeg: z.number().min(0).max(90).nullable(),
    leftCm: cm,
    rightCm: cm,
  })
  .strict();
export type Attempt = z.infer<typeof AttemptSchema>;

export const ProgressSchema = z.object({
  earned: z.array(ObjectiveIdSchema),
  attempts: z.partialRecord(ObjectiveIdSchema, z.number().int().min(0)),
  /** From the XP ledger, derived on read; absent when the server has no ledger. */
  xp: z.number().int().min(0).optional(),
  level: z.number().int().min(1).optional(),
});
export type Progress = z.infer<typeof ProgressSchema>;
