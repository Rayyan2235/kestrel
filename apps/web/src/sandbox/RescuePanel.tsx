import { Keyboard, ChevronUp, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseRescueDirection,
  RESCUE,
  RESCUE_EDGES,
  type RescueBeacon,
  type RescueRoute,
} from "@kestrel/contracts";
import type { DuckSim } from "../simulation/duckSim";
import { RescueVoice } from "./rescueVoice";
import styles from "./RescuePanel.module.css";
export type RescueOutcome = { ok: boolean; summary: string; reset?: boolean };
export function RescuePanel({
  sim,
  outcome,
  onRun,
  onReset,
}: {
  sim: DuckSim;
  outcome: RescueOutcome | null;
  onRun: (route: RescueRoute) => string | null;
  onReset: () => void;
}) {
  const [stage, setStage] = useState<
    "ready" | "running" | "resetting" | "finished"
  >("ready");
  const [typing, setTyping] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (typing) inputRef.current?.focus();
  }, [typing]);
  const [text, setText] = useState("");
  const [heard, setHeard] = useState("");
  const [feedback, setFeedback] = useState(
    "Compare the branches before you speak. Which route from A to H uses the least distance?",
  );
  const [voiceStatus, setVoiceStatus] = useState("Ready");
  const [battery, setBattery] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const submitRef = useRef<(s: string) => void>(() => {});
  const captureVersion = useRef(sim.resetVersion);
  const voice = useMemo(
    () =>
      new RescueVoice({
        status: setVoiceStatus,
        transcript: (s) => {
          if (captureVersion.current === sim.resetVersion) submitRef.current(s);
        },
        error: setFeedback,
      }),
    [sim],
  );
  useEffect(() => () => voice.cancel(), [voice]);
  useEffect(() => {
    const timer = setInterval(() => {
      setLoaded(sim.kit.id === "rescue");
      const progress = sim.tasks.rescueProgress;
      if (progress) setBattery(progress.battery);
    }, 100);
    return () => clearInterval(timer);
  }, [sim]);
  useEffect(() => {
    if (!outcome) return;
    if (outcome.reset) {
      voice.cancel();
      setVoiceStatus("Ready");
      setStage("ready");
      setBattery(1);
      setFeedback(outcome.summary);
      return;
    }
    if (stage === "running") {
      setStage(outcome.ok ? "finished" : "resetting");
      setFeedback(outcome.summary);
      if (outcome.summary.startsWith("Battery died")) setBattery(0);
    }
  }, [outcome, stage, voice]);
  const reset = () => {
    voice.cancel();
    setVoiceStatus("Ready");
    onReset();
    setStage("ready");
    setBattery(1);
    setText("");
    setHeard("");
    setFeedback("Fresh battery. Plan the checkpoint order, then tell Pip.");
  };
  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        voice.cancel();
        setVoiceStatus("Ready");
        if (stage === "running") {
          sim.stopAll();
          setStage("finished");
          setFeedback("Stopped. Restart when you are ready.");
        }
      }
    };
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, [stage, sim, voice]);
  const submit = (instruction: string) => {
    if (stage !== "ready" || !loaded) return;
    setHeard(instruction);
    const route = parseRescueDirection(instruction);
    if (!route) {
      setFeedback(
        "Pip starts at A. Name the next checkpoint, then every junction through H. Follow connected arrows.",
      );
      return;
    }
    const refusal = onRun(route);
    if (refusal) {
      setFeedback(refusal);
      return;
    }
    setStage("running");
    setFeedback(`Pip: “${route.join(" → ")} (charger). On my way!”`);
  };
  submitRef.current = submit;
  const busy = stage !== "ready" || !loaded;
  const recording = voiceStatus !== "Ready";
  return (
    <section
      className={styles.panel}
      aria-label="Rescue mission"
      onKeyDown={(e) => {
        if (e.key !== "Escape") e.stopPropagation();
      }}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <p className={styles.kicker}>ROBOT RESCUE · SPEAK YOUR ROUTE</p>
      <h2>Four ways home. One charge.</h2>
      <p>
        Choose a path from A to the charger at H. There are four ways there, but
        only the shortest saves Pip. Say each letter along your chosen path.
      </p>
      <RescueMap />
      <small>
        Follow the one-way arrows. Labels show distance in cm. You do not need
        to visit every checkpoint.
      </small>
      <div className={styles.battery}>
        <span>Pip’s battery</span>
        <strong>{Math.ceil(battery * 100)}%</strong>
        <progress aria-label="Pip battery" max="1" value={battery} />
      </div>
      <p>
        If your route is too long, Pip’s battery dies and it returns to the
        start. Try again as often as you like.
      </p>
      <button
        className={styles.primary}
        disabled={busy || voiceStatus === "Transcribing"}
        onClick={() => {
          if (recording) voice.finish();
          else {
            captureVersion.current = sim.resetVersion;
            void voice.start();
          }
        }}
      >
        {voiceStatus === "Listening"
          ? "Finish speaking"
          : voiceStatus === "Microphone permission"
            ? "Cancel microphone"
            : voiceStatus === "Transcribing"
              ? "Hearing your route…"
              : "Tell Pip your route"}
      </button>
      <small>
        Tap to record, speak, then tap Finish. Audio goes to the existing
        transcription service only when you finish.
      </small>
      <button
        type="button"
        className={styles.typeToggle}
        aria-expanded={typing}
        aria-controls="typed-route-panel"
        onClick={() => setTyping(!typing)}
      >
        <span className={styles.keyboardIcon}>
          <Keyboard size={20} aria-hidden="true" />
        </span>
        <span>
          <strong>Type a route</strong>
          <small>Prefer the keyboard? Plan it here.</small>
        </span>
        {typing ? (
          <ChevronUp size={18} aria-hidden="true" />
        ) : (
          <ArrowUpRight size={18} aria-hidden="true" />
        )}
      </button>
      {typing && (
        <form
          id="typed-route-panel"
          className={styles.directionForm}
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
        >
          <label htmlFor="rescue-directions">Your checkpoint order</label>
          <textarea
            ref={inputRef}
            id="rescue-directions"
            placeholder="A → … → … → H"
            rows={2}
            maxLength={300}
            value={text}
            disabled={busy || recording}
            onChange={(e) => setText(e.target.value)}
          />
          <span className={styles.inputHint}>
            Pip is already at A. Name each next junction and finish at H.
          </span>
          <button
            className={styles.primary}
            type="submit"
            disabled={busy || recording || !text.trim()}
          >
            Send route <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        </form>
      )}
      {heard && <p className={styles.heard}>You: “{heard}”</p>}
      <p
        className={styles.feedback}
        role="status"
        data-testid="rescue-feedback"
      >
        {loaded ? feedback : "Preparing the course…"}
      </p>
      {stage === "running" && (
        <button
          onClick={() => {
            sim.stopAll();
            setStage("finished");
            setFeedback("Stopped. Restart to try another route.");
          }}
        >
          Stop Pip
        </button>
      )}
      {stage === "resetting" && <p>Returning to the start…</p>}
      {stage === "finished" && (
        <button className={styles.primary} onClick={reset}>
          Restart rescue
        </button>
      )}
      <small>
        Battery is a distance-based game rule (
        {Math.round(RESCUE.batteryMeters * 100)} cm per charge). Planning uses
        no charge.
      </small>
    </section>
  );
}

