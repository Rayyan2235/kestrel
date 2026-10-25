import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye, EyeOff, LayoutPanelLeft, RotateCcw } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { BOT_NAMES, type BotId } from "@kestrel/contracts";
import { useLab } from "./state/lab";
import { useWindows } from "./windows/store";
import { useMicroduck } from "./microduck/status";
import { Dock, MobileSheet, WindowsLayer } from "./components/Crew";
import { FlatLab } from "./components/FlatLab";
import { KestrelMark } from "./components/KestrelMark";
import { actionStatus } from "./components/measure";
import { WeightPanel } from "./components/WeightPanel";
import { WorldLabels, type Bubble } from "./components/WorldLabels";
import type { Insets } from "./world/LabScene";
import { SceneBoundary, webglAvailable } from "./world/support";
import styles from "./App.module.css";

const LabScene = lazy(() => import("./world/LabScene").then((m) => ({ default: m.LabScene })));

const BUBBLE_MS = 7000;
const phaseShort = { approach: "Walking", dock: "Lining up", operate: "Operating", done: "Done" } as const;

function useWide() {
  const query = "(min-width: 900px)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

export function App() {
  const lab = useLab();
  const win = useWindows();
  const physics = useMicroduck();
  const reduced = Boolean(useReducedMotion());
  const wide = useWide();
  const [gl] = useState(webglAvailable);
  const [sceneFailed, setSceneFailed] = useState(false);
  const flat = !gl || sceneFailed;
  const [openSide, setOpenSide] = useState<"left" | "right" | null>(null);
  const [focusBot, setFocusBot] = useState<BotId | null>(null);
  const [bubbles, setBubbles] = useState<Partial<Record<BotId, Bubble & { at: number }>>>({});
  const [chrome, setChrome] = useState({ top: 96, bottom: 120 });
  const top = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const weightButtons = useRef<Record<"left" | "right", HTMLButtonElement | null>>({ left: null, right: null });
  const seen = useRef(0);

  const simulation = lab.simulation;
  const active = simulation.activeAction;
  const activeBot = active?.request.botId ?? null;
  const status = actionStatus(simulation);
  const rejected = lab.lastSubmission && !lab.lastSubmission.accepted ? lab.lastSubmission.error : null;

  // Scripted crew exchange delivery (the runtime owns only action motion).
  useEffect(() => {
    if (!lab.busy || lab.simulation.activeAction) return;
    const token = lab.epoch;
    const timer = window.setTimeout(() => useLab.getState().deliverExchange(token, lab.nextTurn), lab.nextTurn === 0 ? 650 : 1400);
    return () => window.clearTimeout(timer);
  }, [lab.busy, lab.epoch, lab.nextTurn, lab.simulation.activeAction]);

  // Bubbles and windows read the same messages: a new bot message is also a short bubble above the speaker.
  useEffect(() => {
    if (lab.messages.length < seen.current) setBubbles({});
    const fresh = lab.messages.slice(Math.min(seen.current, lab.messages.length));
    seen.current = lab.messages.length;
    const next: Partial<Record<BotId, Bubble & { at: number }>> = {};
    fresh.forEach((m, i) => {
      if (m.speaker !== "you") next[m.speaker] = { text: m.text, speaker: m.speaker, recipient: m.recipient, key: Date.now() + i, at: Date.now() };
    });
    if (Object.keys(next).length) setBubbles((b) => ({ ...b, ...next }));
  }, [lab.messages]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setBubbles((b) => {
        const now = Date.now();
        const kept = Object.fromEntries(Object.entries(b).filter(([, v]) => v && now - v.at < BUBBLE_MS));
        return Object.keys(kept).length === Object.keys(b).length ? b : kept;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useLayoutEffect(() => {
    const measure = () =>
      setChrome({
        top: (top.current?.getBoundingClientRect().bottom ?? 80) + 8,
        bottom: bottom.current ? window.innerHeight - bottom.current.getBoundingClientRect().top + 8 : 120,
      });
    measure();
    const ro = new ResizeObserver(measure);
    if (top.current) ro.observe(top.current);
    if (bottom.current) ro.observe(bottom.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [wide]);

  // The camera frames the experiment in the space the windows leave free.
  const insets: Insets = useMemo(() => {
    let left = 16,
      right = 16;
    if (wide && !win.hidden && win.area) {
      for (const id of ["pip", "nova"] as const) {
        const b = win.boxes[id];
        if (win.state[id] !== "open" || !b) continue;
        if (b.left + b.width / 2 < win.area.width / 2) left = Math.max(left, b.left + b.width + 16);
        else right = Math.max(right, win.area.width - b.left + 16);
      }
      const spare = window.innerWidth - left - right;
      if (spare < 480) {
        const scale = Math.max(0, (window.innerWidth - 480) / (left + right));
        left *= scale;
        right *= scale;
      }
    }
    return { top: chrome.top, bottom: chrome.bottom, left, right };
  }, [wide, win.hidden, win.area, win.boxes, win.state, chrome]);

  const pickBot = (id: BotId) => {
    lab.select(id);
    if (wide) {
      win.open(id);
      setFocusBot(id);
      requestAnimationFrame(() => setFocusBot(null));
    } else win.setMobile(id, true);
  };
  const closeWeight = () => {
    const side = openSide;
    setOpenSide(null);
    if (side) requestAnimationFrame(() => weightButtons.current[side]?.focus());
  };
  const bubbleView = useMemo(
    () => Object.fromEntries(Object.entries(bubbles).map(([k, v]) => [k, v && { text: v.text, speaker: v.speaker, recipient: v.recipient, key: v.key }])),
    [bubbles],
  ) as Partial<Record<BotId, Bubble>>;
  const anyOpen = win.state.pip === "open" || win.state.nova === "open";
  const shared = {
    messages: lab.messages,
    simulation,
    busy: lab.busy,
    focusBot,
    onSend: (id: BotId, text: string) => lab.sendTo(id, text),
    onCompare: (id: BotId) => lab.startExchange(id),
  };
  const capability =
    physics.state === "running"
      ? "Robots: Microduck bodies in MuJoCo, walked by its trained policy in your browser. Station action and replies are scripted; live AI is not connected."
      : physics.state === "failed"
        ? `Microduck physics could not start (${physics.error}); placeholder robots use authored movement. Replies are scripted.`
        : physics.state === "disabled"
          ? "Microduck physics is off for this run; placeholder robots use authored movement. Replies are scripted; live AI is not connected."
        : "Loading Microduck physics… Replies are scripted; live AI is not connected.";

  return (
    <div className={styles.app} data-flat={flat} style={{ ["--bottom-inset" as string]: `${chrome.bottom}px`, ["--top-inset" as string]: `${chrome.top}px` } as React.CSSProperties}>
      <div className={styles.stage}>
        {flat ? (
          <FlatLab simulation={simulation} onOpenWeight={setOpenSide} weightButtons={weightButtons} />
        ) : (
          <SceneBoundary fallback={<SceneFailed onFail={() => setSceneFailed(true)} />}>
            <Suspense fallback={<p className={styles.loading}>Opening the lab…</p>}>
              <LabScene
                selected={lab.selected}
                reduced={reduced}
                insets={insets}
                onPickBot={pickBot}
                onPickWeight={setOpenSide}
                onBackground={() => openSide && setOpenSide(null)}
              />
            </Suspense>
          </SceneBoundary>
        )}
        {!flat ? (
          <WorldLabels
            world={lab.world}
            selected={lab.selected}
            activeBot={activeBot}
            phaseLabel={active ? phaseShort[active.phase] : null}
            bubbles={bubbleView}
            openSide={openSide}
            onSelect={pickBot}
            onOpenWeight={(side) => setOpenSide((s) => (s === side ? null : side))}
            weightButtons={weightButtons}
          />
        ) : null}
      </div>

      {wide ? <WindowsLayer {...shared} /> : null}

      <header ref={top} className={styles.top}>
        <div className={styles.intro}>
          <KestrelMark />
          <div>
            <h1 className={styles.title}>Kestrel · Balance bench</h1>
            <p className={styles.prompt}>Move a weight and watch the beam. Which side turns harder?</p>
          </div>
        </div>
        <div className={styles.topActions}>
          {wide ? (
            <>
              <button
                type="button"
                className={styles.glassButton}
                aria-pressed={win.hidden}
                disabled={!anyOpen}
                onClick={win.toggleHidden}
              >
                {win.hidden ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                <span>{win.hidden ? "Show windows" : "Show lab"}</span>
              </button>
              <button type="button" className={styles.glassButton} onClick={win.arrange}>
                <LayoutPanelLeft size={17} aria-hidden="true" />
                <span>Arrange</span>
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={styles.glassButton}
            aria-label="Reset lab"
            onClick={() => {
              setOpenSide(null);
              lab.reset();
            }}
          >
            <RotateCcw size={17} aria-hidden="true" />
            <span className={styles.hideNarrow}>Reset</span>
          </button>
        </div>
      </header>

      {openSide ? (
        <WeightPanel
          side={openSide}
          world={lab.world}
          recipient={lab.selected}
          busyBot={activeBot}
          anchored={wide && !flat}
          onMove={(side, cm) => {
            lab.moveWeight(side, cm);
            closeWeight();
          }}
          onClose={closeWeight}
        />
      ) : null}

      <div ref={bottom} className={styles.bottom}>
        {!wide ? <MobileSheet {...shared} /> : null}
        <Dock
          selected={lab.selected}
          simulation={simulation}
          busy={lab.busy}
          wide={wide}
          status={rejected && !active ? rejected.message : status.text}
          tone={rejected && !active ? "failed" : status.tone}
          onChip={(id) => {
            if (wide && win.state[id] === "open" && !win.hidden && win.order.at(-1) === id) win.minimize(id);
            else pickBot(id);
          }}
          onStop={lab.stop}
        />
        <p className={styles.capability}>{capability}</p>
      </div>
      <p className="visually-hidden" aria-live="polite">
        {active ? `${BOT_NAMES[active.request.botId]} ${phaseShort[active.phase]}` : ""}
      </p>
    </div>
  );
}

function SceneFailed({ onFail }: { onFail: () => void }) {
  useEffect(onFail, [onFail]);
  return null;
}
