import { notImplemented } from "../notImplemented.js";

export const CURVE_VERSION = 1;
/** Cumulative XP to reach level L: 25 * (L - 1) * (L + 2). */
export const need = (_level: number, _curveVersion = CURVE_VERSION): number =>
  notImplemented("levels.need");
export const levelOf = (_xp: number, _curveVersion = CURVE_VERSION): number =>
  notImplemented("levels.levelOf");
export const leveledUp = (
  _prevXp: number,
  _nextXp: number,
): { from: number; to: number }[] => notImplemented("levels.leveledUp");