function RescueMap() {
  const xy = (id: RescueBeacon) => {
    const [x, y] = RESCUE.beacons[id].at;
    return [32 + (x + 1.2) * 94, 26 + (0.95 - y) * 72];
  };
  return (
    <svg
      viewBox="0 0 290 216"
      role="img"
      aria-label="Four one-way paths from A to H. A connects to B and C. B to E or D. C to D or F. F to D, D to E, E to H."
      style={{
        width: "100%",
        background: "rgba(255,255,255,.55)",
        borderRadius: 18,
      }}
    >
      <defs>
        <marker
          id="rescue-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#506f79" />
        </marker>
      </defs>
      {RESCUE_EDGES.map(([a, b]) => {
        const [x1, y1] = xy(a),
          [x2, y2] = xy(b);
        const d = Math.hypot(x2 - x1, y2 - y1),
          ux = (x2 - x1) / d,
          uy = (y2 - y1) / d;
        const p = RESCUE.beacons[a].at,
          q = RESCUE.beacons[b].at;
        const distance = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) * 100);
        return (
          <g key={a + b}>
            <line
              x1={x1 + ux * 13}
              y1={y1 + uy * 13}
              x2={x2 - ux * 15}
              y2={y2 - uy * 15}
              stroke="#506f79"
              strokeWidth="2"
              markerEnd="url(#rescue-arrow)"
            />
            <text
              x={(x1 + x2) / 2 - uy * 10}
              y={(y1 + y2) / 2 + ux * 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="10"
              fontWeight="600"
              fill="#263b4b"
              stroke="#eff7f7"
              strokeWidth="4"
              paintOrder="stroke"
            >
              {distance}
            </text>
          </g>
        );
      })}
      {(Object.keys(RESCUE.beacons) as RescueBeacon[]).map((id) => {
        const [x, y] = xy(id);
        return (
          <g key={id}>
            <circle
              cx={x}
              cy={y}
              r="12"
              fill={id === "H" ? "#438567" : "#263b4b"}
            />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="white"
              fontSize="13"
              fontWeight="700"
            >
              {id}
            </text>
          </g>
        );
      })}
      <text x="18" y="208" fontSize="10" fill="#405961">
        A · start
      </text>
      <text x="220" y="208" fontSize="10" fill="#405961">
        H · charger
      </text>
    </svg>
  );
}
