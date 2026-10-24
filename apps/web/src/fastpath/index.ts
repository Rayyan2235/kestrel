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

/** Below this a press is a tap, not speech. */
const MIN_SPEECH_MS = 400;

const UNITS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

/** Units, politeness and speech filler: dropped before parsing. */
const DROPPED = new Set([
  "cm",
  "centimeter",
  "centimeters",
  "centimetre",
  "centimetres",
  "please",
  "kindly",
  "uh",
  "um",
  "uhm",
  "er",
  "erm",
  "hey",
  "ok",
  "okay",
  "could",
  "can",
  "would",
  "you",
]);

/** Structural words that carry no meaning for a move command. */
const NOISE = new Set([
  "move",
  "put",
  "set",
  "shift",
  "slide",
  "the",
  "weight",
  "one",
  "to",
  "at",
  "from",
  "pivot",
  "a",
  "bit",
  "little",
  "it",
]);

/** Short phrases ASR engines invent on silence. */
const PHANTOM = new Set(["thank you", "thanks for watching", "bye", "you"]);

const HINT =
  "I did not understand. Try “move the left weight to 30 cm”, “more”, “less”, “other side” or “undo”.";
const miss = (hint = HINT): FastResult => ({ kind: "miss", hint });

const clamp = (cm: number): number => Math.min(MAX_CM, Math.max(MIN_CM, cm));

/** Lowercases; number words to digits; units, filler and politeness removed. */
export const normalize = (text: string): string => {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9.\s-]/g, " ")
    .replace(/(?<!\d)\.|\.(?!\d)/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (DROPPED.has(t)) continue;
    const tens = TENS[t];
    if (tens !== undefined) {
      const next = UNITS[tokens[i + 1] ?? ""];
      if (next !== undefined && next >= 1 && next <= 9) {
        out.push(String(tens + next));
        i += 1;
      } else out.push(String(tens));
      continue;
    }
    // A lone "one" is a pronoun ("the right one"); 1 is below the range anyway.
    out.push(UNITS[t] !== undefined && t !== "one" ? String(UNITS[t]) : t);
  }
  return out.join(" ");
};

const isNumber = (t: string) => /^\d+(\.\d+)?$/.test(t);

/** Never guesses: anything unparsed is a `miss` with a "try ..." hint. */
export const parseFast = (text: string, ctx: FastContext): FastResult => {
  const words = normalize(text)
    .split(" ")
    .filter((t) => t && !NOISE.has(t));
  if (words.length === 0) return miss();
  const phrase = words.join(" ");
  const cmOf = (side: Side) => (side === "left" ? ctx.leftCm : ctx.rightCm);

  if (phrase === "undo")
    return ctx.undo.length > 0
      ? { kind: "undo" }
      : miss(
          "There is nothing to undo. Try a position like “left weight to 30”.",
        );

  if (
    phrase === "more" ||
    phrase === "less" ||
    phrase === "again" ||
    phrase === "other side"
  ) {
    if (!ctx.focus)
      return miss(
        "Say which weight first. Try “move the left weight to 30 cm”.",
      );
    if (phrase === "more" || phrase === "less") {
      const delta = phrase === "more" ? STEP_CM : -STEP_CM;
      return {
        kind: "move",
        side: ctx.focus,
        cm: clamp(cmOf(ctx.focus) + delta),
      };
    }
    if (phrase === "other side")
      // Mirrors the focused weight's position onto the other weight.
      return {
        kind: "move",
        side: ctx.focus === "left" ? "right" : "left",
        cm: clamp(cmOf(ctx.focus)),
      };
    // again: repeat the last change on the focused side.
    const prev = [...ctx.undo].reverse().find((u) => u.side === ctx.focus);
    const delta = prev ? cmOf(ctx.focus) - prev.cm : 0;
    return {
      kind: "move",
      side: ctx.focus,
      cm: clamp(cmOf(ctx.focus) + (delta === 0 ? STEP_CM : delta)),
    };
  }

  const sides = words.filter((w) => w === "left" || w === "right");
  const numbers = words.filter(isNumber);
  if (sides.length === 1 && numbers.length === 1 && words.length === 2)
    return {
      kind: "move",
      side: sides[0] as Side,
      cm: clamp(Number(numbers[0])),
    };
  return miss();
};

/** True when input is too short to be speech; such input never reaches the router. */
export const isTooShort = (durationMs: number, text: string): boolean => {
  if (durationMs < MIN_SPEECH_MS) return true;
  const n = normalize(text);
  return n === "" || PHANTOM.has(n);
};
