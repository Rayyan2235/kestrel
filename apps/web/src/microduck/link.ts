import type { BotId } from "@kestrel/contracts";

/**
 * The bridge between the Microduck physics loop and the authoritative runtime.
 * Physics publishes each body's pose (scene coordinates) and the state of the
 * push it is performing for the current action; the linked controller reads
 * them. Pure data, so the runtime and its tests never load WASM.
 */
export type BodyPose = { x: number; z: number; heading: number };
export type PushState = { requestId: string; phase: "route" | "align" | "push" | "release" | "done" | "failed"; progress: number; reason: string | null };
export const link = {
  ready: false,
  pose: { pip: null, nova: null } as Record<BotId, BodyPose | null>,
  push: { pip: null, nova: null } as Record<BotId, PushState | null>,
};
