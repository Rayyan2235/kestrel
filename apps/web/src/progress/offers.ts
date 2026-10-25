import { CATALOG } from "../cosmetics/catalog.js";
import { mulberry32 } from "./rng.js";

/** 3 seeded ids among items with minLevel <= level that are not unlocked. */
export const offer = (
  seed: number,
  level: number,
  unlocked: ReadonlySet<string>,
): string[] => {
  const pool = CATALOG.filter((i) => i.minLevel <= level && !unlocked.has(i.id))
    .map((i) => i.id)
    .sort();
  const rand = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, 3);
};
