import { levelOf, need } from "./levels.js";

/** Fractions of the bar (0 to 1). */
export type BarSegments = {
  /** XP already in the bar before the award. 0 after a level-up. */
  oldWidth: number;
  /** The just-earned segment. After a level-up it is the carry into the new level. */
  newWidth: number;
  /** XP carried into the new level (0 when there was no level-up). */
  leftXp: number;
  rankedUp: boolean;
};

const span = (level: number) => need(level + 1) - need(level);

/** Two-segment fill. Never negative; on level-up the old segment clamps to 0. */
export const barSegments = (prevXp: number, nextXp: number): BarSegments => {
  const prev = Math.max(0, Number.isFinite(prevXp) ? prevXp : 0);
  const next = Math.max(prev, Number.isFinite(nextXp) ? nextXp : prev);
  const from = levelOf(prev);
  const to = levelOf(next);
  if (to > from) {
    const leftXp = next - need(to);
    return {
      oldWidth: 0,
      newWidth: Math.min(1, leftXp / span(to)),
      leftXp,
      rankedUp: true,
    };
  }
  const base = need(from);
  return {
    oldWidth: Math.min(1, (prev - base) / span(from)),
    newWidth: Math.min(1, (next - prev) / span(from)),
    leftXp: 0,
    rankedUp: false,
  };
};
