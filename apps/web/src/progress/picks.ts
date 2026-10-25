import type { Progress } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

/** tokens = (level - 1) - picks.length, floored at 0. Derived, never stored. */
export const tokens = (_level: number, _picks: Progress["picks"]): number =>
  notImplemented("picks.tokens");
/** Free items union picks. */
export const unlocked = (
  _freeIds: readonly string[],
  _picks: Progress["picks"],
): Set<string> => notImplemented("picks.unlocked");
