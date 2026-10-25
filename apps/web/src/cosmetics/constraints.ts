import type { BotLook } from "@kestrel/contracts";
import { itemById, itemsFor, type Slot } from "./catalog.js";

/** Minimum WCAG contrast between an eye colour and its shell. */
export const MIN_EYE_CONTRAST = 3;

const luminance = (hex: string): number => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255)
  );
};

/** WCAG contrast ratio of two hex colours. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

const colorOf = (id: string): string | undefined => itemById(id)?.color;

const eyeFits = (eyeId: string, shellId: string): boolean => {
  const eye = colorOf(eyeId);
  const shell = colorOf(shellId);
  return !eye || !shell || contrastRatio(eye, shell) >= MIN_EYE_CONTRAST;
};

/**
 * Why `id` cannot go in `slot` for this bot, or null. Rules (checked directly,
 * so there is no recursion to guard): a shell differs from the other bot's and
 * keeps the current eye readable; an eye colour reads against the shell.
 */
export const whyNot = (
  slot: Slot,
  id: string,
  look: BotLook,
  other: BotLook,
  otherName = "The other robot",
): string | null => {
  const item = itemById(id);
  if (!item || item.slot !== slot) return "Not an option for this slot";
  if (slot === "shell") {
    if (other.shell === id) return `${otherName} already wears this shell`;
    if (!eyeFits(look.eye, id)) return "Too close to the eye colour";
  }
  if (slot === "eye" && !eyeFits(id, look.shell))
    return "Too close to the shell colour";
  return null;
};

/** Ids of `slot` allowed for this bot given its own and the other bot's look. */
export const allowed = (slot: Slot, look: BotLook, other: BotLook): string[] =>
  itemsFor(slot)
    .filter((i) => whyNot(slot, i.id, look, other) === null)
    .map((i) => i.id);
