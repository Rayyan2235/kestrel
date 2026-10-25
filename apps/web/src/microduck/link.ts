import type { BotId } from "@kestrel/contracts";

/**
 * The bridge between the Microduck physics loop and the authoritative runtime.
 * Physics writes each body's pose (scene coordinates) and which leg of the
 * fixture lane it has reached; the linked controller reads them. Pure data, so
 * the runtime and its tests never load WASM.
 */
export type BodyPose = { x: number; z: number; heading: number };
export const link = {
  ready: false,
  pose: { pip: null, nova: null } as Record<BotId, BodyPose | null>,
  /** 0: heading for the lane waypoint, 1: heading for the dock. */
  leg: { pip: 0, nova: 0 } as Record<BotId, 0 | 1>,
};
