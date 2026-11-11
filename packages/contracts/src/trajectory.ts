import { z } from "zod";
import { BotSchema } from "./bot.js";
import { isRescueRoute } from "./rescue.js";

// What the browser sends the verifier for a walking objective (ADR-003): a
// low-rate log of each robot's and each prop's planar pose since the last
// reset. Exact replay diverges chaotically, so the verifier instead checks
// that the log is physically plausible and that its final state meets the
// objective (verifier/kestrel_verifier/walking.py).

/** The policy's legal command range, which bounds how fast a robot can really move. */
export const GAIT = { fwd: 0.65, back: -0.4, spin: 3.6 } as const;

/** Samples per second, and the longest log accepted (10 minutes from a reset). */
export const TRAJECTORY_HZ = 4;
export const TRAJECTORY_MAX_SAMPLES = 10 * 60 * TRAJECTORY_HZ;

/** The walking objectives the verifier checks by plausibility. */
export const WALKING_OBJECTIVES = ["build-triangle", "rescue-pip"] as const;
export type WalkingObjective = (typeof WALKING_OBJECTIVES)[number];

/** [x m, y m, yaw degrees] in the world frame, rounded to mm and 0.1°. */
const PoseSchema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const SeriesSchema = z.array(PoseSchema).min(2).max(TRAJECTORY_MAX_SAMPLES);

export const TrajectorySchema = z
  .object({
    hz: z.literal(TRAJECTORY_HZ),
    bots: z.partialRecord(BotSchema, SeriesSchema),
    props: z.record(z.string().min(1).max(64), SeriesSchema),
  })
  .strict()
  .refine((t) => {
    const lengths = [...Object.values(t.bots), ...Object.values(t.props)].map((s) => s.length);
    return lengths.length > 0 && lengths.every((n) => n === lengths[0]);
  }, "every series has the same number of samples");

export type Trajectory = z.infer<typeof TrajectorySchema>;

/** The rescue claim also names the learner's route; the verifier checks Pip followed it. */
export const RescueRouteSchema = z.array(z.string().length(1)).refine(isRescueRoute, "not a rescue route");

/** Round a pose for the log: mm and 0.1°, so a 10-minute log stays small. */
export const logPose = (x: number, y: number, yawDeg: number): [number, number, number] => [
  Math.round(x * 1000) / 1000,
  Math.round(y * 1000) / 1000,
  Math.round(yawDeg * 10) / 10,
];
