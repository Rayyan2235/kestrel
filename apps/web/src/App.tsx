import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUp,
  Bird,
  BookOpen,
  Check,
  Info,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { balance, BOT_NAMES } from "@kestrel/contracts";
import { useLab } from "./state/lab";
import styles from "./App.module.css";
import { WeightControl } from "./components/WeightControl";
const LabScene = lazy(() =>
  import("./world/LabScene").then((module) => ({ default: module.LabScene })),
);

export function App() {
  const lab = useLab();
  const [text, setText] = useState("");
  const [chatOpen, setChatOpen] = useState(true);
  const reopen = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const reduced = Boolean(useReducedMotion());
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (log.current)
      log.current.scrollTop = lab.messages.length
        ? log.current.scrollHeight
        : 0;
  }, [lab.messages, chatOpen]);
  useEffect(() => {
    if (!lab.busy || lab.simulation.activeAction) return;
    const token = lab.epoch;
    const timer = window.setTimeout(
      () => useLab.getState().deliverExchange(token, lab.nextTurn),
      lab.nextTurn === 0 ? 650 : 1100,
    );
    return () => window.clearTimeout(timer);
  }, [lab.busy, lab.epoch, lab.nextTurn, lab.simulation.activeAction]);
  const result = balance(lab.world);
  const latest = [...lab.messages].reverse().find((m) => m.speaker !== "you");
  const simulation = lab.simulation;
  const active = simulation.activeAction;
  const last = simulation.lastAction;
  const live = simulation.mode === "game-controlled";
  const rejected =
    lab.lastSubmission && !lab.lastSubmission.accepted
      ? lab.lastSubmission.error
      : null;
  const actionText = active
    ? `${BOT_NAMES[active.request.botId]} · ${active.phase === "approach" ? "Approaching the bench" : active.phase === "dock" ? "Getting into position" : "Adjusting the weight"}`
    : last?.status === "completed"
      ? `${BOT_NAMES[last.request.botId]} finished · ${last.request.parameters.positionCm} cm`
      : last?.status === "cancelled"
        ? "Action stopped. Ready when you are."
        : last?.status === "failed"
          ? "Action could not finish. Try again."
          : "Choose a weight. Predict what will change.";
  function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    lab.send(text);
    setText("");
    setChatOpen(true);
  }
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Kestrel home">
          <Bird size={25} strokeWidth={1.7} />
          <h1>Kestrel</h1>
        </a>
        <span className={styles.tagline}>A little world of why.</span>
        <div className={styles.headerActions}>
          <span className={styles.preview}>Lab preview · scripted bots</span>
          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                className={styles.iconButton}
                aria-label="About this preview"
              >
                <Info size={19} />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className={styles.overlay} />
              <Dialog.Content className={styles.dialog}>
                <Dialog.Title>A small beginning. A curious crew.</Dialog.Title>
                <Dialog.Description>
                  This scaffold explores Kestrel’s room, conversations and a
                  balance experiment. The robots and their exchanges are
                  scripted placeholders.
                </Dialog.Description>
                <p>
                  Try “right weight to 40 cm” or “hint”. Ask the crew to watch
                  two robots share an observation. You can stop or reset at any
                  time.
                </p>
                <p>
                  Live AI, voice, trained walking and physical tool interactions
                  are the next integration milestones. The beam uses an ideal
                  massless model; its tilt is illustrative.
                </p>
                <Dialog.Close asChild>
                  <button className={styles.primary}>Back to the lab</button>
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
      <main
        className={`${styles.workspace} ${!chatOpen ? styles.chatClosed : ""}`}
      >
        <section className={styles.room} aria-label="Science lab">
          <div className={styles.mission}>
            <div className={styles.missionIcon}>
              <BookOpen size={21} />
            </div>
            <div>
              <h2>A matter of balance</h2>
              <p>Change one thing. See what happens.</p>
              <span className={styles.fixtureLabel}>
                Balance development fixture
              </span>
            </div>
          </div>
          <div className={styles.scene}>
            <Suspense
              fallback={<div className="scene-fallback">Opening the lab…</div>}
            >
              <LabScene
                reduced={reduced}
                latest={
                  active
                    ? {
                        speaker: active.request.botId,
                        recipient: "you",
                        text:
                          active.phase === "operate"
                            ? `Adjusting the ${active.request.objectId === "left-weight" ? "left" : "right"} weight to ${active.request.parameters.positionCm} cm.`
                            : "On my way to the balance bench.",
                      }
                    : latest
                }
              />
            </Suspense>
          </div>
          <section
            className={styles.measurements}
            aria-label="Balance controls"
          >
            <div className={styles.result}>
              <span
                className={
                  result === "balanced"
                    ? styles.balancedDot
                    : styles.observationDot
                }
              />
              <strong data-testid="balance-result">
                {result === "balanced"
                  ? "Balanced"
                  : `${result === "left" ? "Left" : "Right"} side down`}
              </strong>
              <span>Try a prediction first</span>
            </div>
            <div className={styles.sliders}>
              {(["left", "right"] as const).map((side) => (
                <WeightControl
                  key={`${side}-${simulation.resetGeneration}-${live ? 0 : lab.world.version}`}
                  side={side}
                  value={lab.world[side === "left" ? "leftCm" : "rightCm"]}
                  grams={
                    lab.world[side === "left" ? "leftGrams" : "rightGrams"]
                  }
                  disabled={Boolean(active)}
                  onCommit={(cm) => lab.moveWeight(side, cm)}
                />
              ))}
            </div>
            <div className={styles.actionState}>
              <p role="status" aria-live="polite">
                {actionText}
              </p>
              {active && (
                <progress
                  aria-label={`${BOT_NAMES[active.request.botId]} action progress`}
                  max={1}
                  value={active.progress}
                />
              )}
              {rejected && (
                <p className={styles.error} role="alert">
                  {rejected.message}
                </p>
              )}
              {!rejected && last?.status === "failed" && (
                <p className={styles.error} role="alert">
                  {last.error?.message}
                </p>
              )}
            </div>
            <p>Ideal massless beam · tilt is illustrative</p>
          </section>
        </section>
        {chatOpen ? (
          <aside className={styles.conversation} aria-label="Crew conversation">
            <div className={styles.chatHeader}>
              <div>
                <span className={styles.online} />
                <strong>The crew</strong>
                <span className={styles.crewCount}>2 companions</span>
              </div>
              <button
                className={styles.darkIcon}
                aria-label="Close conversation"
                ref={close}
                onClick={() => {
                  setChatOpen(false);
                  requestAnimationFrame(() => reopen.current?.focus());
                }}
              >
                <X size={18} />
              </button>
            </div>
            <div
              className={styles.log}
              role="log"
              aria-live="polite"
              aria-label="Crew messages"
              ref={log}
            >
              {lab.messages.length === 0 ? (
                <div className={styles.empty}>
                  <MessageCircle size={30} strokeWidth={1.3} />
                  <h3>Start with a question.</h3>
                  <p>
                    Move a weight, ask for a hint, or let the crew compare
                    notes.
                  </p>
                  <span>Pip is curious. Nova checks the details.</span>
                </div>
              ) : (
                lab.messages.map((m, i) => (
                  <div
                    className={`${styles.message} ${m.speaker === "you" ? styles.fromYou : ""}`}
                    key={i}
                  >
                    <div className={styles.messageMeta}>
                      {m.speaker === "you" ? "You" : BOT_NAMES[m.speaker]}
                      <span>
                        to{" "}
                        {m.recipient === "you" ? "you" : BOT_NAMES[m.recipient]}
                      </span>
                    </div>
                    <p>{m.text}</p>
                  </div>
                ))
              )}
              {lab.busy && !active && (
                <div className={styles.thinking} role="status">
                  The crew is comparing notes…
                </div>
              )}
            </div>
            <div className={styles.chatFooter}>
              <span>
                <span className={styles.smallDot} /> Scripted exchange · 2 turns
                max
              </span>
              <button
                className={styles.darkButton}
                onClick={() => lab.send("hint")}
              >
                Give me a hint
              </button>
            </div>
          </aside>
        ) : (
          <button
            ref={reopen}
            className={styles.reopen}
            onClick={() => {
              setChatOpen(true);
              requestAnimationFrame(() => close.current?.focus());
            }}
          >
            <MessageCircle size={18} /> Open conversation
          </button>
        )}
        <section className={styles.dock} aria-label="Command dock">
          <div className={styles.crew}>
            {(["pip", "nova"] as const).map((id) => (
              <button
                key={id}
                className={`${styles.bot} ${lab.selected === id ? styles.selected : ""}`}
                onClick={() => lab.select(id)}
                aria-pressed={lab.selected === id}
                aria-label={`Select ${BOT_NAMES[id]}`}
              >
                <span
                  className={`${styles.face} ${id === "nova" ? styles.teal : ""}`}
                >
                  <i />
                  <i />
                </span>
                <span>
                  {BOT_NAMES[id]}
                  <small>
                    {lab.selected === id
                      ? "Selected recipient"
                      : "Select companion"}
                  </small>
                </span>
                {lab.selected === id && <Check size={14} />}
              </button>
            ))}
          </div>
          <form onSubmit={send} className={styles.command}>
            <label htmlFor="command">To {BOT_NAMES[lab.selected]}</label>
            <input
              id="command"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              aria-label="Message your robot"
              placeholder="Try: right weight to 40 cm"
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label="Send command"
              disabled={!text.trim()}
            >
              <ArrowUp size={20} />
            </button>
          </form>
          <div className={styles.dockActions}>
            {lab.busy || active ? (
              <button
                className={styles.collaborate}
                onClick={lab.stop}
                aria-label={active ? "Stop action" : "Stop exchange"}
              >
                <Square size={15} /> Stop
              </button>
            ) : (
              <button
                className={styles.collaborate}
                onClick={() => {
                  lab.startExchange();
                  setChatOpen(true);
                }}
              >
                <Sparkles size={17} /> Ask the crew
              </button>
            )}
            <button
              className={styles.reset}
              aria-label="Reset lab"
              onClick={lab.reset}
            >
              <RotateCcw size={18} /> <span>Reset</span>
            </button>
          </div>
        </section>
      </main>
      <footer className={styles.footer}>
        <span>Select a companion. Try an idea. See why.</span>
        <span>
          {live
            ? "Game-controlled movement · scripted conversation"
            : "View-only pose fixture · direct apparatus preview"}
        </span>
      </footer>
    </div>
  );
}
