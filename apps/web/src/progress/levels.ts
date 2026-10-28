// The level curve lives in shared contracts, so the server derives the same levels.
export { CURVE_VERSION, levelOf, need } from "@kestrel/contracts";
import { levelOf } from "@kestrel/contracts";

export const leveledUp = (
  prevXp: number,
  nextXp: number,
): { from: number; to: number }[] => {
  const out: { from: number; to: number }[] = [];
  for (let l = levelOf(prevXp); l < levelOf(nextXp); l++)
    out.push({ from: l, to: l + 1 });
  return out;
};
