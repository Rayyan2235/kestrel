// TEMPORARY demo page for the two-bot conversation: stub simulation, mock
// provider, 2D placeholder stage. Reached only via ?demo=two-bot; add
// &sim=mujoco to drive the real MuJoCo Microducks instead of the stub, and
// &provider=live for live Claude replies when the API reports liveAi.
import { balance, BOT_NAMES, type BotId } from "@kestrel/contracts";
import { useReducedMotion } from "motion/react";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { ArrowUp, Pause, Play, RotateCcw, Square } from "lucide-react";
import { BubbleLayer, type Anchors } from "../bubbles/BubbleLayer.js";
import { CapsuleOverlay } from "../capsule/CapsuleOverlay.js";
import { createCoordinator } from "../coordinator/index.js";
import { parseFast, type Side } from "../fastpath/index.js";
import { ChannelPanel } from "../handoff/ChannelPanel.js";
import { deriveChannel } from "../handoff/model.js";
import { createLiveProvider } from "../provider/live.js";
import { createMockProvider } from "../provider/mock.js";
import type { Provider } from "../provider/types.js";
import { usePresentation } from "../presentation/usePresentation.js";
import { createFakeSim } from "../simulation/fake/index.js";
import type { SimAdapter } from "../simulation/types.js";
import styles from "./TwoBotDemo.module.css";

const ANCHORS: Anchors = { pip: { x: 24, y: 62 }, nova: { x: 76, y: 62 } };
const DELAYS = [1000, 3000, 6000] as const;
const SPEEDS = [0.5, 1] as const;

/** Loads the real lab for `?sim=mujoco`; the stub otherwise, or if loading fails. */
export function TwoBotDemo() {
  const mujoco =
    new URLSearchParams(window.location.search).get("sim") === "mujoco";
  const stub = useMemo(() => createFakeSim(), []);
  const [real, setReal] = useState<SimAdapter | null>(null);
  const [boot, setBoot] = useState("Loading the MuJoCo lab");
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!mujoco) return;
    let live = true;
    let dispose = () => {};
    import("../simulation/real/load.js")
      .then(({ loadDuckSimAdapter }) =>
        loadDuckSimAdapter((line) => live && setBoot(line)),
      )
      .then((lab) => {
        if (!live) return lab.dispose();
        dispose = lab.dispose;
        // Dev-only handle for browser tests, as in the sandbox.
        if (import.meta.env.DEV)
          (window as unknown as { kestrelSim: unknown }).kestrelSim = lab.duck;
        setReal(lab.sim);
      })
      .catch((e) => live && setFailed(String(e?.message ?? e)));
    return () => {
      live = false;
      dispose();
    };
  }, [mujoco]);
  if (mujoco && !real && !failed)
    return (
      <div className={styles.page}>
        <div className={styles.banner} data-testid="sim-loading" role="status">
          {boot}…
        </div>
      </div>
    );
  return <DemoRoom sim={real ?? stub} mujoco={real !== null} failed={failed} />;
}

