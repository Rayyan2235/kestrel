import type { Outcome, World } from "@kestrel/contracts";

/** Stub sim: positions are exact, so the tolerance is the strict balance() one. */
export const STUB_TOL_GCM = 0.001;
/** DuckSim measures a physical push to the millimetre; about 1 cm on the 100 g rail. */
export const DUCKSIM_TOL_GCM = 100;

/**
 * Which side is down, with a tolerance in g·cm so a measured position that
 * lands a millimetre short still reads "balanced". balance() stays exact.
 */
export const outcomeOf = (world: World, tolGcm: number): Outcome => {
  const delta =
    world.leftGrams * world.leftCm - world.rightGrams * world.rightCm;
  return Math.abs(delta) < tolGcm ? "balanced" : delta > 0 ? "left" : "right";
};
