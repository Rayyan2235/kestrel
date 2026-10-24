import type { Addressee, BotId, LedgerEvent, Source } from "@kestrel/contracts";
import { notImplemented } from "../notImplemented.js";

export type BubbleVariant = "to-you" | "bot-to-bot";

/** Everything below is derived from `event.to` and nothing else. */
export type Bubble = {
  eventId: string;
  anchor: BotId;
  to: Addressee;
  variant: BubbleVariant;
  /** "to You" or "to Nova". */
  chip: string;
  ariaLabel: string;
  source: Source;
  /** Who the speaker faces. */
  gaze: Addressee;
  text: string;
};

export const CAPS = { learner: 120, peer: 80, mobile: 32 } as const;

/** Latest event per speaking bot; one bubble per bot. */
export const deriveBubbles = (_ledger: readonly LedgerEvent[]): Bubble[] =>
  notImplemented("deriveBubbles");
