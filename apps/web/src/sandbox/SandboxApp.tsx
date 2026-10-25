import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUp, Bird, Check, Keyboard, RotateCcw, Square } from "lucide-react";
import { KITS, type DuckTask, type KitId, type LabKit } from "@kestrel/contracts";
import { AgentSession, type AgentPhase } from "./agentSession";
import { VEL_ANG, VEL_BACK, VEL_FWD } from "../simulation/constants";
import { DuckSim, type SimEvent, type SimStatus } from "../simulation/duckSim";
import type { Skill } from "../simulation/tasks";
import { SandboxScene } from "./SandboxScene";
import styles from "./Sandbox.module.css";

type LogEntry = { id: number; who: "you" | "duck"; text: string; ok?: boolean };

const LESSONS: { id: KitId; subject: string; topic: string }[] = [
  { id: "pythagoras", subject: "Maths", topic: "Pythagorean theorem" },
  { id: "moments", subject: "Physics", topic: "Moments" },
  { id: "free", subject: "Sandbox", topic: "Free play" },
];

const OBJECTIVE: Record<KitId, string> = {
  pythagoras:
    "Push each square onto the side of the right triangle that matches it. Count the tiles: does 9 + 16 make 25?",
  moments: "A 200 g weight sits 20 cm from the pivot with nothing on the other side, so the plank tips. Ask Pip what moments are. Placing weights on the plank comes next.",
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
  const [log, setLog] = useState<LogEntry[]>([]);
  const [text, setText] = useState("");
  const [filled, setFilled] = useState<string[]>([]);
  const nextId = useRef(0);
  const [bubble, setBubble] = useState<{ id: number; text: string } | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const session = useRef<AgentSession | null>(null);
  const [phase, setPhase] = useState<AgentPhase>("Ready");
  const [voice, setVoice] = useState(true);

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
      if (e.type === "task-done") add("duck", e.summary, e.ok);
      else if (e.type === "fell") add("duck", "Whoops, I fell. Getting back up…", false);
      else if (e.type === "recovered") add("duck", "Back on my feet.", true);
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
    const t = window.setInterval(() => setStatus(sim.status()), 200);
    return () => window.clearInterval(t);
  }, [sim]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  function chooseLesson(id: KitId) {
    session.current?.cancel(true);
    const next = KITS[id]();
    setKitId(id);
    setKit(next);
    setFilled([]);
    sim?.setKit(next);
    add("duck", `Lesson set: ${next.subject} · ${next.topic}.`);
  }

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
        sim.tasks.cancel();
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
    void session.current?.submit(text.trim());
    setText("");
  }

  const name = (id: string) => sim?.kit.props.find((p) => p.id === id)?.label ?? id;
  const lesson = LESSONS.find((l) => l.id === kitId)!;
  const solved = kit.slots.length > 0 && filled.length === kit.slots.length;
  const sitting = status?.mode === "sitstand";

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
            <SandboxScene sim={sim} kit={kit} tint="#5caca4" onProgress={setFilled} bubble={bubble} />
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
      </main>
    </div>
  );
}
