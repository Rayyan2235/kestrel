import type { BotId, LedgerEvent } from "@kestrel/contracts";
import type { Budget, BotState } from "../coordinator/types.js";
import { notImplemented } from "../notImplemented.js";

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
  _ledger: readonly LedgerEvent[],
  _status: Record<BotId, BotState>,
  _budget: Budget,
): ChannelView => notImplemented("deriveChannel");
