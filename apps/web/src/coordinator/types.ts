import type {
  Addressee,
  CrewRespond,
  PredictionChoice,
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
  /** Chain cap on talk time, from call-1 dispatch; paused while a bot acts. Must exceed 2 x callTimeoutMs. */
  chainCapMs: number;
  /** Per-action timeout: a real push takes 10-15 s and the sim reports its own failures sooner. */
  actTimeoutMs: number;
  maxCalls: 2;
  maxHops: 1;
};

export const DEFAULT_COORDINATOR_CONFIG: CoordinatorConfig = {
  callTimeoutMs: 7000,
  chainCapMs: 16000,
  actTimeoutMs: 60000,
  maxCalls: 2,
  maxHops: 1,
};

/** What the fast path wants said and done for a built-in command. */
export type LocalReply = { say: string; action: Respond["action"] };

export type Budget = { callsUsed: number; hopsUsed: number; capMs: number };

export type TurnHandle = {
  rootTurnId: string;
  /** Recipient fixed when the turn is resolved and dispatched; later selection changes never retarget it. */
  recipient: BotId;
  /** Settles when the chain ends (done, aborted, handback or error). */
  done: Promise<void>;
};

/** A move waiting for the learner's prediction. Nothing has mutated yet. */
export type HeldMove = {
  /** Logs prediction_locked, applies, then logs move_applied. Refused once voided. */
  commit(choice: PredictionChoice): Promise<void>;
  /** Applies with no prediction event. Still logs a scorable move_applied (no attempt). */
  skip(): Promise<void>;
  /** Releases the lock and logs prediction_voided. */
  cancel(reason: string): void;
};

export type HeldMoveContext = { challengeId: string; promptId: string };

export type SetupMove = { side: "left" | "right"; cm: number };

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
  /**
   * Wrong rail: `from` was addressed but `to` owns the weight. `from` says its
   * line, hands off, and `to` makes the move (built in) and hands back.
   */
  delegate(
    from: BotId,
    to: BotId,
    text: string,
    fromSay: string,
    peer: LocalReply & { question: string },
  ): TurnHandle;
  /** One reply for the crew: one call (none on the fast path), the lead may act, owner-only. */
  crewTurn(text: string, lead: BotId, fast?: CrewRespond | null): TurnHandle;
  /** The robot that made the last measured move, or null. */
  lastTrial(): BotId | null;
  /** Learner pulls a handoff: `from` asks `to`, `to` answers the learner. */
  askPeer(from: BotId, to: BotId): TurnHandle;
  /**
   * Challenge move that waits for a prediction. The bot says "Lock your
   * prediction, then I'll move it" and the chain ends. `supersede()` cancels it.
   */
  heldTurn(
    recipient: BotId,
    text: string,
    reply: LocalReply,
    context: HeldMoveContext,
  ): HeldMove;
  /** Resets (clears epoch, chat ledger and held move), then applies each setup move tagged `setup`. */
  /** Resolves true when every setup push finished and the challenge started; false if it failed or was superseded. */
  startChallenge(challengeId: string, setup: SetupMove[]): Promise<boolean>;
  /** The bot whose weight is being pushed right now, or null. */
  pushing(): BotId | null;
  /** Leaves the active challenge: cancels any held move; later asks and moves are free play. */
  endChallenge(): void;
  /** Current epoch, for stamping lab events made outside the coordinator. */
  epoch(): number;
  /** True while a held move waits for its prediction. */
  holding(): boolean;
  /** Active challenge id, or null. */
  challengeId(): string | null;
  /** Aborts the chain and drops late results. */
  stop(): void;
  /** Aborts, resets the world, bumps epoch and version. */
  reset(): void;
}
