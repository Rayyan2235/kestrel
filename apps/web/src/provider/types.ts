import type { BotId, Respond } from "@kestrel/contracts";

export type ProviderRequest = {
  bot: BotId;
  rootTurnId: string;
  worldVersion: number;
  /** What the learner said, or the peer question on the second call. */
  input: string;
  peer: { from: BotId; question: string; evidence: string } | null;
};

export type ProviderReply = { respond: Respond; source: "mock" | "live" };

/** The call shape a live provider will also use. Abortable. */
export interface Provider {
  respond(req: ProviderRequest, signal: AbortSignal): Promise<ProviderReply>;
}
