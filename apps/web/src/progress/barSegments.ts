import { notImplemented } from "../notImplemented.js";

export type BarSegments = {
  oldWidth: number;
  newWidth: number;
  leftXp: number;
  rankedUp: boolean;
};
/** Two-segment fill. Never negative; on level-up the old segment clamps to 0. */
export const barSegments = (_prevXp: number, _nextXp: number): BarSegments =>
  notImplemented("barSegments");
