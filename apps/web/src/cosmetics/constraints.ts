import type { BotLook } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";
import type { Slot } from "./catalog.js";

export const contrastRatio = (_a: string, _b: string): number =>
  notImplemented("constraints.contrastRatio");
/** Ids of `slot` allowed for this bot given its own and the other bot's look. */
export const allowed = (
  _slot: Slot,
  _look: BotLook,
  _other: BotLook,
): string[] => notImplemented("constraints.allowed");
/** Why an id is not allowed, or null. */
export const whyNot = (
  _slot: Slot,
  _id: string,
  _look: BotLook,
  _other: BotLook,
): string | null => notImplemented("constraints.whyNot");
