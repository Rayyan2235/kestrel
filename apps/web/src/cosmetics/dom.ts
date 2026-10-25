import type { CSSProperties } from "react";
import type { BotLook } from "@kestrel/contracts";
import { itemById } from "./catalog.js";
import { hiddenSlots } from "./conflicts.js";

export type LookDom = { style: CSSProperties; data: Record<string, string> };

/** CSS variables --shell --accent --eye plus data-eye-shape and data-head|back|neck. */
export const lookStyle = (look: BotLook): LookDom => {
  const hidden = hiddenSlots(look);
  const style: Record<string, string> = {};
  const color = (variable: string, id: string) => {
    const hex = itemById(id)?.color;
    if (hex) style[variable] = hex;
  };
  color("--shell", look.shell);
  color("--accent", look.accent);
  color("--eye", look.eye);
  const data: Record<string, string> = {
    "data-head": look.head,
    "data-back": look.back,
    "data-neck": look.neck,
  };
  if (!hidden.includes("eyeShape")) data["data-eye-shape"] = look.eyeShape;
  return { style: style as CSSProperties, data };
};
