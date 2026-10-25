import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useReducedMotion } from "motion/react";
import { Bird, Check, ChevronDown, Keyboard, Pause, Play, RotateCcw, Square } from "lucide-react";
import { BOT_NAMES, KITS, MOMENTS, type BotId, type DuckTask, type KitId, type LabKit } from "@kestrel/contracts";
import { BubbleLayer, type Anchors } from "../bubbles/BubbleLayer.js";
import { CapsuleOverlay } from "../capsule/CapsuleOverlay.js";
import { createCoordinator } from "../coordinator/index.js";
import type { HeldMove } from "../coordinator/types.js";
import { WorkshopDialog } from "../cosmetics/WorkshopDialog.js";
import { parseFast } from "../fastpath/index.js";
import { ChallengeBar } from "../progress/ChallengeBar.js";
import { challengeById } from "../progress/challenges.js";
import { demoSeed } from "../progress/demoSeed.js";
import { createLabEventLog } from "../progress/events.js";
import { DUCKSIM_TOL_GCM } from "../progress/outcome.js";
import { PredictionPrompt } from "../progress/PredictionPrompt.js";
import { ProgressHud } from "../progress/ProgressHud.js";
import { createProgressStore } from "../progress/store.js";
import { useProgress } from "../progress/useStore.js";
import { createDuckSimAdapter } from "../simulation/real/index.js";
import { ChannelPanel, type RailPane } from "../handoff/ChannelPanel.js";
import { deriveChannel } from "../handoff/model.js";
import { usePresentation } from "../presentation/usePresentation.js";
import { createMockProvider } from "../provider/mock.js";
import { consoleSim, createConversation, threadOf } from "./conversation";
import { crewLead, OWNER, pressStart, resolveAddressees, type AddressContext, type Resolution } from "../addressing/resolve.js";
import { Contained } from "./Contained";
import { AgentSession, balanceSnapshot, type AgentPhase } from "./agentSession";
import { VEL_ANG, VEL_BACK, VEL_FWD } from "../simulation/constants";
import { DuckSim, type SimEvent, type SimStatus } from "../simulation/duckSim";
import type { Skill } from "../simulation/tasks";
import { ExperimentPanel } from "./ExperimentPanel";
import { SandboxScene } from "./SandboxScene";
import styles from "./Sandbox.module.css";
import { ArrowPill, Button } from "./gic";

type LogEntry = { id: number; who: "you" | "duck"; text: string; ok?: boolean };

/** Bubble anchors near each duck, as a percentage of the 3D stage. */
const ANCHORS: Anchors = { pip: { x: 30, y: 60 }, nova: { x: 70, y: 60 } };

const LESSONS: { id: KitId; subject: string; topic: string }[] = [
  { id: "pythagoras", subject: "Maths", topic: "Pythagorean theorem" },
  { id: "moments", subject: "Physics", topic: "Moments" },
  { id: "free", subject: "Sandbox", topic: "Free play" },
];

const OBJECTIVE: Record<KitId, string> = {
  pythagoras:
    "Each square goes on the side of the right triangle that matches it. Count the tiles: does 9 + 16 make 25? Pip and Nova can build it together.",
  moments:
    "Pip moves the 200 g weight, Nova the 100 g. Choose where each goes, predict which way the plank tips, then run it.",
  free: "Walk, turn, kick and push blocks around the lab.",
};

const KEYS: [string, string][] = [
  ["W / ↑", "Forward"],
  ["S / ↓", "Back"],
  ["A D / ← →", "Turn"],
  ["Q / E", "Kick left / right"],
  ["R", "Sit / stand"],
  ["F", "Peck"],
  ["T", "Roll"],
  ["Esc", "Stop task"],
];

/** The console's accordion: its own log, or one of the two conversation panes. */
type ConsoleWindow = "log" | RailPane | null;
const WINDOW_KEY = "kestrel.console.window";
const savedWindow = (): ConsoleWindow => {
  try {
    const v = window.localStorage.getItem(WINDOW_KEY);
    return v === "log" || v === "you" || v === "bots" ? v : v === "none" ? null : "log";
  } catch {
    return "log";
  }
};

const safeStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