function DemoRoom({
  sim: lab,
  mujoco,
  failed,
}: {
  sim: SimAdapter;
  mujoco: boolean;
  failed: string | null;
}) {
  const reducedMotion = Boolean(useReducedMotion());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<BotId>("pip");
  const [text, setText] = useState("");
  const [delay, setDelay] = useState<number>(1000);
  const [step, setStep] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const [stoppedSeq, setStoppedSeq] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const speedRef = useRef(1);
  speedRef.current = speed;
  const delayRef = useRef(delay);
  delayRef.current = delay;
  const runId = useRef(0);
  const focus = useRef<Side | null>(null);
  const undo = useRef<{ side: Side; cm: number }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  // Live only when asked for and the API has model credentials; else the mock.
  const wantsLive =
    new URLSearchParams(window.location.search).get("provider") === "live";
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  liveRef.current = live;
  useEffect(() => {
    if (!wantsLive) return;
    let on = true;
    fetch("/api/health")
      .then((r) => r.json())
      .then((h) => on && setLive(Boolean(h?.capabilities?.liveAi)))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [wantsLive]);

  const { sim, c } = useMemo(() => {
    const sim = lab;
    // Reads the delay at call time so the selector applies to the next call.
    const mock: Provider = {
      respond: (req, signal) =>
        createMockProvider({ delayMs: delayRef.current }).respond(req, signal),
    };
    const claude = createLiveProvider({
      world: () => sim.snapshot(),
      fallback: mock,
    });
    const provider: Provider = {
      respond: (req, signal) =>
        (liveRef.current ? claude : mock).respond(req, signal),
    };
    return { sim, c: createCoordinator({ sim, provider }) };
  }, [lab]);
  useEffect(() => {
    const offs = [c.subscribe(rerender), sim.subscribe(rerender)];
    return () => offs.forEach((off) => off());
  }, [c, sim]);

  const world = sim.snapshot();
  const ledger = c.ledger();
  const pres = usePresentation(ledger, { paused, speed, reducedMotion });
  const idleRef = useRef(true);
  idleRef.current = pres.phase === "idle" && pres.queued === 0;
  const status = { pip: c.botState("pip"), nova: c.botState("nova") };
  const view = deriveChannel(ledger, status, c.budget());
  const running = (["pip", "nova"] as const).some((b) =>
    ["thinking", "waiting", "acting"].includes(status[b]),
  );
  const lastLearner = [...ledger].reverse().find((e) => e.kind === "learner");
  const threadBot: BotId =
    lastLearner && lastLearner.to !== "you" ? lastLearner.to : selected;

  // Handback: pulse the dock once; move focus only when nothing is being typed.
  const handbackId = view.handback?.id ?? null;
  useEffect(() => {
    if (!handbackId) return;
    setPulsing(true);
    const off = window.setTimeout(() => setPulsing(false), 700);
    // Never steal focus: only take it when nothing at all is focused.
    const active = document.activeElement;
    if (!active || active === document.body) input.current?.focus();
    return () => window.clearTimeout(off);
  }, [handbackId]);

  /** Waits in demo time: frozen while paused, stretched at 0.5x. */
  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      let left = ms;
      let last = Date.now();
      const id = window.setInterval(() => {
        const now = Date.now();
        if (!pausedRef.current) left -= (now - last) * speedRef.current;
        last = now;
        if (left <= 0) {
          window.clearInterval(id);
          resolve();
        }
      }, 50);
    });
  /** Until the room has finished showing what the ledger already holds. */
  const settled = async () => {
    await wait(250);
    while (!idleRef.current) await wait(100);
  };

  // Space toggles Pause when focus is on the page itself, never in a field or on a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        t !== document.body &&
        (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(t.tagName) ||
          t.isContentEditable ||
          t.getAttribute("role") === "tab")
      )
        return;
      e.preventDefault();
      setPaused((p) => !p);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function command(raw: string, bot: BotId) {
    const cmd = raw.trim();
    if (!cmd) return undefined;
    const w = sim.snapshot();
    const r = parseFast(cmd, {
      focus: focus.current,
      leftCm: w.leftCm,
      rightCm: w.rightCm,
      undo: undo.current,
    });
    if (r.kind === "move") {
      undo.current.push({
        side: r.side,
        cm: r.side === "left" ? w.leftCm : w.rightCm,
      });
      focus.current = r.side;
      return c.localTurn(bot, cmd, {
        say: `The ${r.side} weight is now ${r.cm} cm from the pivot. What do you predict?`,
        action: { side: r.side, cm: r.cm },
      });
    } else if (r.kind === "undo") {
      const prev = undo.current.pop()!;
      focus.current = prev.side;
      return c.localTurn(bot, cmd, {
        say: `Put the ${prev.side} weight back at ${prev.cm} cm.`,
        action: { side: prev.side, cm: prev.cm },
      });
    }
    return c.learnerTurn(cmd, bot); // open question: the labelled mock
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    runId.current++;
    command(text, selected);
    setText("");
    setStep(null);
  }

  /** Stop: bubbles from before this point read as stopped until a newer turn. */
  function halt() {
    setStoppedSeq(c.ledger().length);
    pres.interrupt();
    c.stop();
  }

  function stop() {
    runId.current++;
    setStep(null);
    halt();
  }

  function reset() {
    runId.current++;
    setStoppedSeq(null);
    focus.current = null;
    undo.current = [];
    setStep(null);
    c.reset();
  }

  async function sample() {
    const id = ++runId.current;
    const live = () => runId.current === id;
    const go = async (label: string, fn: () => Promise<void> | void) => {
      if (!live()) return false;
      setStep(label);
      await fn();
      return live();
    };
    focus.current = null;
    undo.current = [];
    c.reset();
    setStoppedSeq(null);
    setSelected("pip");
    (await go("1 of 5 · fast command, no model", async () => {
      await command("move the left weight to 30 cm", "pip")?.done;
      await settled();
    })) &&
      (await go("2 of 5 · open question to Pip (mock)", async () => {
        await c.learnerTurn("why does it tilt?", "pip").done;
        await settled();
      })) &&
      (await go("3 of 5 · Ask Nova", async () => {
        await c.askPeer("pip", "nova").done;
        await settled();
      })) &&
      (await go("4 of 5 · Stop in the middle of a chain", async () => {
        c.askPeer("nova", "pip");
        await wait(delayRef.current + 400);
        halt();
        await wait(1200);
      })) &&
      (await go("5 of 5 · done", async () => void (await wait(300))));
    if (live()) setStep(null);
  }

  const result = balance(world);
  const delta =
    world.leftGrams * world.leftCm - world.rightGrams * world.rightCm;
  const tilt = -Math.max(-12, Math.min(12, delta / 300));

  return (
    <div className={styles.page}>
      <div className={styles.banner} data-testid="demo-banner" role="note">
        {live ? (
          <>
            <strong>Temporary demo.</strong>{" "}
            {mujoco
              ? "Real MuJoCo Microducks push the weights; positions are measured."
              : "Stub simulation."}{" "}
            Pip and Nova answer with <b>live</b> Claude; if a call fails, the
            labelled mock answers.
          </>
        ) : mujoco ? (
          <>
            <strong>Temporary demo.</strong> Real MuJoCo Microducks push the
            weights; positions are measured. Scripted <b>mock</b> provider. No
            AI, no network.
          </>
        ) : (
          <>
            <strong>Temporary demo.</strong> Stub simulation and a scripted{" "}
            <b>mock</b> provider. No AI, no network, no MuJoCo.
            {failed && ` (The MuJoCo lab failed to load: ${failed})`}
          </>
        )}
      </div>
      <main className={styles.layout}>
        <section className={styles.left} aria-label="Lab">
          <p className={styles.readout} data-testid="balance-result">
            Left {world.leftCm} cm · Right {world.rightCm} cm ·{" "}
            {result === "balanced" ? "Balanced" : `${result} side down`}
          </p>
          <div className={styles.stage} data-testid="stage">
            <svg
              className={styles.beam}
              viewBox="0 0 100 60"
              role="img"
              aria-label={`Balance beam, ${result === "balanced" ? "balanced" : result + " side down"}. Illustrative ideal beam.`}
            >
              <polygon points="50,44 45,56 55,56" fill="var(--ink)" />
              <g
                style={{
                  transform: `rotate(${tilt}deg)`,
                  transformOrigin: "50px 44px",
                  transition: reducedMotion ? "none" : "transform 0.5s",
                }}
              >
                <rect
                  x="6"
                  y="42.5"
                  width="88"
                  height="3"
                  rx="1.5"
                  fill="var(--ink)"
                />
                <rect
                  x={50 - world.leftCm * 0.9 - 4}
                  y="34"
                  width="8"
                  height="8.5"
                  rx="1.5"
                  fill="#5b86c9"
                />
                <rect
                  x={50 + world.rightCm * 0.9 - 3}
                  y="36.5"
                  width="6"
                  height="6"
                  rx="1.5"
                  fill="#c9803f"
                />
              </g>
            </svg>
            {(["pip", "nova"] as const).map((b) => {
              const speaking =
                pres.beat &&
                (pres.phase === "show" || pres.phase === "fade") &&
                pres.beat.event.from === b
                  ? pres.beat.event
                  : null;
              return (
                <div
                  key={b}
                  className={styles.bot}
                  data-testid={`bot-${b}`}
                  data-bot={b}
                  data-facing={speaking?.to ?? "you"}
                  data-state={status[b]}
                  data-shape={b}
                  style={
                    {
                      "--x": `${ANCHORS[b].x}%`,
                      "--y": `${ANCHORS[b].y}%`,
                    } as CSSProperties
                  }
                >
                  <span className={styles.eyes} aria-hidden="true">
                    <i />
                    <i />
                  </span>
                  <span className={styles.tag}>{BOT_NAMES[b]}</span>
                </div>
              );
            })}
            <BubbleLayer
              beat={pres.beat}
              phase={pres.phase}
              collapsed={pres.collapsed}
              anchors={ANCHORS}
              staleBefore={stoppedSeq}
            />
            <CapsuleOverlay
              beat={pres.beat}
              state={pres.capsuleState}
              anchors={ANCHORS}
              reducedMotion={reducedMotion}
              paused={paused}
              speed={speed}
            />
            {paused && (
              <div className={styles.paused} data-testid="paused" role="status">
                <Pause size={14} aria-hidden="true" /> Paused
              </div>
            )}
          </div>

          <section
            className={styles.dock}
            aria-label="Command dock"
            data-testid="dock"
            data-pulsing={pulsing && !reducedMotion}
          >
            <div
              className={styles.picker}
              role="group"
              aria-label="Who are you talking to"
            >
              {(["pip", "nova"] as const).map((b) => (
                <button
                  key={b}
                  aria-pressed={selected === b}
                  aria-label={`Select ${BOT_NAMES[b]}`}
                  onClick={() => setSelected(b)}
                >
                  {BOT_NAMES[b]}
                </button>
              ))}
            </div>
            <form onSubmit={submit} className={styles.form}>
              <label htmlFor="cmd">To {BOT_NAMES[selected]}</label>
              <input
                id="cmd"
                ref={input}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                aria-label="Message your robot"
                placeholder="Try: left weight to thirty five"
                autoComplete="off"
              />
              <button
                type="submit"
                aria-label="Send command"
                disabled={!text.trim()}
              >
                <ArrowUp size={18} />
              </button>
            </form>
            <div className={styles.tools}>
              <label>
                Mock delay
                <select
                  data-testid="delay"
                  aria-label="Mock delay"
                  value={delay}
                  onChange={(e) => setDelay(Number(e.target.value))}
                >
                  {DELAYS.map((d) => (
                    <option key={d} value={d}>
                      {d / 1000} s
                    </option>
                  ))}
                </select>
              </label>
              <button
                data-testid="pause"
                aria-pressed={paused}
                onClick={() => setPaused((p) => !p)}
              >
                {paused ? (
                  <Play size={14} aria-hidden="true" />
                ) : (
                  <Pause size={14} aria-hidden="true" />
                )}{" "}
                {paused ? "Resume" : "Pause"}
              </button>
              <label>
                Speed
                <select
                  data-testid="speed"
                  aria-label="Speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {SPEEDS.map((v) => (
                    <option key={v} value={v}>
                      {v}x
                    </option>
                  ))}
                </select>
              </label>
              <button data-testid="sample-run" onClick={() => void sample()}>
                <Play size={14} aria-hidden="true" /> Play sample run
              </button>
              <button
                data-testid="dock-stop"
                onClick={stop}
                disabled={!running}
              >
                <Square size={14} aria-hidden="true" /> Stop
              </button>
              <button aria-label="Reset lab" onClick={reset}>
                <RotateCcw size={14} aria-hidden="true" /> Reset
              </button>
            </div>
            <p
              className={styles.step}
              data-testid="sample-step"
              aria-live="polite"
            >
              {step ??
                `Commands like “right weight to forty” run instantly. Questions go to ${live ? "Claude" : "the mock"}.`}
            </p>
          </section>
        </section>
        <ChannelPanel
          view={view}
          threadBot={threadBot}
          running={running}
          onAsk={(from, to) => {
            runId.current++;
            c.askPeer(from, to);
          }}
          onStop={stop}
        />
      </main>
    </div>
  );
}
