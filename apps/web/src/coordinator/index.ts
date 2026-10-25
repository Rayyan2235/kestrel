import {
  BOT_NAMES,
  RespondSchema,
  CrewRespondSchema,
  balance,
  eventId,
  type Addressee,
  type BotId,
  type LedgerEvent,
  type LedgerKind,
  type Respond,
  type PredictionChoice,
  type CrewRespond,
  type Source,
  type World,
} from "@kestrel/contracts";
import { challengeById } from "../progress/challenges.js";
import { outcomeOf, STUB_TOL_GCM } from "../progress/outcome.js";
import type { LabEventLog } from "../progress/events.js";
import type { Provider, ProviderRequest } from "../provider/types.js";
import type { SimAdapter } from "../simulation/types.js";
import {
  DEFAULT_COORDINATOR_CONFIG,
  type BotState,
  type Budget,
  type Coordinator,
  type HeldMove,
  type HeldMoveContext,
  type SetupMove,
  type CoordinatorConfig,
  type LocalReply,
  type TurnHandle,
} from "./types.js";

export type CoordinatorDeps = {
  sim: SimAdapter;
  provider: Provider;
  config?: Partial<CoordinatorConfig>;
  /** Optional lab event log: challenge moves and predictions are appended here. */
  log?: LabEventLog;
  /** Balance tolerance in g·cm for classifying measured outcomes (stub 0.001, DuckSim 100). */
  tolGcm?: number;
  /** Real sims release the plank after a push: wait this long between reads until positions stop moving (0 = read at once). */
  settleMs?: number;
};

export * from "./types.js";

/** A held move not committed within this long is voided. */
const HELD_IDLE_MS = 60_000;

const other = (bot: BotId): BotId => (bot === "pip" ? "nova" : "pip");
const fit = (text: string): string => text.trim().slice(0, 500) || "...";

type CallResult =
  { ok: true; respond: Respond; source: Source } | { ok: false };
