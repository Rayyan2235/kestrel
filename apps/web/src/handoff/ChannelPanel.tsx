import { BOT_NAMES, type BotId, type LedgerEvent } from "@kestrel/contracts";
import { ArrowDown, Square } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BotGlyph } from "../bubbles/BubbleLayer.js";
import type { ChannelView } from "./model.js";
import styles from "./ChannelPanel.module.css";

const name = (who: LedgerEvent["to"]) =>
  who === "you" ? "You" : BOT_NAMES[who];

/** Keeps the view at the bottom only if the reader is already there. */
function ScrollLog({
  count,
  label,
  live,
  testId,
  children,
}: {
  count: number;
  label: string;
  live: "polite" | "off";
  testId: string;
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
        role="log"
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
}: {
  view: ChannelView;
  /** The bot the learner is talking to; titles the light thread. */
  threadBot: BotId;
  running: boolean;
  onAsk: (from: BotId, to: BotId) => void;
  onStop: () => void;
}) {
  const peer: BotId = threadBot === "pip" ? "nova" : "pip";
  const [prediction, setPrediction] = useState<string | null>(null);
  const handbackId = view.handback?.id ?? null;
  useEffect(() => setPrediction(null), [handbackId]);
  const { callsUsed, hopsUsed } = view.budget;

  return (
    <aside className={styles.rail} aria-label="Conversation" data-testid="rail">
      <section
        className={styles.you}
        data-surface="light"
        aria-label={`You and ${BOT_NAMES[threadBot]}`}
      >
        <h2>You and {BOT_NAMES[threadBot]}</h2>
        <ScrollLog
          count={view.youThread.length}
          label="Messages between you and the robots"
          live="polite"
          testId="you-thread"
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
      </section>

      <section
        className={styles.channel}
        data-surface="dark"
        aria-label={`${BOT_NAMES[threadBot]} and ${BOT_NAMES[peer]}`}
      >
        <h2>
          <BotGlyph bot={threadBot} /> {BOT_NAMES[threadBot]} and{" "}
          {BOT_NAMES[peer]} <BotGlyph bot={peer} />
        </h2>
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
            className={styles.stop}
            disabled={!running}
            onClick={onStop}
          >
            <Square size={13} aria-hidden="true" /> Stop
          </button>
        </div>
        {view.handback && (
          <div
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
      </section>
    </aside>
  );
}
