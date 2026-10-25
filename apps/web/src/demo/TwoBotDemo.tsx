// TEMPORARY demo page for the two-bot conversation: stub simulation, mock
// provider, 2D placeholder stage. Reached only via ?demo=two-bot.
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
import { ArrowUp, Play, RotateCcw, Square } from "lucide-react";
import { BubbleLayer, type Anchors } from "../bubbles/BubbleLayer.js";
import { deriveBubbles } from "../bubbles/model.js";
import { CapsuleOverlay } from "../capsule/CapsuleOverlay.js";
import { createCoordinator } from "../coordinator/index.js";
import { parseFast, type Side } from "../fastpath/index.js";
import { ChannelPanel } from "../handoff/ChannelPanel.js";
import { deriveChannel } from "../handoff/model.js";
import { createMockProvider } from "../provider/mock.js";
import type { Provider } from "../provider/types.js";
import { createFakeSim } from "../simulation/fake/index.js";
import styles from "./TwoBotDemo.module.css";

const ANCHORS: Anchors = { pip: { x: 24, y: 62 }, nova: { x: 76, y: 62 } };
const DELAYS = [1000, 3000, 6000] as const;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function TwoBotDemo() {
  const reducedMotion = Boolean(useReducedMotion());
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [selected, setSelected] = useState<BotId>("pip");
  const [text, setText] = useState("");
  const [delay, setDelay] = useState<number>(1000);
  const [step, setStep] = useState<string | null>(null);
  const [pulsing, setPulsing] = useState(false);
  const delayRef = useRef(delay);
  delayRef.current = delay;
  const runId = useRef(0);
  const focus = useRef<Side | null>(null);
  const undo = useRef<{ side: Side; cm: number }[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const { sim, c } = useMemo(() => {
    const sim = createFakeSim();
    // Reads the delay at call time so the selector applies to the next call.
    const provider: Provider = {
      respond: (req, signal) =>
        createMockProvider({ delayMs: delayRef.current }).respond(req, signal),
    };
    return { sim, c: createCoordinator({ sim, provider }) };
  }, []);
  useEffect(() => {
    const offs = [c.subscribe(rerender), sim.subscribe(rerender)];
    return () => offs.forEach((off) => off());
  }, [c, sim]);

  const world = sim.snapshot();
  const ledger = c.ledger();
  const bubbles = deriveBubbles(ledger);
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

  function command(raw: string, bot: BotId) {
    const cmd = raw.trim();
    if (!cmd) return;
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
      c.localTurn(bot, cmd, {
        say: `The ${r.side} weight is now ${r.cm} cm from the pivot. What do you predict?`,
        action: { side: r.side, cm: r.cm },
      });
    } else if (r.kind === "undo") {
      const prev = undo.current.pop()!;
      focus.current = prev.side;
      c.localTurn(bot, cmd, {
        say: `Put the ${prev.side} weight back at ${prev.cm} cm.`,
        action: { side: prev.side, cm: prev.cm },
      });
    } else c.learnerTurn(cmd, bot); // open question: the labelled mock
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    runId.current++;
    command(text, selected);
    setText("");
    setStep(null);
  }

  function stop() {
    runId.current++;
    setStep(null);
    c.stop();
  }

  function reset() {
    runId.current++;
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
    setSelected("pip");
    (await go("1 of 5 · fast command, no model", async () => {
      command("move the left weight to 30 cm", "pip");
      await sleep(2200);
    })) &&
      (await go("2 of 5 · open question to Pip (mock)", async () => {
        await c.learnerTurn("why does it tilt?", "pip").done;
        await sleep(1500);
      })) &&
      (await go("3 of 5 · Ask Nova", async () => {
        await c.askPeer("pip", "nova").done;
        await sleep(1500);
      })) &&
      (await go("4 of 5 · Stop in the middle of a chain", async () => {
        c.askPeer("nova", "pip");
        await sleep(delayRef.current + 400);
        c.stop();
        await sleep(800);
      })) &&
      (await go("5 of 5 · done", async () => void (await sleep(300))));
    if (live()) setStep(null);
  }

  const result = balance(world);
  const delta =
    world.leftGrams * world.leftCm - world.rightGrams * world.rightCm;
  const tilt = -Math.max(-12, Math.min(12, delta / 300));

  return (
    <div className={styles.page}>
      <div className={styles.banner} data-testid="demo-banner" role="note">
        <strong>Temporary demo.</strong> Stub simulation and a scripted{" "}
        <b>mock</b> provider. No AI, no network, no MuJoCo.
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
              const mine = bubbles.find((x) => x.anchor === b);
              return (
                <div
                  key={b}
                  className={styles.bot}
                  data-testid={`bot-${b}`}
                  data-bot={b}
                  data-facing={mine?.gaze ?? "you"}
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
            <BubbleLayer bubbles={bubbles} anchors={ANCHORS} />
            <CapsuleOverlay
              ledger={ledger}
              anchors={ANCHORS}
              reducedMotion={reducedMotion}
            />
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
                "Commands like “right weight to forty” run instantly. Questions go to the mock."}
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