/** `summary`: the sim's own words for what it measured or why it refused. */
type ActResult = { ok: boolean; summary?: string };
/** The peer's built-in reply in a wrong-rail handoff, and the question it is asked. */
type PeerReply = LocalReply & { question: string };
type CrewPlan = { fast: CrewRespond | null };

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

  let challenge: string | null = null;
  /** Void the current held move, if any (set by heldTurn). */
  let voidHeld: ((reason: string) => void) | null = null;
  /** The held or setup move being applied by the sim right now. */
  let inflight: AbortController | null = null;
  /** Resolved attempts per prompt: labels events only, scoring never reads it. */
  const resolved = new Map<string, number>();
  /** Challenges already completed since they started: complete is logged once. */
  const completed = new Set<string>();
  const tol = deps.tolGcm ?? STUB_TOL_GCM;
  /** The robot that works each rail: left (200 g) is Pip, right (100 g) is Nova. */
  const ownerOf = (side: "left" | "right"): BotId =>
    side === "left" ? "pip" : "nova";
  let pushingBot: BotId | null = null;
  /** The robot that made the last measured move: crew-turn lead when nothing else decides. */
  let lastTrial: BotId | null = null;
  /** The world once positions stop changing, so the outcome is read after the plank settles. */
  const settled = async (first: World, token: number): Promise<World> => {
    const gap = deps.settleMs ?? 0;
    if (gap <= 0) return first;
    let prev = first;
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => setTimeout(resolve, gap));
      if (token !== epoch) return prev;
      const now = sim.snapshot();
      if (now.leftCm === prev.leftCm && now.rightCm === prev.rightCm)
        return now;
      prev = now;
    }
    return prev;
  };
  const objectOf = (side: "left" | "right") =>
    side === "left" ? ("left-weight" as const) : ("right-weight" as const);
  const stamp = () => ({ epoch, worldVersion: sim.snapshot().version });

  /** Aborts whatever is running and invalidates its late results. */
  const supersede = () => {
    voidHeld?.("superseded");
    inflight?.abort(new Error("superseded"));
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
    peerLocal: PeerReply | null = null,
    crew: CrewPlan | null = null,
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
        else lastTrial = who;
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
      if (crew) {
        // One reply for the crew: one call (or none on the fast path), one actor at most.
        let reply: CrewRespond | null = crew.fast;
        let source: Source = "built-in";
        if (!reply && provider.crew) {
          budget = { ...budget, callsUsed: budget.callsUsed + 1 };
          try {
            const got = await provider.crew(
              {
                bot,
                rootTurnId: `t${token}`,
                worldVersion: v1,
                input,
                peer: null,
              },
              signal,
            );
            const parsed = CrewRespondSchema.safeParse(got.crew);
            reply = parsed.success ? parsed.data : null;
            source = got.source;
          } catch {
            reply = null;
          }
        }
        if (!alive()) return;
        if (!reply) {
          add(
            bot,
            "you",
            "notice",
            "I did not get an answer in time. Try again?",
            "scripted",
            0,
          );
          return;
        }
        const action = reply.lead.action;
        // Only a weight's own robot may move it; the lead is ours to choose, not the model's.
        const actor = action ? (action.side === "left" ? "pip" : "nova") : bot;
        if (action && actor !== reply.lead.bot)
          add(
            actor,
            "you",
            "notice",
            `${BOT_NAMES[actor]} works the ${action.side} rail.`,
            "scripted",
            0,
          );
        const moved = await act(
          actor,
          { say: reply.lead.say, action, ask_peer: null },
          v1,
        );
        if (!alive()) return;
        add(bot, "you", "say", reply.lead.say, source, 0);
        report(actor, moved);
        if (reply.second)
          add(other(bot), "you", "say", reply.second.say, source, 0);
        return;
      }
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

      const question =
        peerLocal?.question ?? ask?.question ?? "Can you check this with me?";
      const evidence = ask?.evidence ?? "Balance reading";
      budget = { ...budget, hopsUsed: 1 };
      add(bot, peer, "handoff", question, r1.source, 1, evidence);
      setState(bot, "waiting");
      setState(peer, "thinking");
      const v2 = sim.snapshot().version;
      const r2: CallResult = peerLocal
        ? {
            ok: true,
            respond: {
              say: peerLocal.say,
              action: peerLocal.action,
              ask_peer: null,
            },
            source: "built-in",
          }
        : await call({
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
    peerLocal: PeerReply | null = null,
    crew: CrewPlan | null = null,
  ): TurnHandle => {
    supersede();
    const token = epoch;
    chain = new AbortController();
    budget = { callsUsed: 0, hopsUsed: 0, capMs: cfg.chainCapMs };
    // Dispatched synchronously: the recipient is bound now, not when the reply lands.
    const done = run(
      token,
      chain.signal,
      bot,
      input,
      learnerText,
      pull,
      local,
      peerLocal,
      crew,
    );
    return { rootTurnId: `t${token}`, recipient: bot, done };
  };

  /** Challenge move that waits for a prediction; nothing mutates until commit or skip. */
  const heldTurn = (
    recipient: BotId,
    text: string,
    reply: LocalReply,
    context: HeldMoveContext,
  ): HeldMove => {
    supersede();
    const token = epoch;
    const inert: HeldMove = {
      commit: async () => {},
      skip: async () => {},
      cancel: () => {},
    };
    const say = (
      from: Addressee,
      to: Addressee,
      kind: LedgerKind,
      body: string,
    ) => {
      const seq = ledger.length;
      ledger = [
        ...ledger,
        {
          id: eventId(token, seq),
          seq,
          rootTurnId: `t${token}`,
          causedBy: ledger.at(-1)?.id ?? null,
          epoch: token,
          worldVersion: sim.snapshot().version,
          source: "built-in" as const,
          kind,
          hop: 0,
          from,
          to,
          text: fit(body),
        },
      ];
    };
    const { action } = reply;
    if (!action) return inert;
    const task = {
      id: `held-${token}`,
      object: objectOf(action.side),
      owner: recipient,
      cm: action.cm,
    };
    const proposed = sim.propose(task);
    if (!proposed.ok) {
      // The sim refused (out of range, too close, locked): say so, hold nothing, count nothing.
      say("you", recipient, "learner", text);
      say(
        recipient,
        "you",
        "notice",
        proposed.summary ?? "I cannot make that move right now.",
      );
      emit();
      return inert;
    }
    const key = `${context.challengeId}|${context.promptId}`;
    let open = true;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const close = () => {
      open = false;
      if (idle) clearTimeout(idle);
      if (voidHeld === cancel) voidHeld = null;
    };
    const cancel = (reason: string) => {
      if (!open) return;
      sim.release(task);
      close();
      deps.log?.append({
        type: "prediction_voided",
        ...context,
        attempt: (resolved.get(key) ?? 0) + 1,
        reason,
        ...stamp(),
      });
      emit();
    };
    /** Applies the held task; false if it did not happen (stale, failed, aborted, superseded). */
    const finish = async (attempt: number | undefined): Promise<boolean> => {
      const ctl = new AbortController();
      inflight = ctl;
      const timer = setTimeout(
        () => ctl.abort(new Error("act timeout")),
        cfg.actTimeoutMs,
      );
      let applied;
      pushingBot = ownerOf(action.side);
      emit();
      try {
        // The version is read at the learner's lock: a real sim keeps re-measuring
        // (settling) while a move is held, which must not read as a stale world.
        applied = await sim.apply(task, sim.snapshot().version, ctl.signal);
      } finally {
        clearTimeout(timer);
        if (inflight === ctl) inflight = null;
        pushingBot = null;
        emit();
      }
      if (token !== epoch) return false;
      if (!applied.ok) {
        say(
          recipient,
          "you",
          "notice",
          applied.summary ?? "The lab changed, so I did not make that move.",
        );
        return false;
      }
      const world = await settled(applied.world, token);
      if (token !== epoch) return false;
      deps.log?.append({
        type: "move_applied",
        ...context,
        ...(attempt !== undefined ? { attempt } : {}),
        bot: ownerOf(action.side),
        outcome: outcomeOf(world, tol),
        epoch: token,
        worldVersion: world.version,
      });
      if (
        challenge === context.challengeId &&
        !completed.has(challenge) &&
        outcomeOf(world, tol) === challengeById(challenge)?.goal
      ) {
        completed.add(challenge);
        deps.log?.append({
          type: "challenge_complete",
          challengeId: challenge,
          epoch: token,
          worldVersion: world.version,
        });
      }
      say(
        recipient,
        "you",
        "say",
        applied.summary ??
          `The ${action.side} weight is now ${action.cm} cm from the pivot.`,
      );
      emit();
      return true;
    };
    voidHeld = cancel;
    idle = setTimeout(() => cancel("idle timeout"), HELD_IDLE_MS);

    say("you", recipient, "learner", text);
    say(recipient, "you", "say", reply.say);
    emit();

    return {
      async commit(choice: PredictionChoice) {
        if (!open) return;
        close();
        const attempt = (resolved.get(key) ?? 0) + 1;
        deps.log?.append({
          type: "prediction_locked",
          ...context,
          attempt,
          choice,
          epoch: token,
          worldVersion: sim.snapshot().version,
        });
        if (await finish(attempt)) resolved.set(key, attempt);
        else {
          sim.release(task);
          if (token !== epoch) return;
          deps.log?.append({
            type: "prediction_voided",
            ...context,
            attempt,
            reason: "not applied",
            ...stamp(),
          });
        }
      },
      async skip() {
        if (!open) return;
        close();
        if (!(await finish(undefined))) sim.release(task);
      },
      cancel,
    };
  };

  const resetAll = () => {
    supersede();
    ledger = [];
    budget = { callsUsed: 0, hopsUsed: 0, capMs: cfg.chainCapMs };
    sim.reset();
    challenge = null;
    completed.clear();
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
    delegate: (from, to, text, fromSay, peer) =>
      start(from, text, text, to, { say: fromSay, action: null }, peer),
    crewTurn: (text, lead, fast = null) =>
      start(lead, text, text, null, null, null, { fast }),
    lastTrial: () => lastTrial,
    localTurn: (recipient, text, reply) =>
      start(recipient, text, text, null, reply),
    askPeer: (from, to) => {
      const handle = start(
        from,
        `Ask ${BOT_NAMES[to]}`,
        `Ask ${BOT_NAMES[to]}`,
        to,
      );
      if (challenge)
        deps.log?.append({
          type: "ask_peer_used",
          challengeId: challenge,
          ...stamp(),
        });
      return handle;
    },
    heldTurn,
    startChallenge: async (challengeId: string, setup: SetupMove[]) => {
      resetAll();
      const token = epoch;
      for (const [n, move] of setup.entries()) {
        const task = {
          id: `setup-${epoch}-${n}`,
          object: objectOf(move.side),
          owner: "pip" as const,
          cm: move.cm,
        };
        const proposed = sim.propose(task);
        if (!proposed.ok) return false;
        const ctl = new AbortController();
        inflight = ctl;
        const timer = setTimeout(
          () => ctl.abort(new Error("setup timeout")),
          cfg.actTimeoutMs,
        );
        let applied;
        pushingBot = ownerOf(move.side);
        emit();
        try {
          applied = await sim.apply(task, proposed.baseVersion, ctl.signal);
        } finally {
          clearTimeout(timer);
          if (inflight === ctl) inflight = null;
          pushingBot = null;
          emit();
        }
        if (token !== epoch) return false;
        if (!applied.ok) {
          sim.release(task);
          return false;
        }
        deps.log?.append({
          type: "move_applied",
          challengeId,
          bot: ownerOf(move.side),
          outcome: outcomeOf(applied.world, tol),
          setup: true,
          epoch: token,
          worldVersion: applied.world.version,
        });
      }
      if (token !== epoch) return false;
      challenge = challengeId;
      emit();
      return true;
    },
    endChallenge: () => {
      voidHeld?.("left the challenge");
      challenge = null;
      emit();
    },
    challengeId: () => challenge,
    pushing: () => pushingBot,
    holding: () => voidHeld !== null,
    epoch: () => epoch,
    stop: () => {
      supersede();
      emit();
    },
    reset: () => {
      resetAll();
      emit();
    },
  };
};
