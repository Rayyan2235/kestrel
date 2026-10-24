import type { BotId, LedgerEvent } from "@kestrel/contracts";
import type { Budget, BotState } from "../coordinator/types.js";

export type ChannelView = {
  /** "You and Pip": events where the learner is `from` or `to`. */
  youThread: LedgerEvent[];
  /** "Pip and Nova": events between bots. The learner cannot type here. */
  botChannel: LedgerEvent[];
  status: Record<BotId, BotState>;
  budget: Budget;
  /** Set when the last event is a handback to the learner. */
  handback: LedgerEvent | null;
  learnerCanType: false;
};

export const deriveChannel = (
  ledger: readonly LedgerEvent[],
  status: Record<BotId, BotState>,
  budget: Budget,
): ChannelView => {
  const withYou = (e: LedgerEvent) => e.from === "you" || e.to === "you";
  const last = ledger.at(-1);
  return {
    youThread: ledger.filter(withYou),
    botChannel: ledger.filter((e) => !withYou(e)),
    status,
    budget,
    handback: last?.kind === "handback" && last.to === "you" ? last : null,
    learnerCanType: false,
  };
};
