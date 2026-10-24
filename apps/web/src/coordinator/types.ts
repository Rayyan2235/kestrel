import type {
  Addressee,
  BotId,
  LedgerEvent,
  Respond,
} from "@kestrel/contracts";

export type BotState =
  | "idle"
  | "listening"
  | "transcribing"
  | "thinking"
  | "acting"
  | "waiting"
  | "done"
  | "error";

export type CoordinatorConfig = {
  /** Per-call timeout. */
  callTimeoutMs: number;
  /** Chain cap, measured from call-1 dispatch. Must exceed 2 x callTimeoutMs. */
  chainCapMs: number;
  maxCalls: 2;
  maxHops: 1;
};

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  callTimeoutMs: 7000,
  chainCapMs: 16000,
  maxCalls: 2,
  maxHops: 1,
};

/** What the fast path wants said and done for a built-in command. */
export type LocalReply = { say: string; action: Respond["action"] };

export type Budget = { callsUsed: number; hopsUsed: number; capMs: number };

export type TurnHandle = {
  rootTurnId: string;
  /** Recipient bound at press-start; later selection changes never retarget it. */
  recipient: BotId;
  /** Settles when the chain ends (done, aborted, handback or error). */
  done: Promise<void>;
};

export interface Coordinator {
  ledger(): readonly LedgerEvent[];
  botState(bot: BotId): BotState;
  budget(): Budget;
  /** Who a handback is addressed to once the chain ends. */
  focus(): Addressee;
  subscribe(listener: () => void): () => void;
  /** Learner talks to `recipient`, bound now. Aborts any running chain. */
  learnerTurn(text: string, recipient: BotId): TurnHandle;
  /** Learner command answered by the fast path: no provider call, source `built-in`. Aborts any running chain. */
  localTurn(recipient: BotId, text: string, reply: LocalReply): TurnHandle;
  /** Learner pulls a handoff: `from` asks `to`, `to` answers the learner. */
  askPeer(from: BotId, to: BotId): TurnHandle;
  /** Aborts the chain and drops late results. */
  stop(): void;
  /** Aborts, resets the world, bumps epoch and version. */
  reset(): void;
}
