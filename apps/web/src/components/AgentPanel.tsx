import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUp, MessagesSquare } from "lucide-react";
import { BOT_NAMES, type BotId, type Message, type SimulationSnapshot } from "@kestrel/contracts";
import { formatInt, peerOf } from "./measure";
import styles from "../App.module.css";

const who = (id: Message["speaker"]) => (id === "you" ? "You" : BOT_NAMES[id]);
const phaseText = { approach: "Walking to the bench", dock: "Lining up at the control", operate: "Turning the weight control", done: "Finishing" } as const;
const phaseShort = { approach: "Walking", dock: "Docking", operate: "Operating", done: "Finishing" } as const;

/** One bot's current action, or its last measured outcome. */
export function botActivity(id: BotId, sim: SimulationSnapshot) {
  const active = sim.activeAction?.request.botId === id ? sim.activeAction : null;
  if (active) {
    const side = active.request.objectId === "left-weight" ? "left" : "right";
    return { tone: "busy" as const, short: phaseShort[active.phase], text: `${phaseText[active.phase]} · ${side} weight to ${active.request.parameters.positionCm} cm`, progress: active.progress };
  }
  const last = sim.lastAction?.request.botId === id ? sim.lastAction : null;
  if (!last) return { tone: "idle" as const, short: "Ready", text: "Ready for a request.", progress: null };
  const side = last.request.objectId === "left-weight" ? "left" : "right";
  if (last.status === "completed" && last.result)
    return {
      tone: "done" as const,
      short: "Done",
      text: `Moved the ${side} weight to ${last.request.parameters.positionCm} cm. Measured ${formatInt(last.result.leftGramCentimeters)} g·cm left and ${formatInt(last.result.rightGramCentimeters)} g·cm right: ${last.result.balance === "balanced" ? "balanced" : `${last.result.balance} side turns harder`}.`,
      progress: null,
    };
  if (last.status === "cancelled") return { tone: "stopped" as const, short: "Stopped", text: `Stopped. The ${side} weight stayed where it was.`, progress: null };
  return { tone: "failed" as const, short: "Failed", text: last.error?.message ?? "The action did not finish.", progress: null };
}

/** The conversation of one bot: its status, its history (with bot-to-bot turns labelled) and its own composer. */
export function AgentPanel({
  id,
  messages,
  simulation,
  busy,
  onSend,
  onCompare,
  autoFocus,
}: {
  id: BotId;
  messages: Message[];
  simulation: SimulationSnapshot;
  busy: boolean;
  onSend: (id: BotId, text: string) => void;
  onCompare: (id: BotId) => void;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const mine = messages.filter((m) => m.speaker === id || m.recipient === id);
  const activity = botActivity(id, simulation);
  const name = BOT_NAMES[id],
    peer = BOT_NAMES[peerOf(id)];
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [mine.length]);
  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onSend(id, draft);
    setDraft("");
  }
  return (
    <div className={styles.panel}>
      <div className={styles.activity} data-tone={activity.tone} aria-live="polite">
        <p>{activity.text}</p>
        {activity.progress !== null ? (
          <div className={styles.progress} role="progressbar" aria-label={`${name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(activity.progress * 100)}>
            <span style={{ width: `${Math.round(activity.progress * 100)}%` }} />
          </div>
        ) : null}
      </div>
      {mine.length === 0 ? (
        <p className={styles.empty}>No messages with {name} yet. Ask something, or try “right weight to 40 cm”.</p>
      ) : (
        <ol ref={log} className={styles.log} aria-label={`${name} conversation`}>
          {mine.map((m, i) => {
            const botToBot = m.speaker !== "you" && m.recipient !== "you";
            return (
              <li key={i} className={styles.message} data-from={m.speaker === "you" ? "you" : m.speaker === id ? "self" : "peer"} data-bot-to-bot={botToBot}>
                <span className={styles.messageMeta}>
                  {who(m.speaker)} → {who(m.recipient)}
                  {botToBot ? <span className={styles.scripted}>scripted</span> : null}
                </span>
                <span>{m.text}</span>
              </li>
            );
          })}
        </ol>
      )}
      <form className={styles.composer} onSubmit={submit}>
        <label className="visually-hidden" htmlFor={`compose-${id}`}>
          Message {name}
        </label>
        <input
          ref={input}
          id={`compose-${id}`}
          className={styles.composeInput}
          value={draft}
          autoComplete="off"
          placeholder={`Message ${name}`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className={styles.send} aria-label={`Send to ${name}`} disabled={!draft.trim()}>
          <ArrowUp size={18} aria-hidden="true" />
        </button>
      </form>
      <div className={styles.panelFoot}>
        <button type="button" className={styles.quiet} onClick={() => onCompare(id)} disabled={busy}>
          <MessagesSquare size={16} aria-hidden="true" /> Ask {peer} to check
        </button>
        <span className={styles.footNote}>Scripted replies · live AI not connected</span>
      </div>
    </div>
  );
}
