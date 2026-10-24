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
  | { ok: false; reason: "locked" | "invalid" };

export type ApplyResult =
  { ok: true; world: World } | { ok: false; reason: "stale" | "not-proposed" };

export interface SimAdapter {
  snapshot(): World;
  subscribe(listener: (world: World) => void): () => void;
  /** Validates the task and takes the per-object lock. Does not mutate. */
  propose(task: SimTask): ProposeResult;
  /** Applies a proposed task if `version` still equals the world version, then frees the lock. */
  apply(task: SimTask, version: number): ApplyResult;
  /** Frees a lock without applying (abort, timeout). */
  release(task: SimTask): void;
  /** Resets the world and bumps the version. */
  reset(): World;
}
