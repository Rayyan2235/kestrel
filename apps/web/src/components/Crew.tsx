import { useLayoutEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Square } from "lucide-react";
import { BOT_NAMES, type BotId, type Message, type SimulationSnapshot } from "@kestrel/contracts";
import { clampBox } from "../windows/geometry";
import { useLab } from "../state/lab";
import { useWindows } from "../windows/store";
import { AgentPanel, botActivity } from "./AgentPanel";
import { AgentWindow } from "./AgentWindow";
import { BotFace } from "./BotFace";
import styles from "../App.module.css";

const BOTS: readonly BotId[] = ["pip", "nova"];
type Shared = {
  messages: Message[];
  simulation: SimulationSnapshot;
  busy: boolean;
  focusBot: BotId | null;
  onSend: (id: BotId, text: string) => void;
  onCompare: (id: BotId) => void;
};

/** Desktop: one floating window per bot, Open Space style. */
export function WindowsLayer(props: Shared) {
  const area = useRef<HTMLDivElement>(null);
  const w = useWindows();
  useLayoutEffect(() => {
    const el = area.current!;
    const measure = () => useWindows.getState().setArea({ width: el.clientWidth, height: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const front = w.order.filter((id) => w.state[id] === "open").at(-1);
  return (
    <div ref={area} className={styles.windowsArea}>
      {w.area
        ? BOTS.filter((id) => w.state[id] === "open" && w.boxes[id]).map((id) => (
            <AgentWindow
              key={id}
              id={id}
              box={clampBox(w.boxes[id]!, w.area!)}
              area={w.area!}
              others={BOTS.filter((o) => o !== id && w.state[o] === "open" && w.boxes[o]).map((o) => clampBox(w.boxes[o]!, w.area!))}
              z={10 + w.order.indexOf(id)}
              front={front === id}
              status={botActivity(id, props.simulation).short}
              hidden={w.hidden}
              onPlace={(box) => w.place(id, box)}
              onRaise={() => w.raise(id)}
              onMinimize={() => w.minimize(id)}
              onClose={() => w.close(id)}
            >
              <AgentPanel id={id} {...props} autoFocus={props.focusBot === id} />
            </AgentWindow>
          ))
        : null}
    </div>
  );
}

/** Phone: one expandable conversation window with a tab per bot. */
export function MobileSheet(props: Shared) {
  const { mobileTab, mobileOpen, setMobile } = useWindows();
  return (
    <section className={styles.sheet} data-open={mobileOpen} aria-label="Crew conversation">
      <div className={styles.sheetBar}>
        <div role="tablist" aria-label="Bot conversations" className={styles.tabs}>
          {BOTS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              className={styles.tab}
              aria-selected={mobileTab === id}
              aria-controls="crew-sheet-panel"
              onClick={() => {
                useLab.getState().select(id);
                setMobile(id, true);
              }}
            >
              <BotFace id={id} size={24} /> {BOT_NAMES[id]}
              <span className={styles.tabStatus}>{botActivity(id, props.simulation).short}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles.roundButton}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Collapse conversation" : "Expand conversation"}
          onClick={() => setMobile(mobileTab, !mobileOpen)}
        >
          {mobileOpen ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
        </button>
      </div>
      {mobileOpen ? (
        <div id="crew-sheet-panel" role="tabpanel" className={styles.sheetBody}>
          <AgentPanel key={mobileTab} id={mobileTab} {...props} autoFocus={false} />
        </div>
      ) : null}
    </section>
  );
}

/** The dock: each bot's window (minimized or open), the scripted crew exchange, and Stop. */
export function Dock({
  selected,
  simulation,
  busy,
  wide,
  status,
  tone,
  onChip,
  onStop,
}: {
  selected: BotId;
  simulation: SimulationSnapshot;
  busy: boolean;
  wide: boolean;
  status: string;
  tone: string;
  onChip: (id: BotId) => void;
  onStop: () => void;
}) {
  const state = useWindows((s) => s.state);
  return (
    <section className={styles.dock} aria-label="Crew dock">
      <p className={styles.status} data-tone={tone} aria-live="polite">
        {status}
      </p>
      <div className={styles.dockRow}>
        {(wide ? BOTS : []).map((id) => (
          <button
            key={id}
            type="button"
            className={styles.chip}
            data-bot={id}
            aria-pressed={selected === id}
            aria-label={`Select ${BOT_NAMES[id]}`}
            aria-describedby={`chip-${id}`}
            onClick={() => onChip(id)}
          >
            <BotFace id={id} size={28} />
            <span className={styles.chipName}>{BOT_NAMES[id]}</span>
            <span id={`chip-${id}`} className={styles.chipStatus}>
              {botActivity(id, simulation).short}
              {wide ? <span className="visually-hidden">, window {state[id]}</span> : null}
            </span>
          </button>
        ))}
        <button type="button" className={styles.stop} onClick={onStop} disabled={!busy} aria-label="Stop">
          <Square size={13} aria-hidden="true" fill="currentColor" />
          <span>Stop</span>
        </button>
      </div>
    </section>
  );
}
