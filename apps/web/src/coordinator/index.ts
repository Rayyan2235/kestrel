import {
  BOT_NAMES,
  RespondSchema,
  eventId,
  type Addressee,
  type BotId,
  type LedgerEvent,
  type LedgerKind,
  type Respond,
  type Source,
} from "@kestrel/contracts";
import type { Provider, ProviderRequest } from "../provider/types.js";
import type { SimAdapter } from "../simulation/types.js";
import {
  DEFAULT_COORDINATOR_CONFIG,
  type BotState,
  type Budget,
  type Coordinator,
  type CoordinatorConfig,
  type LocalReply,
  type TurnHandle,
} from "./types.js";

export type CoordinatorDeps = {
  sim: SimAdapter;
  provider: Provider;
  config?: Partial<CoordinatorConfig>;
};

export * from "./types.js";

const other = (bot: BotId): BotId => (bot === "pip" ? "nova" : "pip");
const fit = (text: string): string => text.trim().slice(0, 500) || "...";

type CallResult =
  { ok: true; respond: Respond; source: Source } | { ok: false };
/** `summary`: the sim's own words for what it measured or why it refused. */
type ActResult = { ok: boolean; summary?: string };

export const createCoordinator = (deps: CoordinatorDeps): Coordinator => {
  const { sim, provider } = deps;
  const cfg: CoordinatorConfig = {
    ...DEFAULT_COORDINATOR_CONFIG,
    ...deps.config,
  };
  let ledger: LedgerEvent[] = [];
  let epoch = 0;
  let chain: AbortController | null = null;
  let states: Record<BotId, BotState> = { pip: "idle", nova: "idle" };
  let budget: Budget = { callsUsed: 0, hopsUsed: 0, capMs: cfg.chainCapMs };
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((fn) => fn());
  const setState = (bot: BotId, state: BotState) => {
    states = { ...states, [bot]: state };
    emit();
  };

  /** Aborts whatever is running and invalidates its late results. */
  const supersede = () => {
    chain?.abort(new Error("superseded"));
    chain = null;
    epoch += 1;
    states = { pip: "idle", nova: "idle" };
  };

  const run = async (
    token: number,
    signal: AbortSignal,
    bot: BotId,
    input: string,
    learnerText: string,
    pull: BotId | null,
    local: LocalReply | null,
  ): Promise<void> => {
    const alive = () => token === epoch;
    let last: string | null = null;
    const add = (
      from: Addressee,
      to: Addressee,
      kind: LedgerKind,
      text: string,
      source: Source,
      hop: number,
      evidence?: string,
    ) => {
      const seq = ledger.length;
      const id = eventId(token, seq);
      ledger = [
        ...ledger,
        {
          id,
          seq,
          rootTurnId: `t${token}`,
          causedBy: last,
          epoch: token,
          worldVersion: sim.snapshot().version,
          source,
          kind,
          hop,
          from,
          to,
          text: fit(text),
          ...(evidence ? { evidence } : {}),
        },
      ];
      last = id;
      emit();
    };

    /** One provider call, bounded by the per-call timeout and the chain signal. */
    const call = async (req: ProviderRequest): Promise<CallResult> => {
      budget = { ...budget, callsUsed: budget.callsUsed + 1 };
      const callCtl = new AbortController();
      const onChainAbort = () => callCtl.abort(signal.reason);
      signal.addEventListener("abort", onChainAbort, { once: true });
      const timer = setTimeout(
        () => callCtl.abort(new Error("call timeout")),
        cfg.callTimeoutMs,
      );
      const aborted = new Promise<never>((_, reject) => {
        callCtl.signal.addEventListener(
          "abort",
          () => reject(callCtl.signal.reason),
          { once: true },
        );
      });
      try {
        const reply = await Promise.race([
          provider.respond(req, callCtl.signal),
          aborted,
        ]);
        const parsed = RespondSchema.safeParse(reply.respond);
        return parsed.success
          ? { ok: true, respond: parsed.data, source: reply.source }
          : { ok: false };
      } catch {
        return { ok: false };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onChainAbort);
      }
    };

    /**
     * Applies a bot action through the sim; `version` is the world at dispatch.
     * Runs before the reply is appended so the event carries the new worldVersion.
     */
    const act = async (
      who: BotId,
      respond: Respond,
      version: number,
    ): Promise<ActResult> => {
      if (!respond.action) return { ok: true };
      setState(who, "acting");
      const task = {
        id: `t${token}-${budget.callsUsed}`,
        object:
          respond.action.side === "left"
            ? ("left-weight" as const)
            : ("right-weight" as const),
        owner: who,
        cm: respond.action.cm,
      };
      const proposed = sim.propose(task);
      if (!proposed.ok) return { ok: false, summary: proposed.summary };
      pauseCap();
      const actCtl = new AbortController();
      const onChainAbort = () => actCtl.abort(signal.reason);
      signal.addEventListener("abort", onChainAbort, { once: true });
      const timer = setTimeout(
        () => actCtl.abort(new Error("act timeout")),
        cfg.actTimeoutMs,
      );
      try {
        const applied = await sim.apply(task, version, actCtl.signal);
        if (!applied.ok) sim.release(task);
        return { ok: applied.ok, summary: applied.summary };
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onChainAbort);
        resumeCap();
      }
    };
    /** Says what the sim measured, or why the move did not happen. */
    const report = (who: BotId, moved: ActResult) => {
      const text = moved.ok
        ? moved.summary
        : (moved.summary ?? "The lab changed, so I did not make that move.");
      if (text) add(who, "you", "notice", text, "scripted", 0);
    };

    // The cap bounds talk time. It pauses while a bot acts in the world: a
    // physical push takes seconds and is bounded by actTimeoutMs instead.
    const capHit = () => chain?.abort(new Error("chain cap"));
    let capLeft = cfg.chainCapMs;
    let capFrom = Date.now();
    let capTimer = setTimeout(capHit, capLeft);
    function pauseCap() {
      clearTimeout(capTimer);
      capLeft -= Date.now() - capFrom;
    }
    function resumeCap() {
      capFrom = Date.now();
      capTimer = setTimeout(capHit, Math.max(0, capLeft));
    }
    try {
      add("you", bot, "learner", learnerText, "built-in", 0);
      setState(bot, "thinking");
      const v1 = sim.snapshot().version;
      // A built-in command answers locally: no provider call, labelled `built-in`.
      const r1: CallResult = local
        ? {
            ok: true,
            respond: { say: local.say, action: local.action, ask_peer: null },
            source: "built-in",
          }
        : await call({
            bot,
            rootTurnId: `t${token}`,
            worldVersion: v1,
            input,
            peer: null,
          });
      if (!alive()) return;
      if (!r1.ok) {
        add(
          bot,
          "you",
          "notice",
          "I did not get an answer in time. Try again?",
          "scripted",
          0,
        );
        setState(bot, "error");
        return;
      }
      const moved1 = await act(bot, r1.respond, v1);
      if (!alive()) return;
      add(bot, "you", "say", r1.respond.say, r1.source, 0);
      report(bot, moved1);
      const ask = r1.respond.ask_peer;
      const peer =
        pull ?? (ask && ask.to !== bot && cfg.maxHops >= 1 ? ask.to : null);
      if (!peer) return;

      const question = ask?.question ?? "Can you check this with me?";
      const evidence = ask?.evidence ?? "Balance reading";
      budget = { ...budget, hopsUsed: 1 };
      add(bot, peer, "handoff", question, r1.source, 1, evidence);
      setState(bot, "waiting");
      setState(peer, "thinking");
      const v2 = sim.snapshot().version;
      const r2 = await call({
        bot: peer,
        rootTurnId: `t${token}`,
        worldVersion: v2,
        input,
        peer: { from: bot, question, evidence },
      });
      if (!alive()) return;
      // A second ask would be a second hop: the fixed handback replaces it.
      if (!r2.ok || r2.respond.ask_peer !== null) {
        add(
          peer,
          "you",
          "handback",
          `${BOT_NAMES[peer]} could not settle this in time. What do you predict?`,
          "scripted",
          1,
        );
        return;
      }
      const moved2 = await act(peer, r2.respond, v2);
      if (!alive()) return;
      // The handback stays last so the learner always gets the final turn.
      report(peer, moved2);
      add(peer, "you", "handback", r2.respond.say, r2.source, 1);
    } finally {
      clearTimeout(capTimer);
      if (alive()) {
        for (const b of ["pip", "nova"] as const)
          if (states[b] !== "error") states = { ...states, [b]: "idle" };
        emit();
      }
    }
  };

  const start = (
    bot: BotId,
    input: string,
    learnerText: string,
    pull: BotId | null,
    local: LocalReply | null = null,
  ): TurnHandle => {
    supersede();
    const token = epoch;
    chain = new AbortController();
    budget = { callsUsed: 0, hopsUsed: 0, capMs: cfg.chainCapMs };
    // Dispatched synchronously: the recipient is bound now, not when the reply lands.
    const done = run(token, chain.signal, bot, input, learnerText, pull, local);
    return { rootTurnId: `t${token}`, recipient: bot, done };
  };

  return {
    ledger: () => ledger,
    botState: (bot) => states[bot],
    budget: () => budget,
    focus: () => "you",
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    learnerTurn: (text, recipient) => start(recipient, text, text, null),
    localTurn: (recipient, text, reply) =>
      start(recipient, text, text, null, reply),
    askPeer: (from, to) =>
      start(from, `Ask ${BOT_NAMES[to]}`, `Ask ${BOT_NAMES[to]}`, to),
    stop: () => {
      supersede();
      emit();
    },
    reset: () => {
      supersede();
      ledger = [];
      budget = { callsUsed: 0, hopsUsed: 0, capMs: cfg.chainCapMs };
      sim.reset();
      emit();
    },
  };
};
