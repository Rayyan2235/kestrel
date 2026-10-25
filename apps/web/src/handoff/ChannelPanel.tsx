import { BOT_NAMES, type BotId, type LedgerEvent } from "@kestrel/contracts";
import { ArrowDown, ChevronDown, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BotGlyph } from "../bubbles/BubbleLayer.js";
import { useCompact } from "../bubbles/useCompact.js";
import type { ChannelView } from "./model.js";
import styles from "./ChannelPanel.module.css";

/** A pane of the rail: the learner's thread or the robots' channel. */
export type RailPane = "you" | "bots";

const name = (who: LedgerEvent["to"]) =>
  who === "you" ? "You" : BOT_NAMES[who];

/** Keeps the view at the bottom only if the reader is already there. */
function ScrollLog({
  count,
  label,
  live,
  testId,
  role,
  children,
}: {
  count: number;
  label: string;
  live: "polite" | "off";
  testId: string;
  role: "log" | "region";
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prev = useRef(0);
  const [unread, setUnread] = useState(false);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (count < prev.current) setUnread(false);
    else if (count > prev.current) {
      if (atBottom.current) el.scrollTop = el.scrollHeight;
      else setUnread(true);
    }
    prev.current = count;
  }, [count]);

  return (
    <div className={styles.logWrap}>
      <div
        ref={box}
        className={styles.log}
        role={role}
        aria-live={live}
        aria-label={label}
        tabIndex={0}
        data-testid={testId}
        onScroll={() => {
          const el = box.current!;
          atBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (atBottom.current) setUnread(false);
        }}
      >
        {children}
      </div>
      {unread && (
        <button
          className={styles.pill}
          data-testid="new-messages"
          onClick={() => {
            const el = box.current!;
            el.scrollTop = el.scrollHeight;
            setUnread(false);
          }}
        >
          <ArrowDown size={14} aria-hidden="true" /> New messages
        </button>
      )}
    </div>
  );
}

