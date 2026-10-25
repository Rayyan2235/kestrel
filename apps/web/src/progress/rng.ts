import { notImplemented } from "../notImplemented.js";

export const seedFrom = (_text: string): number =>
  notImplemented("rng.seedFrom");
/** Seeded PRNG (mulberry32); returns floats in [0, 1). */
export const mulberry32 = (_seed: number): (() => number) =>
  notImplemented("rng.mulberry32");
