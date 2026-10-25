import type { BotLook } from "@kestrel/contracts";
import type { Slot } from "./catalog.js";

/** Slots hidden by other slots: goggles cover a visor eye shape. */
export const hiddenSlots = (look: BotLook): Slot[] =>
  look.head === "goggles" && look.eyeShape === "visor" ? ["eyeShape"] : [];
