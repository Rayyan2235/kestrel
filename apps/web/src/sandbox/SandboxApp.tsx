import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Bird, Check, Keyboard, RotateCcw, Square } from "lucide-react";
import { KITS, type DuckTask, type KitId, type LabKit, type RescueRoute } from "@kestrel/contracts";
import { AgentSession, balanceSnapshot, type AgentPhase } from "./agentSession";
import { VEL_ANG, VEL_BACK, VEL_FWD, VEL_STEER, VEL_TURN_WALK } from "../simulation/constants";
import { DuckSim, type SimEvent, type SimStatus } from "../simulation/duckSim";
import type { Skill } from "../simulation/tasks";
import { RescuePanel, type RescueOutcome } from "./RescuePanel";
import { ExperimentPanel } from "./ExperimentPanel";
import { SandboxScene } from "./SandboxScene";
import styles from "./Sandbox.module.css";
import { ArrowPill, Button } from "./gic";

type LogEntry = { id: number; who: "you" | "duck"; text: string; ok?: boolean };

const LESSONS: { id: KitId; subject: string; topic: string }[] = [
  { id: "rescue", subject: "Mission", topic: "Robot rescue" },
  { id: "pythagoras", subject: "Maths", topic: "Pythagorean theorem" },
  { id: "moments", subject: "Physics", topic: "Moments" },
  { id: "free", subject: "Sandbox", topic: "Free play" },
];