export function ChannelPanel({
  view,
  threadBot,
  running,
  onAsk,
  onStop,
  embedded = false,
  open,
  onToggle,
}: {
  view: ChannelView;
  /** The bot the learner is talking to; titles the light thread. */
  threadBot: BotId;
  running: boolean;
  onAsk: (from: BotId, to: BotId) => void;
  onStop: () => void;
  /** Mounted beside another console that already has a log and a Stop (the real console). */
  embedded?: boolean;
  /**
   * Console accordion (embedded only): the unfolded pane, or null when the
   * console's own log is open. Left undefined, both panes stay open (the demo).
   */
  open?: RailPane | null;
  onToggle?: (pane: RailPane) => void;
}) {
  const peer: BotId = threadBot === "pip" ? "nova" : "pip";
  const [prediction, setPrediction] = useState<string | null>(null);
  const handbackId = view.handback?.id ?? null;
  useEffect(() => setPrediction(null), [handbackId]);
  const { callsUsed, hopsUsed } = view.budget;
  const compact = useCompact();
  const strip = useRef<HTMLDivElement>(null);
  // On phones the strip can sit below the fold: bring it into view. Scrolling never moves focus.
  useEffect(() => {
    if (compact && handbackId)
      strip.current?.scrollIntoView({ block: "nearest" });
  }, [compact, handbackId]);
  const [tab, setTab] = useState<RailPane>("you");
  const accordion = embedded && open !== undefined;
  // Phones get tabs, except in the console accordion, which already folds.
  const tabs = compact && !accordion;
  const visible = (t: RailPane) =>
    accordion ? open === t : !(tabs && tab !== t);
  const counts = { you: view.youThread.length, bots: view.botChannel.length };
  const [seen, setSeen] = useState(counts);
  // Reading a pane marks it seen; a reset (fewer entries) never leaves a stale count.
  useEffect(() => {
    setSeen((s) => ({
      you: Math.min(visible("you") ? counts.you : s.you, counts.you),
      bots: Math.min(visible("bots") ? counts.bots : s.bots, counts.bots),
    }));
  }, [tabs, tab, accordion, open, counts.you, counts.bots]);
  const unseen = (t: RailPane) => (visible(t) ? 0 : counts[t] - seen[t]);
  const unread = (t: RailPane) => tabs && unseen(t) > 0;
  // In the accordion, a pane's body folds away under its header. A plain
  // function, not a component, so React keeps the thread mounted across renders.
  const body = (pane: RailPane, children: ReactNode) =>
    accordion ? (
      <div className={styles.body} id={`crew-${pane}`} hidden={open !== pane}>
        {children}
      </div>
    ) : (
      children
    );
  const fold = (pane: RailPane, title: ReactNode) => (
    <h2>
      <button
        className={styles.fold}
        aria-expanded={open === pane}
        aria-controls={`crew-${pane}`}
        data-testid={`fold-${pane}`}
        onClick={() => onToggle?.(pane)}
      >
        {title}
        {unseen(pane) > 0 && (
          <span className={styles.count} data-testid={`count-${pane}`}>
            {unseen(pane)}
            <span className={styles.srOnly}> new</span>
          </span>
        )}
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      </button>
    </h2>
  );
  const controls = (
    <div className={styles.controls}>
      <button
        data-testid="ask-peer"
        disabled={running}
        onClick={() => onAsk(threadBot, peer)}
      >
        Ask {BOT_NAMES[peer]}
      </button>
      <button
        data-testid="stop"
        aria-label={embedded ? "Stop the robots" : undefined}
        className={styles.stop}
        disabled={!running}
        onClick={onStop}
      >
        <Square size={13} aria-hidden="true" /> Stop
      </button>
    </div>
  );

  return (
    <aside
      className={`${styles.rail} ${embedded ? styles.embedded : ""} ${accordion ? styles.accordion : ""}`}
      aria-label="Conversation"
      data-testid="rail"
    >
      {tabs && (
        <div
          role="tablist"
          aria-label="Conversation panes"
          className={styles.tabs}
        >
          {(
            [
              ["you", `You and ${BOT_NAMES[threadBot]}`],
              ["bots", `${BOT_NAMES[threadBot]} and ${BOT_NAMES[peer]}`],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              role="tab"
              id={`tab-${t}`}
              aria-selected={tab === t}
              aria-controls={`pane-${t}`}
              data-testid={`tab-${t}`}
              onClick={() => setTab(t)}
            >
              {label}
              {unread(t) && (
                <i
                  className={styles.dot}
                  data-testid={`unread-${t}`}
                  role="img"
                  aria-label="new messages"
                />
              )}
            </button>
          ))}
        </div>
      )}
      <section
        className={styles.you}
        id="pane-you"
        role={tabs ? "tabpanel" : undefined}
        aria-labelledby={tabs ? "tab-you" : undefined}
        hidden={tabs && tab !== "you"}
        data-surface="light"
        data-open={accordion ? open === "you" : undefined}
        aria-label={tabs ? undefined : `You and ${BOT_NAMES[threadBot]}`}
      >
        {accordion ? (
          fold(
            "you",
            <>
              <BotGlyph bot={threadBot} /> You and {BOT_NAMES[threadBot]}
            </>,
          )
        ) : (
          <h2>You and {BOT_NAMES[threadBot]}</h2>
        )}
        {body(
          "you",
          <>
        <ScrollLog
          count={view.youThread.length}
          label="Messages between you and the robots"
          live="polite"
          testId="you-thread"
          role={embedded ? "region" : "log"}
        >
          {view.youThread.length === 0 && (
            <p className={styles.empty}>
              Try “move the left weight to 30 cm”, or ask “why does it tilt?”.
            </p>
          )}
          {view.youThread.map((e) => (
            <article
              key={e.id}
              className={styles.entry}
              data-testid="thread-entry"
              data-to={e.to}
              data-from={e.from}
              data-kind={e.kind}
            >
              <header>
                <strong>{name(e.from)}</strong>
                <span className={styles.chip}>to {name(e.to)}</span>
                <span className={styles.source}>{e.source}</span>
              </header>
              <p>{e.text}</p>
            </article>
          ))}
        </ScrollLog>
          </>,
        )}
      </section>

      <section
        className={styles.channel}
        id="pane-bots"
        role={tabs ? "tabpanel" : undefined}
        aria-labelledby={tabs ? "tab-bots" : undefined}
        hidden={tabs && tab !== "bots"}
        data-surface="dark"
        data-open={accordion ? open === "bots" : undefined}
        aria-label={
          tabs ? undefined : `${BOT_NAMES[threadBot]} and ${BOT_NAMES[peer]}`
        }
      >
        {accordion ? (
          <div className={styles.foldRow}>
            {fold(
              "bots",
              <>
                <BotGlyph bot={threadBot} /> {BOT_NAMES[threadBot]} and{" "}
                {BOT_NAMES[peer]} <BotGlyph bot={peer} />
              </>,
            )}
            {controls}
          </div>
        ) : (
          <h2>
            <BotGlyph bot={threadBot} /> {BOT_NAMES[threadBot]} and{" "}
            {BOT_NAMES[peer]} <BotGlyph bot={peer} />
          </h2>
        )}
        {body(
          "bots",
          <>
        <p className={styles.legend}>
          Dark means the robots are talking to each other.
        </p>
        <div className={styles.status}>
          {(["pip", "nova"] as const).map((b) => (
            <span
              key={b}
              data-testid={`status-${b}`}
              data-state={view.status[b]}
            >
              {BOT_NAMES[b]}: {view.status[b]}
            </span>
          ))}
        </div>
        <div
          className={styles.budget}
          data-testid="budget"
          data-calls={callsUsed}
          data-hops={hopsUsed}
          role="img"
          aria-label={`${hopsUsed} of 1 hand-off, ${callsUsed} of 2 calls used`}
        >
          <span>Hand-off</span>
          <i data-on={hopsUsed >= 1} />
          <span>Calls</span>
          <i data-on={callsUsed >= 1} />
          <i data-on={callsUsed >= 2} />
        </div>
        <ScrollLog
          count={view.botChannel.length}
          label="Messages between the robots"
          live="off"
          testId="bot-channel"
          role={embedded ? "region" : "log"}
        >
          {view.botChannel.length === 0 && (
            <p className={styles.emptyDark}>No robot-to-robot messages yet.</p>
          )}
          {view.botChannel.map((e) => (
            <article
              key={e.id}
              className={styles.botEntry}
              data-testid="channel-entry"
              data-to={e.to}
              data-from={e.from}
              data-kind={e.kind}
            >
              <header>
                <strong>{name(e.from)}</strong>
                <span className={styles.darkChip}>to {name(e.to)}</span>
                <span className={styles.source}>{e.source}</span>
              </header>
              {e.kind === "handoff" && (
                <p className={styles.purpose}>
                  Purpose: Check my reading
                  {e.evidence && (
                    <span className={styles.evidence} data-testid="evidence">
                      {e.evidence}
                    </span>
                  )}
                </p>
              )}
              <p>{e.text}</p>
            </article>
          ))}
        </ScrollLog>
          </>,
        )}
      </section>
      {/* Controls and the handback stay visible whichever pane a phone shows. */}
      {!accordion && controls}
      {view.handback && (
        <div
          ref={strip}
          className={styles.handback}
          data-testid="handback-strip"
          data-source={view.handback.source}
          role="status"
        >
          <strong>Back to you: what do you predict?</strong>
          <div role="group" aria-label="Your prediction">
            {["Left side down", "Balanced", "Right side down"].map((p) => (
              <button
                key={p}
                aria-pressed={prediction === p}
                onClick={() => setPrediction(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
