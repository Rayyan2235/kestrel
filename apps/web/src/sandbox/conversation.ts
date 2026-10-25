import {
  createWorld,
  eventId,
  type Addressee,
  type BotId,
  type LedgerEvent,
  type LedgerKind,
  type Source,
  type World,
} from "@kestrel/contracts";
import type { SimAdapter } from "../simulation/types.js";
import type { SimStatus } from "../simulation/duckSim";

/**
 * The console's conversation ledger, kept beside the log and the agent. A
 * learner line records `you -> selected bot`; a duck reply records
 * `bot -> you`. Bubbles, threads and the channel all derive from `to`.
 */
export interface Conversation {
  events(): readonly LedgerEvent[];
  subscribe(listener: () => void): () => void;
  selected(): BotId;
  select(bot: BotId): void;
  record(
    from: Addressee,
    to: Addressee,
    kind: LedgerKind,
    text: string,
    source: Source,
    extra?: { hop?: number; evidence?: string },
  ): void;
  /** Copies coordinator events (handoff, handback) in, once each. */
  mirror(events: readonly LedgerEvent[]): void;
  /** A new coordinator starts a new ledger: forget what was copied. */
  resetMirror(): void;
}

export const createConversation = (): Conversation => {
  let events: LedgerEvent[] = [];
  let selected: BotId = "pip";
  let turn = 0;
  const mirrored = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const record: Conversation["record"] = (
    from,
    to,
    kind,
    text,
    source,
    extra,
  ) => {
    const body = text.trim().slice(0, 500);
    if (!body || from === to) return;
    if (kind === "learner") turn += 1;
    const seq = events.length;
    events = [
      ...events,
      {
        id: eventId(0, seq),
        seq,
        rootTurnId: `c${turn}`,
        causedBy: events.at(-1)?.id ?? null,
        epoch: 0,
        worldVersion: 0,
        source,
        kind,
        hop: extra?.hop ?? 0,
        from,
        to,
        text: body,
        ...(extra?.evidence ? { evidence: extra.evidence } : {}),
      },
    ];
    emit();
  };
  return {
    events: () => events,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    selected: () => selected,
    select(bot) {
      selected = bot;
      emit();
    },
    record,
    mirror(incoming) {
      for (const e of incoming) {
        if (mirrored.has(e.id)) continue;
        mirrored.add(e.id);
        record(e.from, e.to, e.kind, e.text, e.source, {
          hop: e.hop,
          evidence: e.evidence,
        });
      }
    },
    resetMirror() {
      mirrored.clear();
    },
  };
};

/** Events of the "You and {bot}" thread: the learner talking with that one robot. */
export const threadOf = (
  events: readonly LedgerEvent[],
  bot: BotId,
): LedgerEvent[] =>
  events.filter(
    (e) =>
      (e.from === "you" && e.to === bot) || (e.from === bot && e.to === "you"),
  );

/**
 * Read-only SimAdapter over the console's DuckSim, for the handoff coordinator.
 * It reports the measured balance when there is one and refuses every move:
 * robots in this console move only through the learner's own commands.
 */
export const consoleSim = (
  status: () => Pick<SimStatus, "balance">,
): SimAdapter => {
  const world = (): World => {
    const base = createWorld();
    const rails = status().balance?.rails;
    if (!rails) return base;
    const cm = (id: string) => Math.abs(rails.get(id) ?? 0) * 100;
    const [left, right] = [...rails.keys()];
    return {
      ...base,
      leftCm: left ? Math.round(cm(left) * 10) / 10 : base.leftCm,
      rightCm: right ? Math.round(cm(right) * 10) / 10 : base.rightCm,
    };
  };
  return {
    snapshot: world,
    subscribe: () => () => {},
    propose: () => ({ ok: false, reason: "invalid" }),
    apply: async () => ({ ok: false, reason: "not-proposed" }),
    release: () => {},
    reset: world,
  };
};