const OBJECTIVE: Record<KitId, string> = {
  rescue: "Help Pip reach its charger. Choose a route and predict its distance.",
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

function describe(task: DuckTask, name: (id: string) => string = (id) => id): string {
  switch (task.kind) {
    case "rescue_route": return "Follow your rescue route";
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
  const stageRef = useRef<HTMLElement>(null);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const session = useRef<AgentSession | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("Ready");
  const [voice, setVoice] = useState(true);
  const [rescueRoute, setRescueRoute] = useState<RescueRoute | null>(null);
  const [rescueOutcome, setRescueOutcome] = useState<RescueOutcome | null>(null);

  const add = useCallback((who: LogEntry["who"], line: string, ok?: boolean) => {
    const id = nextId.current++;
    setLog((l) => [...l, { id, who, text: line, ok }].slice(-40));
    // The duck's replies also appear as a bubble beside it in the room.
    if (who === "duck") setBubble({ id, text: line });
  }, []);

  useEffect(() => {
    if (!bubble) return;
    const t = window.setTimeout(() => setBubble(null), Math.max(12000, bubble.text.length * 70));
    return () => window.clearTimeout(t);
  }, [bubble]);

  const onEvent = useCallback(
    (e: SimEvent) => {
      session.current?.event(e);
      if (e.type === "task-done" && e.task.kind === "rescue_route") {
        setRescueOutcome({ok:e.ok, summary:e.summary});
        setBubble({id:nextId.current++,text:e.summary}); return;
      }
      if (e.type === "reset") {
        setRescueOutcome({ok:false, summary:e.reason === "Rescue retry" ? "Pip is back at the start. Try a different checkpoint order." : "Course ready. Tell Pip the checkpoint order.",reset:true});
        setRescueRoute(null); setBubble(null);
      }
      if (e.type === "task-done") add("duck", e.summary, e.ok);
      else if (e.type === "fell") add("duck", e.duck === "pip" ? "Whoops, I fell. Getting back up…" : "Nova fell. Getting back up…", false);
      else if (e.type === "recovered") add("duck", e.duck === "pip" ? "Back on my feet." : "Nova is back up.", true);
      else if (e.type === "reset" && e.reason !== "Lab loaded" && e.reason !== "Reset" && e.reason !== "Rescue retry") add("duck", e.reason, false);
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
        session.current = new AgentSession(s, add, setPhase);
        // Dev-only handle for browser tests and debugging.
        if (import.meta.env.DEV) (window as unknown as { kestrelSim: DuckSim }).kestrelSim = s;
      })
      .catch((e) => live && setError(String(e?.message ?? e)));
    return () => {
      live = false;
      session.current?.cancel();
      created?.stop();
    };
  }, [onEvent]);

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
    if (id === kitId) return;
    session.current?.cancel(true);
    const next = KITS[id]();
    setKitId(id);
    setBubble(null);
    setRescueOutcome(null);
    setRescueRoute(null);
    setKit(next);
    setFilled([]);
    sim?.setKit(next);
    if(id !== "rescue") add("duck", `Lesson set: ${next.subject} · ${next.topic}.`);
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
    if (kitId === "rescue") return;
    const held = new Set<string>();
    const apply = () => {
      const fwd = held.has("w") || held.has("arrowup");
      const back = held.has("s") || held.has("arrowdown");
      const left = held.has("a") || held.has("arrowleft");
      const right = held.has("d") || held.has("arrowright");
      const moving = fwd || back;
      const turning = left || right;
      const turnRate = moving ? VEL_STEER : VEL_ANG;
      sim.manual = {
        vx: fwd ? (turning ? VEL_TURN_WALK : VEL_FWD) : back ? VEL_BACK : 0,
        wz: left ? turnRate : right ? -turnRate : 0,
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
  }, [sim, skill, add, kitId]);

  function send(e: FormEvent) {
    e.preventDefault();
    if (!sim || !text.trim()) return;
    void session.current?.submit(text.trim());
    setText("");
  }

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
        <section ref={stageRef} className={`${styles.stage} ${kitId === "rescue" ? styles.rescueStage : ""}`} aria-label="3D playground">
          {sim ? (
            <SandboxScene sim={sim} kit={kit} tint="#5caca4" onProgress={setFilled} bubble={bubble} rescueRoute={rescueRoute} />
          ) : (
            <div className={styles.boot} role="status">
              <strong>{error ? "The playground could not start" : "Opening the playground…"}</strong>
              {boot.map((b) => (
                <span key={b}>{b}</span>
              ))}
              {error && <span className={styles.error}>{error}</span>}
            </div>
          )}

          {kitId !== "rescue" && <div className={`gic-toast ${styles.lessonCard}`}>
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
          </div>}

          {kitId !== "rescue" && <div className={`gic-toast ${styles.keys}`} aria-label="Keyboard controls">
            <Keyboard size={15} aria-hidden="true" />
            {KEYS.map(([k, v]) => (
              <span key={k}>
                <kbd>{k}</kbd> {v}
              </span>
            ))}
            <span className={styles.note}>No jump: the base Microduck model has no jump skill.</span>
          </div>}
        </section>


        {kitId === "rescue" ? <aside className={`gic-toast ${styles.console} ${styles.missionConsole}`} aria-label="Mission console">
          {sim && <RescuePanel sim={sim} outcome={rescueOutcome} onReset={() => {sim.stopAll();sim.reset();setBubble(null);}} onRun={(route) => {
            session.current?.cancel(); setRescueOutcome(null); setBubble(null); setRescueRoute(route);
            const refusal = sim.runTask({kind:"rescue_route", route});
            if (!refusal && window.matchMedia("(max-width: 900px)").matches) stageRef.current?.scrollIntoView({behavior: "auto", block: "start"});
            return refusal;
          }} />}
        </aside> : <aside className={`gic-toast ${styles.console}`} aria-label="Duck console">
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
          <div className={styles.log} role="log" aria-live="polite" ref={logRef}>
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
              onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); void session.current?.startCapture(); }}
              onPointerUp={() => session.current?.endCapture()}
              onPointerCancel={() => session.current?.cancel()}
              onLostPointerCapture={() => session.current?.endCapture()}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!e.repeat) void session.current?.startCapture(); } }}
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
        </aside>}
      </main>
    </div>
  );
}
