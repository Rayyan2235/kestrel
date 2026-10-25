import type { BotLook } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";
import type { Slot } from "./catalog.js";

/** Slots hidden by other slots (goggles hide the visor eye shape). */
export const hiddenSlots = (_look: BotLook): Slot[] =>
  notImplemented("conflicts.hiddenSlots");
