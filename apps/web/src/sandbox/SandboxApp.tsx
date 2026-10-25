import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowUp, Bird, Check, Keyboard, Pause, Play, RotateCcw, Square } from "lucide-react";
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
import { ChannelPanel } from "../handoff/ChannelPanel.js";
import { deriveChannel } from "../handoff/model.js";
import { usePresentation } from "../presentation/usePresentation.js";
import { createMockProvider } from "../provider/mock.js";
import { consoleSim, createConversation, threadOf } from "./conversation";
import { Contained } from "./Contained";
import { AgentSession, balanceSnapshot, type AgentPhase } from "./agentSession";
import { VEL_ANG, VEL_BACK, VEL_FWD } from "../simulation/constants";
import { DuckSim, type SimEvent, type SimStatus } from "../simulation/duckSim";
import type { Skill } from "../simulation/tasks";
import { ExperimentPanel } from "./ExperimentPanel";
import { SandboxScene } from "./SandboxScene";
import styles from "./Sandbox.module.css";

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
  const reducedMotion = Boolean(useReducedMotion());
  const [paused, setPaused] = useState(false);
  /** DuckSim events fanned out to the SimAdapter that the coordinator reads. */
  const relay = useRef(new Set<(e: SimEvent) => void>());
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const add = useCallback((who: LogEntry["who"], line: string, ok?: boolean, bot?: BotId, source: "built-in" | "live" = "built-in") => {
    const id = nextId.current++;
    setLog((l) => [...l, { id, who, text: line, ok }].slice(-40));
    // Every line also enters the conversation: the learner to the selected robot, a reply from a robot to the learner.
    if (who === "you") conv.record("you", selectedRef.current, "learner", line, "built-in");
    else conv.record(bot ?? selectedRef.current, "you", "say", line, source);
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
      if (e.code === "Space") { e.preventDefault(); if (!e.repeat) void session.current?.startCapture(); return; }
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

  function send(e: FormEvent) {
    e.preventDefault();
    if (!sim || !text.trim()) return;
    const cmd = text.trim();
    // While a challenge is active, a fast-path move waits for the learner's prediction.
    const world = adapterRef.current?.snapshot();
    const id = coordinator.challengeId();
    if (id && world) {
      const r = parseFast(cmd, { focus: null, leftCm: world.leftCm, rightCm: world.rightCm, undo: [] });
      if (r.kind === "move") {
        const challenge = challengeById(id)!;
        held.current = coordinator.heldTurn(
          selected,
          cmd,
          { say: "Lock your prediction, then I'll move it.", action: { side: r.side, cm: r.cm } },
          { challengeId: id, promptId: challenge.prompts[0]!.promptId },
        );
        setText("");
        return;
      }
    }
    void session.current?.submit(cmd);
    setText("");
  }

  const name = (id: string) => sim?.kit.props.find((p) => p.id === id)?.label ?? id;
  const lesson = LESSONS.find((l) => l.id === kitId)!;
  const solved = kit.slots.length > 0 && filled.length === kit.slots.length;
  const sitting = status?.mode === "sitstand";
  const balance = status?.balance ? balanceSnapshot(status.balance) : null;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Kestrel home">
          <Bird size={24} strokeWidth={1.7} />
          <h1>Kestrel</h1>
        </a>
        <span className={styles.pill}>Console · Microduck physics</span>
        <nav className={styles.lessons} aria-label="Lesson">
          {LESSONS.map((l) => (
            <button
              key={l.id}
              className={l.id === kitId ? styles.lessonOn : styles.lesson}
              aria-pressed={l.id === kitId}
              onClick={() => chooseLesson(l.id)}
              disabled={!sim}
            >
              <small>{l.subject}</small>
              {l.topic}
            </button>
          ))}
        </nav>
        <a className={styles.back} href="/">
          <ArrowLeft size={16} /> Home
        </a>
      </header>

      <main className={styles.workspace}>
        <section className={styles.stage} aria-label="3D lab">
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
              <strong>{error ? "The lab could not start" : "Opening the lab…"}</strong>
              {boot.map((b) => (
                <span key={b}>{b}</span>
              ))}
              {error && <span className={styles.error}>{error}</span>}
            </div>
          )}

          <div className={styles.lessonCard}>
            <span className={styles.eyebrow}>
              {lesson.subject} · {lesson.topic}
            </span>
            <p>{OBJECTIVE[kitId]}</p>
            {kit.slots.length > 0 && (
              <div className={styles.chips}>
                {kit.slots.map((s) => (
                  <span key={s.id} className={filled.includes(s.id) ? styles.chipOn : styles.chip}>
                    {filled.includes(s.id) && <Check size={12} />} {s.label}
                  </span>
                ))}
              </div>
            )}
            {solved && <strong className={styles.solved}>Right triangle built: 9 + 16 = 25.</strong>}
            {kit.id === "pythagoras" && !solved && (
              <button className={styles.runButton} onClick={() => crew({ kind: "build_squares" })} disabled={!sim || status?.task?.kind === "build_squares"}>
                {status?.task?.kind === "build_squares" ? `Building · ${status.experiment?.phase ?? ""}` : "Build it together"}
              </button>
            )}
            {balance && (
              <div className={styles.chips} data-testid="balance">
                {balance.weights.map((w) => (
                  <span key={w.id} className={styles.chip}>
                    {w.grams} g · {w.side} · {w.cm} cm
                  </span>
                ))}
                <span className={balance.plank === "released" ? styles.chipOn : styles.chip}>
                  {balance.plank === "released"
                    ? balance.lowSide === "level"
                      ? "Level"
                      : `${balance.lowSide === "left" ? "Left" : "Right"} side down ${balance.tiltDeg}°`
                    : balance.plank === "levelling"
                      ? "Levelling…"
                      : "Plank locked"}
                </span>
                <button
                  className={styles.plankButton}
                  onClick={() => plank(balance.plank === "locked" ? "release_plank" : "lock_plank")}
                >
                  {balance.plank === "locked" ? "Release plank" : "Lock plank"}
                </button>
              </div>
            )}
            {balance && status && <ExperimentPanel status={status} run={(l, r) => crew({ kind: "set_balance", left_cm: l, right_cm: r })} />}
          </div>

          <div className={styles.keys} aria-label="Keyboard controls">
            <Keyboard size={15} />
            {KEYS.map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd> {v}
              </span>
            ))}
            <span className={styles.note}>No jump: the base Microduck model has no jump skill.</span>
          </div>
        </section>

        <aside className={styles.console} aria-label="Duck console">
          <div className={styles.consoleHead}>
            <div>
              <span className={styles.dot} />
              <strong>Your duck</strong>
            </div>
            <span className={styles.mode} data-testid="duck-mode">
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
            <div className={styles.crew} data-testid="crew">
              <span>
                <i className={styles.pipDot} /> Pip · {status.phase ?? (status.task ? "busy" : status.mode)}
              </span>
              <span>
                <i className={styles.novaDot} /> Nova · {nova.phase ?? (nova.task ? "busy" : nova.mode)}
              </span>
            </div>
          )}
          <div className={styles.log} role="log" aria-live="polite" ref={logRef}>
            {log.length === 0 ? (
              <p className={styles.empty}>
                Hold to talk, or ask <em>What is the Pythagorean theorem?</em> I can explain and move the squares to demonstrate. You can also ask me to push a box or drive with the keyboard.
              </p>
            ) : (
              log.map((l) => (
                <div key={l.id} className={l.who === "you" ? styles.fromYou : styles.fromDuck}>
                  {l.ok === false && <span className={styles.warn}>!</span>}
                  {l.text}
                </div>
              ))
            )}
          </div>
          {(phase !== "Ready" || status?.task) && (
            <div className={styles.running} role="status">
              <span data-testid="agent-phase">{phase}{status?.task ? ` · ${describe(status.task, name)}` : ""}</span>
              <button
                onClick={() => {
                  session.current?.cancel();
                  add("duck", "Stopped.");
                }}
              >
                <Square size={13} /> Stop
              </button>
            </div>
          )}
          <div className={styles.picker} role="group" aria-label="Who are you talking to">
            {(["pip", "nova"] as const).map((b) => (
              <button key={b} aria-pressed={selected === b} aria-label={`Select ${BOT_NAMES[b]}`} onClick={() => conv.select(b)}>
                {BOT_NAMES[b]}
              </button>
            ))}
            <button data-testid="pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
              {paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />} {paused ? "Resume" : "Pause"}
            </button>
          </div>
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
          <form className={styles.command} onSubmit={send}>
            <input
              aria-label="Task for your duck"
              placeholder="Ask a question or tell me what to move…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={2000}
              autoComplete="off"
              disabled={!sim}
            />
            <button type="submit" aria-label="Send task" disabled={!sim || !text.trim()}>
              <ArrowUp size={18} />
            </button>
          </form>
          <div className={styles.voiceControls}>
            <button
              type="button"
              disabled={!sim}
              aria-label="Hold to talk"
              aria-pressed={phase === "Listening"}
              onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void session.current?.startCapture(); }}
              onPointerUp={() => session.current?.endCapture()}
              onPointerCancel={() => session.current?.cancel()}
              onLostPointerCapture={() => session.current?.endCapture()}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) void session.current?.startCapture(); } }}
              onKeyUp={e => { if (e.key === "Enter") session.current?.endCapture(); }}
            >{phase === "Listening" ? "Listening… release to send" : "Hold to talk · Space"}</button>
            <button type="button" aria-label="Spoken replies" aria-pressed={voice} onClick={() => { setVoice(!voice); session.current?.setVoice(!voice); }}>
              {voice ? "Voice on" : "Voice off"}
            </button>
          </div>
          <small className={styles.providerNote}>Claude on Bedrock · ElevenLabs voice. Microphone audio is sent when you release. Stop or Esc interrupts.</small>
          <div className={styles.skills}>
            <button onClick={() => skill(sitting ? "stand" : "sit", sitting ? "Standing up" : "Sitting down")} disabled={!sim}>
              {sitting ? "Stand" : "Sit"}
            </button>
            <button onClick={() => skill("kickL", "Left kick")} disabled={!sim}>
              Kick L
            </button>
            <button onClick={() => skill("kickR", "Right kick")} disabled={!sim}>
              Kick R
            </button>
            <button onClick={() => skill("peck", "Peck")} disabled={!sim}>
              Peck
            </button>
            <button onClick={() => skill("roll", "Roll")} disabled={!sim}>
              Roll
            </button>
            <button
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
        <Contained label="Conversation">
        <ChannelPanel embedded view={channel} threadBot={selected} running={asking || coordinator.holding()} onAsk={(from, to) => void coordinator.askPeer(from, to)} onStop={() => coordinator.stop()} />
        </Contained>
      </main>
    </div>
  );
}
