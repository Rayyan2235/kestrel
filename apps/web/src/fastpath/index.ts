import { notImplemented } from "../notImplemented.js";

export type Side = "left" | "right";

export type FastContext = {
  /** Side last acted on, from the ledger. Null before any action. */
  focus: Side | null;
  leftCm: number;
  rightCm: number;
  /** Positions before each fast-path move, newest last. */
  undo: ReadonlyArray<{ side: Side; cm: number }>;
};

export type FastResult =
  | { kind: "move"; side: Side; cm: number }
  | { kind: "undo" }
  | { kind: "miss"; hint: string };

export const STEP_CM = 5;
export const MIN_CM = 5;
export const MAX_CM = 45;

/** Lowercases; number words to digits; units, filler and politeness removed. */
export const normalize = (_text: string): string => notImplemented("normalize");

/** Never guesses: anything unparsed is a `miss` with a "try ..." hint. */
export const parseFast = (_text: string, _ctx: FastContext): FastResult =>
  notImplemented("parseFast");

/** True when input is too short to be speech; such input never reaches the router. */
export const isTooShort = (_durationMs: number, _text: string): boolean =>
  notImplemented("isTooShort");
