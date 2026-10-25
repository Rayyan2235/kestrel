import type { CSSProperties } from "react";
import type { BotLook } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

export type LookDom = { style: CSSProperties; data: Record<string, string> };
/** CSS variables --shell --accent --eye plus data-eye-shape and data-head|back|neck. */
export const lookStyle = (_look: BotLook): LookDom =>
  notImplemented("dom.lookStyle");
