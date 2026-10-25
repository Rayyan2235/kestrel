import type { Progress } from "@kestrel/contracts";

/** tokens = (level - 1) - picks.length, floored at 0. Derived, never stored. */
export const tokens = (level: number, picks: Progress["picks"]): number =>
  Math.max(0, level - 1 - picks.length);

/** Free items union picks. */
export const unlocked = (
  freeIds: readonly string[],
  picks: Progress["picks"],
): Set<string> => new Set([...freeIds, ...picks.map((p) => p.itemId)]);