function describe(task: DuckTask, name: (id: string) => string = (id) => id): string {
  switch (task.kind) {
    case "move":
      return `${task.meters < 0 ? "Back up" : "Walk forward"} ${Math.abs(Math.round(task.meters * 100))} cm`;
    case "turn":
      return `Turn ${task.degrees > 0 ? "left" : "right"} ${Math.abs(task.degrees)}°`;
    case "go_to":
      return `Go to the ${name(task.target)}`;
    case "push":
      return `Push the ${name(task.target)}${task.toward ? ` to ${task.toward === "slot" ? "its slot" : `the ${name(task.toward)}`}` : ""}`;
    case "kick":
      return `Kick with the ${task.foot} foot`;
    case "place_weight":
      return `Move the ${name(task.target)} to ${task.cm} cm`;
    case "release_plank":
      return "Release the plank";
    case "lock_plank":
      return "Lock the plank";
    case "set_balance":
      return `Balance test: left ${task.left_cm} cm, right ${task.right_cm} cm`;
    case "build_squares":
      return "Build the squares together";
    default:
      return task.kind[0]!.toUpperCase() + task.kind.slice(1);
  }
}

export function SandboxApp() {
  const [kitId, setKitId] = useState<KitId>("pythagoras");
  const [kit, setKit] = useState<LabKit>(() => KITS.pythagoras());
  const [sim, setSim] = useState<DuckSim | null>(null);
  const [boot, setBoot] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [nova, setNova] = useState<SimStatus | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [text, setText] = useState("");
  const [filled, setFilled] = useState<string[]>([]);
  const nextId = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const session = useRef<AgentSession | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("Ready");
  const [voice, setVoice] = useState(true);
  const conv = useMemo(createConversation, []);
  const events = useSyncExternalStore(conv.subscribe, conv.events);
  const selected = useSyncExternalStore(conv.subscribe, conv.selected);
  const selectedRef = useRef<BotId>("pip");
  selectedRef.current = selected;
  /** The robot the current agent turn is bound to. */
  const turnBot = useRef<BotId | null>(null);
  /** A selection made since the last turn, and the open question thread. */
  const selectedSince = useRef<BotId | null>(null);
  const thread = useRef<{ bot: BotId; at: number } | null>(null);
  /** Routing context taken at press-start (stale-voice rule). */
  const pressed = useRef<AddressContext | null>(null);
  const lastRoute = useRef<{ text: string; bot: BotId; at: number } | null>(null);
  const [chip, setChip] = useState<{ label: string; heard: string | null; reaction: string | null } | null>(null);
  const reducedMotion = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  /** DuckSim events fanned out to the SimAdapter that the coordinator reads. */
  const relay = useRef(new Set<(e: SimEvent) => void>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const add = useCallback((who: LogEntry["who"], line: string, ok?: boolean, bot?: BotId, source: "built-in" | "live" = "built-in") => {
    const id = nextId.current++;
    setLog((l) => [...l, { id, who, text: line, ok }].slice(-40));
    // Every line also enters the conversation: the learner to the selected robot, a reply from a robot to the learner.
    if (who === "you") conv.record("you", turnBot.current ?? selectedRef.current, "learner", line, "built-in");
    else conv.record(bot ?? turnBot.current ?? selectedRef.current, "you", "say", line, source);
    // A robot's question to the learner keeps the thread open for 30 s.
    if (who === "duck" && line.trim().endsWith("?")) thread.current = { bot: bot ?? turnBot.current ?? selectedRef.current, at: Date.now() };
  }, [conv]);
  /** The agent's own lines are the Claude agent's (live); the rest are built in. */
  const agentAdd = useCallback((who: LogEntry["who"], line: string, ok?: boolean) => add(who, line, ok, undefined, who === "duck" && ok !== false ? "live" : "built-in"), [add]);

  const onEvent = useCallback(
    (e: SimEvent) => {
      relay.current.forEach((fn) => fn(e));
      session.current?.event(e);
      if (e.type === "task-done") add("duck", e.summary, e.ok, e.duck === "lab" ? undefined : e.duck);
      else if (e.type === "fell") add("duck", e.duck === "pip" ? "Whoops, I fell. Getting back up…" : "Nova fell. Getting back up…", false, e.duck);
      else if (e.type === "recovered") add("duck", e.duck === "pip" ? "Back on my feet." : "Nova is back up.", true, e.duck);
      else if (e.type === "reset" && e.reason !== "Lab loaded" && e.reason !== "Reset") add("duck", e.reason, false);
    },
    [add],
  );

  useEffect(() => {
    let live = true;
    let created: DuckSim | null = null;
    DuckSim.create(KITS.pythagoras(), onEvent, (line) => live && setBoot((b) => [...b, line]))
      .then((s) => {
        created = s;
        if (!live) return;
        s.start();
        setSim(s);
        session.current = new AgentSession(s, agentAdd, setPhase);
        session.current.onTranscript = (heard) => routeRef.current(heard, pressed.current ?? currentRef.current());
        // Dev-only handle for browser tests and debugging.
        if (import.meta.env.DEV) (window as unknown as { kestrelSim: DuckSim }).kestrelSim = s;
      })
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
      session.current?.cancel();
      created?.stop();
    };
  }, [onEvent, agentAdd]);

  // The session can be created after the learner already turned spoken replies off.
  useEffect(() => {
    session.current?.setVoice(voice);
  }, [voice, sim]);

  // Ask Pip / Ask Nova: the labelled mock hands off between the robots and back to the learner.
  // On the Moments lesson the coordinator drives the real robots through the SimAdapter
  // (held challenge moves, measured outcomes); elsewhere it only reads and refuses moves.
  const labLog = useMemo(createLabEventLog, []);
  const demoProfile = new URLSearchParams(window.location.search).get("profile") === "demo";
  const store = useMemo(
    () =>
      createProgressStore({
        log: labLog,
        storage: demoProfile ? null : safeStorage(),
        ...(demoProfile ? { seed: demoSeed() } : {}),
      }),
    [labLog, demoProfile],
  );
  const view = useProgress(store);
  const adapterRef = useRef<ReturnType<typeof createDuckSimAdapter> | null>(null);
  const [adapter, setAdapter] = useState<ReturnType<typeof createDuckSimAdapter> | null>(null);
  // The real adapter measures both weights on the balance, so it is built only once
  // DuckSim reports them, never during render; each lesson change rebuilds it.
  useEffect(() => {
    if (!sim || kitId !== "moments") return;
    let made: ReturnType<typeof createDuckSimAdapter> | null = null;
    const t = window.setInterval(() => {
      const rails = sim.status().balance?.rails;
      if (!rails || !MOMENTS.weights.every((w) => rails.has(w.id))) return;
      window.clearInterval(t);
      try {
        made = createDuckSimAdapter(sim, (fn) => {
          relay.current.add(fn);
          return () => void relay.current.delete(fn);
        });
        adapterRef.current = made;
        setAdapter(made);
      } catch (e) {
        console.error("Moments adapter could not start", e);
      }
    }, 100);
    return () => {
      window.clearInterval(t);
      made?.dispose();
      if (adapterRef.current === made) adapterRef.current = null;
      setAdapter(null);
    };
  }, [sim, kitId]);
  const { coordinator } = useMemo(
    () => ({
      coordinator: createCoordinator({
        sim: adapter ?? consoleSim(() => ({ balance: sim?.status().balance ?? null })),
        provider: createMockProvider({ delayMs: 1000 }),
        ...(adapter ? { log: labLog, tolGcm: DUCKSIM_TOL_GCM, settleMs: 400 } : {}),
      }),
    }),
    [sim, adapter, labLog],
  );
  useEffect(() => {
    conv.resetMirror();
    return coordinator.subscribe(() => {
      conv.mirror(coordinator.ledger());
      rerender();
    });
  }, [coordinator, conv]);
  const held = useRef<HeldMove | null>(null);
  const [workshop, setWorkshop] = useState(false);
  const [setup, setSetup] = useState<"idle" | "busy" | "failed">("idle");
  const challengeId = coordinator.challengeId();
  const completed = challengeId !== null && view.awards.some((a) => a.awardId === `complete|${challengeId}`);
  const explained = challengeId !== null && view.awards.some((a) => a.awardId === `explain|${challengeId}`);
  const pres = usePresentation(events, { paused, speed: 1, reducedMotion });
  const botStatus = { pip: coordinator.botState("pip"), nova: coordinator.botState("nova") };
  const asking = (["pip", "nova"] as const).some((b) => ["thinking", "waiting", "acting"].includes(botStatus[b]));
  const channel = { ...deriveChannel(events, botStatus, coordinator.budget()), youThread: threadOf(events, selected) };

  useEffect(() => {
    if (!sim) return;
    const t = window.setInterval(() => {
      setStatus(sim.status());
      setNova(sim.status("nova"));
    }, 200);
    return () => window.clearInterval(t);
  }, [sim]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  function chooseLesson(id: KitId) {
    session.current?.cancel(true);
    coordinator.endChallenge();
    // The adapter polls the balance, which only exists on the Moments lesson.
    adapterRef.current?.dispose();
    adapterRef.current = null;
    const next = KITS[id]();
    setKitId(id);
    setKit(next);
    setFilled([]);
    sim?.setKit(next);
    add("duck", `Lesson set: ${next.subject} · ${next.topic}.`);
  }

  /** A two-robot plan or experiment, started by the learner. */
  const crew = (task: DuckTask): string | null => {
    if (!sim) return null;
    session.current?.cancel();
    const refusal = sim.runTask(task);
    add("duck", refusal ?? `${describe(task)}: Pip and Nova are on it.`, !refusal);
    return refusal;
  };

  // The learner works the plank's lock pin directly; the measured result lands in the log.
  const plank = (kind: "release_plank" | "lock_plank") => {
    if (!sim) return;
    session.current?.cancel();
    const refusal = sim.runTask({ kind });
    if (refusal) add("duck", refusal, false);
  };

  const skill = useCallback(
    (s: Skill, label: string) => {
      if (!sim) return;
      session.current?.cancel();
      const refusal = sim.trigger(s);
      add("duck", refusal ?? `${label}.`, !refusal);
    },
    [sim, add],
  );

  // Keyboard: held keys drive the walking command; letters fire skills.
  useEffect(() => {
    if (!sim) return;
    const held = new Set<string>();
    const apply = () => {
      const fwd = held.has("w") || held.has("arrowup");
      const back = held.has("s") || held.has("arrowdown");
      const left = held.has("a") || held.has("arrowleft");
      const right = held.has("d") || held.has("arrowright");
      sim.manual = {
        vx: fwd ? VEL_FWD : back ? VEL_BACK : 0,
        wz: left ? VEL_ANG : right ? -VEL_ANG : 0,
      };
    };
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); session.current?.cancel(); add("duck", "Stopped."); return; }
      if (typing(e) || e.metaKey || e.ctrlKey) return;
      if (e.code === "Space") { e.preventDefault(); if (!e.repeat) talk(); return; }
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
        session.current?.cancel();
        held.add(k);
        apply();
        return;
      }
      if (e.repeat) return;
      if (k === "q") skill("kickL", "Left kick");
      else if (k === "e") skill("kickR", "Right kick");
      else if (k === "r") {
        const s = sim.status();
        skill(s.mode === "sitstand" ? "stand" : "sit", s.mode === "sitstand" ? "Standing up" : "Sitting down");
      } else if (k === "f") skill("peck", "Peck");
      else if (k === "t") skill("roll", "Roll");
      else if (k === "escape") {
        sim.stopAll();
        add("duck", "Stopped.");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") { e.preventDefault(); session.current?.endCapture(); }
      held.delete(e.key.toLowerCase());
      apply();
    };
    const blur = () => {
      session.current?.cancel();
      held.clear();
      apply();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [sim, skill, add]);

  // The session is created once; these refs always point at the latest router.
  const routeRef = useRef<(cmd: string, ctx: AddressContext) => void>(() => {});
  const currentRef = useRef<() => AddressContext>(() => ({ selected: null, thread: null }));
  useEffect(() => {
    routeRef.current = route;
    currentRef.current = currentContext;
    // Dev-only handle for browser tests: a fixture transcript, as if spoken (no mic, no Scribe).
    if (import.meta.env.DEV)
      (window as unknown as { kestrelVoice: unknown }).kestrelVoice = {
        press: () => (pressed.current = pressStart(currentContext())),
        transcript: (heard: string) => route(heard, pressed.current ?? currentContext()),
      };
  });

  function send(e: FormEvent) {
    e.preventDefault();
    if (!sim || !text.trim()) return;
    route(text.trim(), currentContext());
    setText("");
  }

  function currentContext(): AddressContext {
    const open = thread.current && Date.now() - thread.current.at < 30_000 ? thread.current.bot : null;
    return { selected: selectedSince.current, thread: open };
  }

  /** Hold-to-talk: the no-name target is taken now, before the transcript arrives. */
  function talk() {
    pressed.current = pressStart(currentContext());
    void session.current?.startCapture();
  }

  /** One router for typed and spoken turns: name first, then the precedence rules. */
  function route(cmd: string, ctx: AddressContext) {
    let r: Resolution;
    try {
      r = resolveAddressees(cmd, ctx);
    } catch {
      r = { to: [selectedRef.current], mode: "selected", body: cmd, mentions: [], heard: null, unsure: false, side: null };
    }
    selectedSince.current = null;
    const world = adapterRef.current?.snapshot();
    const fast = world ? parseFast(r.body, { focus: null, leftCm: world.leftCm, rightCm: world.rightCm, undo: [] }) : null;
    const move = fast?.kind === "move" ? { side: fast.side, cm: fast.cm } : null;
    const crew = r.to.length > 1;
    const bot = r.to[0]!;
    const other = (b: BotId): BotId => (b === "pip" ? "nova" : "pip");
    const label = crew ? "to Crew" : `to ${BOT_NAMES[bot]}${r.unsure ? "?" : ""}`;
    setChip({
      label: crew ? `${label} · one reply for the crew` : label,
      heard: r.heard,
      reaction: r.mode === "owner" ? `${BOT_NAMES[other(bot)]} turns and nods` : null,
    });
    if (r.mode === "clarify") {
      turnBot.current = bot;
      add("you", cmd);
      add("duck", "Which weight? The left one (200 g) or the right one (100 g)?", true, bot);
      return;
    }
    // While a challenge is active, a fast-path move waits for the learner's prediction.
    const id = coordinator.challengeId();
    if (id && move) {
      const challenge = challengeById(id)!;
      held.current = coordinator.heldTurn(
        crew ? OWNER[move.side] : bot,
        cmd,
        { say: "Lock your prediction, then I'll move it.", action: move },
        { challengeId: id, promptId: challenge.prompts[0]!.promptId },
      );
      return;
    }
    if (crew) {
      const lead = crewLead(move?.side ?? r.side, coordinator.lastTrial(), null);
      void coordinator.crewTurn(
        cmd,
        lead,
        move
          ? {
              lead: { bot: OWNER[move.side], say: `Moving the ${move.side} weight to ${move.cm} cm.`, action: move },
              second: { bot: other(OWNER[move.side]), say: "I'll watch the tilt." },
            }
          : null,
      );
      return;
    }
    // Wrong rail: the named robot answers, then hands the push to the weight's owner.
    if (move && OWNER[move.side] !== bot) {
      const owner = OWNER[move.side];
      void coordinator.delegate(bot, owner, cmd, `That's ${BOT_NAMES[owner]}'s rail. ${BOT_NAMES[owner]}, can you?`, {
        say: `Moving the ${move.side} weight to ${move.cm} cm.`,
        action: move,
        question: `Can you move the ${move.side} weight to ${move.cm} cm?`,
      });
      return;
    }
    turnBot.current = bot;
    lastRoute.current = { text: cmd, bot, at: Date.now() };
    void session.current?.submit(cmd, bot);
  }

  /** Tapping the other robot within 3 s, before anything moves, sends the turn to it instead. */
  function selectBot(b: BotId) {
    conv.select(b);
    selectedSince.current = b;
    const last = lastRoute.current;
    if (last && last.bot !== b && Date.now() - last.at < 3000 && session.current?.phase !== "Acting") {
      lastRoute.current = null;
      session.current?.cancel();
      turnBot.current = b;
      setChip({ label: `to ${BOT_NAMES[b]}`, heard: null, reaction: null });
      void session.current?.submit(last.text, b);
    }
  }

  // One window open at a time; the choice is remembered on this device.
  const [win, setWin] = useState<ConsoleWindow>(savedWindow);
  useEffect(() => {
    try {
      window.localStorage.setItem(WINDOW_KEY, win ?? "none");
    } catch {
      /* private mode: the choice just isn't remembered */
    }
  }, [win]);
  const toggle = (w: Exclude<ConsoleWindow, null>) => setWin((open) => (open === w ? null : w));
  // When the robots start talking to each other, unfold their window.
  const botLines = useRef(channel.botChannel.length);
  useEffect(() => {
    if (channel.botChannel.length > botLines.current) setWin("bots");
    botLines.current = channel.botChannel.length;
  }, [channel.botChannel.length]);
  // Log lines that arrived while the log was folded.
  const [logSeen, setLogSeen] = useState(0);
  useEffect(() => {
    if (win === "log") setLogSeen(log.length);
    else setLogSeen((n) => Math.min(n, log.length));
  }, [win, log.length]);
  const logUnseen = win === "log" ? 0 : log.length - logSeen;

  const name = (id: string) => sim?.kit.props.find((p) => p.id === id)?.label ?? id;
  const lesson = LESSONS.find((l) => l.id === kitId)!;
  const solved = kit.slots.length > 0 && filled.length === kit.slots.length;
  const sitting = status?.mode === "sitstand";
  const balance = status?.balance ? balanceSnapshot(status.balance) : null;

  return (
    <div className={`gic-root ${styles.app}`}>
      <main className={styles.workspace}>
        <header className={styles.header}>
          <nav className={`gic-nav ${styles.nav}`} aria-label="Lesson">
            <a className={styles.brand} href="/" aria-label="Kestrel home">
              <Bird size={22} strokeWidth={1.8} aria-hidden="true" />
              <h1>Kestrel</h1>
            </a>
            <div className={styles.lessons}>
              {LESSONS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={styles.lesson}
                  aria-pressed={l.id === kitId}
                  onClick={() => chooseLesson(l.id)}
                  disabled={!sim}
                >
                  <small>{l.subject}</small> {l.topic}
                </button>
              ))}
            </div>
          </nav>
        </header>

        <section className={styles.stage} aria-label="3D playground">
          {sim ? (
            <>
              <SandboxScene sim={sim} kit={kit} tint="#5caca4" onProgress={setFilled} bubble={null} />
              <Contained label="Speech bubbles">
                <div className={styles.overlayTokens}>
                  <BubbleLayer beat={pres.beat} phase={pres.phase} collapsed={pres.collapsed} anchors={ANCHORS} staleBefore={null} />
                  <CapsuleOverlay beat={pres.beat} state={pres.capsuleState} anchors={ANCHORS} reducedMotion={reducedMotion} paused={paused} speed={1} />
                </div>
              </Contained>
            </>
          ) : (
            <div className={styles.boot} role="status">
              <strong>{error ? "The playground could not start" : "Opening the playground…"}</strong>
              {boot.map((b) => (
                <span key={b}>{b}</span>
              ))}
              {error && <span className={styles.error}>{error}</span>}
            </div>
          )}

          <div className={`gic-toast ${styles.lessonCard}`}>
            <p className={`heading-sm ${styles.eyebrow}`}>
              {lesson.subject} · {lesson.topic}
            </p>
            <p className="body">{OBJECTIVE[kitId]}</p>
            {kit.slots.length > 0 && (
              <div className={styles.chips}>
                {kit.slots.map((s) => (
                  <span key={s.id} className={filled.includes(s.id) ? "gic-tag gic-tag--on" : "gic-tag"}>
                    {filled.includes(s.id) && <Check size={12} />} {s.label}
                  </span>
                ))}
              </div>
            )}
            {solved && <strong className={`body ${styles.solved}`}>Right triangle built: 9 + 16 = 25.</strong>}
            {kit.id === "pythagoras" && !solved && (
              <Button variant="solid" className={styles.runButton} onClick={() => crew({ kind: "build_squares" })} disabled={!sim || status?.task?.kind === "build_squares"}>
                {status?.task?.kind === "build_squares" ? `Building · ${status.experiment?.phase ?? ""}` : "Build it together"}
              </Button>
            )}
            {balance && (
              <div className={styles.chips} data-testid="balance">
                {balance.weights.map((w) => (
                  <span key={w.id} className="gic-tag">
                    {w.grams} g · {w.side} · {w.cm} cm
                  </span>
                ))}
                <span className={balance.plank === "released" ? "gic-tag gic-tag--on" : "gic-tag"}>
                  {balance.plank === "released"
                    ? balance.lowSide === "level"
                      ? "Level"
                      : `${balance.lowSide === "left" ? "Left" : "Right"} side down ${balance.tiltDeg}°`
                    : balance.plank === "levelling"
                      ? "Levelling…"
                      : "Plank locked"}
                </span>
                <Button variant="link" className={styles.plankButton} onClick={() => plank(balance.plank === "locked" ? "release_plank" : "lock_plank")}>
                  {balance.plank === "locked" ? "Release plank" : "Lock plank"}
                </Button>
              </div>
            )}
            {balance && status && <ExperimentPanel status={status} run={(l, r) => crew({ kind: "set_balance", left_cm: l, right_cm: r })} />}
            {kitId === "moments" && !adapter && (
              <p className={styles.lightScope} role="status" data-testid="progress-loading">
                Loading lab…
              </p>
            )}
            {kitId === "moments" && adapter && (
              <Contained label="Progress">
                <section className={styles.lightScope} aria-label="Challenges and progress">
                  <ProgressHud store={store} paused={paused} speed={1} onWorkshop={() => setWorkshop(true)} />
                  <ChallengeBar
                    active={challengeId}
                    completed={completed}
                    explained={explained}
                    onStart={(id) => {
                      setSetup("busy");
                      void coordinator.startChallenge(id, challengeById(id)!.setup).then((ok) => setSetup(ok ? "idle" : "failed"));
                    }}
                    onExplain={() =>
                      challengeId &&
                      labLog.append({ type: "explanation_submitted", challengeId, epoch: coordinator.epoch(), worldVersion: adapterRef.current?.snapshot().version ?? 0 })
                    }
                  />
                  {setup === "busy" && <p role="status" data-testid="setup-status">Setting up the beam…</p>}
                  {setup === "failed" && <p role="alert" data-testid="setup-failed">Setup did not finish. Try again.</p>}
                  {coordinator.pushing() && setup !== "busy" && (
                    <p role="status" data-testid="pushing">{BOT_NAMES[coordinator.pushing()!]} is pushing the weight…</p>
                  )}
                  {coordinator.holding() && held.current && (
                    <PredictionPrompt onChoose={(choice) => void held.current?.commit(choice)} onSkip={() => void held.current?.skip()} />
                  )}
                  <WorkshopDialog store={store} open={workshop} onOpenChange={setWorkshop} persisted={!demoProfile} />
                  {demoProfile && <p>Demo profile: progress is not saved.</p>}
                </section>
              </Contained>
            )}
          </div>

          <div className={`gic-toast ${styles.keys}`} aria-label="Keyboard controls">
            <Keyboard size={15} aria-hidden="true" />
            {KEYS.map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd> {v}
              </span>
            ))}
            <span className={styles.note}>No jump: the base Microduck model has no jump skill.</span>
          </div>
        </section>

        <aside className={`gic-toast ${styles.console}`} aria-label="Duck console">
          <div className={styles.consoleHead}>
            <p className="heading-sm">
              <span className={styles.dot} />
              Your duck
            </p>
            <span className="gic-tag" data-testid="duck-mode">
              {status ? (sitting ? (status.sitting ? "sitting" : "sitting down") : status.mode) : "loading"}
            </span>
          </div>
          {status && (
            <dl className={styles.telemetry}>
              <div>
                <dt>x</dt>
                <dd>{status.pose.x.toFixed(2)} m</dd>
              </div>
              <div>
                <dt>y</dt>
                <dd>{status.pose.y.toFixed(2)} m</dd>
              </div>
              <div>
                <dt>heading</dt>
                <dd>{status.pose.yawDeg}°</dd>
              </div>
              <div>
                <dt>control</dt>
                <dd>{status.hz} Hz</dd>
              </div>
            </dl>
          )}
          {status && nova && (
            <div className={`label ${styles.crew}`} data-testid="crew">
              <span>
                <i className={styles.pipDot} /> Pip · {status.phase ?? (status.task ? "busy" : status.mode)}
              </span>
              <span>
                <i className={styles.novaDot} /> Nova · {nova.phase ?? (nova.task ? "busy" : nova.mode)}
              </span>
            </div>
          )}

          <div className={styles.windows}>
            <section className={styles.window} data-open={win === "log"} aria-label="Log">
              <h2>
                <button className={styles.fold} aria-expanded={win === "log"} aria-controls="console-log" data-testid="fold-log" onClick={() => toggle("log")}>
                  Log
                  {logUnseen > 0 && (
                    <span className={styles.count}>
                      {logUnseen}
                      <span className={styles.srOnly}> new</span>
                    </span>
                  )}
                  <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
                </button>
              </h2>
              <div className={styles.log} id="console-log" role="log" aria-live="polite" ref={logRef} hidden={win !== "log"}>
                {log.length === 0 ? (
                  <p className={`body ${styles.empty}`}>
                    Hold to talk, or ask <em>What is the Pythagorean theorem?</em> I can explain and move the squares to demonstrate. You can also ask me to push a box or drive with the keyboard.
                  </p>
                ) : (
                  log.map((l) => (
                    <div key={l.id} className={`body-alt ${l.who === "you" ? styles.fromYou : styles.fromDuck}`}>
                      {l.ok === false && <span className={styles.warn}>!</span>}
                      {l.text}
                    </div>
                  ))
                )}
              </div>
            </section>
            <Contained label="Conversation">
              <ChannelPanel
                embedded
                view={channel}
                threadBot={selected}
                running={asking || coordinator.holding()}
                onAsk={(from, to) => {
                  setWin("bots");
                  void coordinator.askPeer(from, to);
                }}
                onStop={() => coordinator.stop()}
                open={win === "you" || win === "bots" ? win : null}
                onToggle={toggle}
              />
            </Contained>
          </div>

          {(phase !== "Ready" || status?.task) && (
            <div className={`label ${styles.running}`} role="status">
              <span data-testid="agent-phase">{phase}{status?.task ? ` · ${describe(status.task, name)}` : ""}</span>
              <Button
                variant="link"
                arrow={false}
                onClick={() => {
                  session.current?.cancel();
                  add("duck", "Stopped.");
                }}
              >
                <Square size={12} aria-hidden="true" /> Stop
              </Button>
            </div>
          )}
          <div className={styles.picker} role="group" aria-label="Who are you talking to">
            <span className="label">Talking to</span>
            {(["pip", "nova"] as const).map((b) => (
              <button key={b} className="gic-tag" aria-pressed={selected === b} aria-label={`Select ${BOT_NAMES[b]}`} onClick={() => selectBot(b)}>
                <i className={b === "pip" ? styles.pipDot : styles.novaDot} /> {BOT_NAMES[b]}
              </button>
            ))}
            <button className="gic-tag" data-testid="pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />} {paused ? "Resume" : "Pause"}
            </button>
            {chip && (
              <span className={`caption ${styles.addressChip}`} data-testid="address-chip">
                {chip.label}
                {chip.heard && <small> · heard: {chip.heard}</small>}
                {chip.reaction && <small data-testid="reaction"> · {chip.reaction}</small>}
              </span>
            )}
          </div>
          <form className={`gic-field ${styles.command}`} onSubmit={send}>
            <input
              className="gic-field__input body"
              aria-label="Task for your duck"
              placeholder="Ask a question or tell me what to move…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              autoComplete="off"
              disabled={!sim}
            />
            <button className="gic-field__submit" type="submit" aria-label="Send task" disabled={!sim || !text.trim()}>
              <ArrowPill tone="ink" />
            </button>
          </form>
          <div className={styles.voiceControls}>
            <Button
              variant="solid"
              disabled={!sim}
              aria-label="Hold to talk"
              aria-pressed={phase === "Listening"}
              onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); talk(); }}
              onPointerUp={() => session.current?.endCapture()}
              onPointerCancel={() => session.current?.cancel()}
              onLostPointerCapture={() => session.current?.endCapture()}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) talk(); } }}
              onKeyUp={e => { if (e.key === "Enter") session.current?.endCapture(); }}
            >{phase === "Listening" ? "Listening… release to send" : "Hold to talk · Space"}</Button>
            <button type="button" className="gic-tag" aria-label="Spoken replies" aria-pressed={voice} onClick={() => { setVoice(!voice); session.current?.setVoice(!voice); }}>
              {voice ? "Voice on" : "Voice off"}
            </button>
          </div>
          <small className={`caption ${styles.providerNote}`}>Claude on Bedrock · ElevenLabs voice. Microphone audio is sent when you release. Stop or Esc interrupts.</small>
          <div className={styles.skills}>
            <button className="gic-tag" onClick={() => skill(sitting ? "stand" : "sit", sitting ? "Standing up" : "Sitting down")} disabled={!sim}>
              {sitting ? "Stand" : "Sit"}
            </button>
            <button className="gic-tag" onClick={() => skill("kickL", "Left kick")} disabled={!sim}>
              Kick L
            </button>
            <button className="gic-tag" onClick={() => skill("kickR", "Right kick")} disabled={!sim}>
              Kick R
            </button>
            <button className="gic-tag" onClick={() => skill("peck", "Peck")} disabled={!sim}>
              Peck
            </button>
            <button className="gic-tag" onClick={() => skill("roll", "Roll")} disabled={!sim}>
              Roll
            </button>
            <button
              className="gic-social"
              aria-label="Reset the lab"
              onClick={() => {
                session.current?.cancel(true);
                sim?.reset();
                add("duck", "Lab reset.");
              }}
              disabled={!sim}
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </aside>
      </main>
    </div>
  );
}
