export const CURVE_VERSION = 1;

/** Cumulative XP to reach level L: 25 * (L - 1) * (L + 2). */
export const need = (level: number, _curveVersion = CURVE_VERSION): number =>
  25 * (Math.max(1, level) - 1) * (Math.max(1, level) + 2);

export const levelOf = (xp: number, curveVersion = CURVE_VERSION): number => {
  let level = Math.max(
    1,
    Math.floor((-1 + Math.sqrt(9 + (4 * Math.max(0, xp)) / 25)) / 2),
  );
  // Closed form can be off by one near a threshold in floating point.
  while (need(level + 1, curveVersion) <= xp) level++;
  while (level > 1 && need(level, curveVersion) > xp) level--;
  return level;
};

export const leveledUp = (
  prevXp: number,
  nextXp: number,
): { from: number; to: number }[] => {
  const out: { from: number; to: number }[] = [];
  for (let l = levelOf(prevXp); l < levelOf(nextXp); l++)
    out.push({ from: l, to: l + 1 });
  return out;
};
