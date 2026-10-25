import {
  BOT_NAMES,
  type Addressee,
  type BotId,
  type LedgerEvent,
  type Source,
} from "@kestrel/contracts";

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

/** Visual character caps, applied in CSS with line-clamp. Never truncate in JS. */
export const CAPS = { learner: 120, peer: 80, mobile: 32 } as const;

const nameOf = (who: Addressee): string =>
  who === "you" ? "You" : BOT_NAMES[who];

const toBubble = (e: LedgerEvent, anchor: BotId): Bubble => ({
  eventId: e.id,
  anchor,
  to: e.to,
  variant: e.to === "you" ? "to-you" : "bot-to-bot",
  chip: `to ${nameOf(e.to)}`,
  ariaLabel: `${BOT_NAMES[anchor]} to ${nameOf(e.to)}: ${e.text}`,
  source: e.source,
  gaze: e.to,
  text: e.text,
});

/** Latest event per speaking bot; one bubble per bot. */
export const deriveBubbles = (ledger: readonly LedgerEvent[]): Bubble[] => {
  const latest = new Map<BotId, LedgerEvent>();
  for (const e of ledger) if (e.from !== "you") latest.set(e.from, e);
  return (["pip", "nova"] as const).flatMap((bot) => {
    const e = latest.get(bot);
    return e ? [toBubble(e, bot)] : [];
  });
};
