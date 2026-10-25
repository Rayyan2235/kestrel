import type { BotId, World } from "@kestrel/contracts";

/** The only seam to a simulation. No React, no model imports. */
export type SimObject = "left-weight" | "right-weight";

export type SimTask = {
  id: string;
  object: SimObject;
  owner: BotId;
  cm: number;
};

export type ProposeResult =
  | { ok: true; task: SimTask; baseVersion: number }
  | { ok: false; reason: "locked" | "invalid"; summary?: string };

/**
 * `failed`: the sim tried and did not finish (blocked, fell, aborted, timed
 * out). `summary` says what was measured, in words the learner can read.
 */
export type ApplyResult =
  | { ok: true; world: World; summary?: string }
  | {
      ok: false;
      reason: "stale" | "not-proposed" | "failed";
      summary?: string;
    };

export interface SimAdapter {
  snapshot(): World;
  subscribe(listener: (world: World) => void): () => void;
  /** Validates the task and takes the per-object lock. Does not mutate. */
  propose(task: SimTask): ProposeResult;
  /**
   * Applies a proposed task if `version` still equals the world version. A
   * real sim acts physically, so this settles when the action finishes,
   * fails or `signal` aborts it; the lock is held until then, then freed.
   */
  apply(
    task: SimTask,
    version: number,
    signal?: AbortSignal,
  ): Promise<ApplyResult>;
  /** Frees a lock without applying (abort, timeout). */
  release(task: SimTask): void;
  /** Resets the world and bumps the version. */
  reset(): World;
}
