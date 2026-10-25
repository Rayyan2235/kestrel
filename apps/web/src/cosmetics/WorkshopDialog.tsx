import * as Dialog from "@radix-ui/react-dialog";
import { BOT_NAMES, type BotId } from "@kestrel/contracts";
import { Shuffle, Wrench, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { offer } from "../progress/offers.js";
import { mulberry32, seedFrom } from "../progress/rng.js";
import type { ProgressStore } from "../progress/store.js";
import { useProgress } from "../progress/useStore.js";
import { BotFigure } from "./BotFigure.js";
import { CATALOG, itemById, itemsFor, type Slot } from "./catalog.js";
import { allowed, whyNot } from "./constraints.js";
import styles from "./Workshop.module.css";

type Tab = "shell" | "eyes" | "gear";
const TABS: { id: Tab; label: string; slots: Slot[] }[] = [
  { id: "shell", label: "Shell", slots: ["shell", "accent"] },
  { id: "eyes", label: "Eyes", slots: ["eye", "eyeShape"] },
  { id: "gear", label: "Gear", slots: ["head", "back", "neck"] },
];
const SLOT_LABEL: Record<Slot, string> = {
  shell: "Shell colour",
  accent: "Accent",
  eye: "Eye colour",
  eyeShape: "Eye shape",
  head: "Head",
  back: "Back",
  neck: "Neck",
};
const SHUFFLE_SLOTS: Slot[] = ["shell", "accent", "eye", "eyeShape"];
const other = (bot: BotId): BotId => (bot === "pip" ? "nova" : "pip");

/** Workshop: change a robot's look. Cosmetic only; nothing here changes how a robot moves. */
export function WorkshopDialog({
  store,
  open,
  onOpenChange,
  persisted,
  shows,
}: {
  store: ProgressStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  persisted: boolean;
  /** Only these items appear (the 3D robots cannot draw the rest yet). */
  shows?: ReadonlySet<string>;
}): ReactNode {
  const visible = (id: string) => !shows || shows.has(id);
  const drawn = (slot: Slot) =>
    itemsFor(slot).some((i) => i.id !== "none" && visible(i.id));
  const tabs = TABS.map((t) => ({ ...t, slots: t.slots.filter(drawn) })).filter(
    (t) => t.slots.length > 0,
  );
  const shuffleSlots = SHUFFLE_SLOTS.filter(drawn);
  const view = useProgress(store);
  const [bot, setBot] = useState<BotId>("pip");
  const [tab, setTab] = useState<Tab>("shell");
  const [mirror, setMirror] = useState(false);
  const [shuffles, setShuffles] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const look = view.equipped[bot];
  const peer = view.equipped[other(bot)];
  const offers =
    view.tokens > 0
      ? offer(
          seedFrom(`offers:${view.picks.length}`),
          view.level,
          view.unlocked,
        ).filter(visible)
      : [];

  const shuffle = () => {
    const rnd = mulberry32(seedFrom(`shuffle:${bot}:${shuffles}`));
    const kept: string[] = [];
    for (const slot of shuffleSlots) {
      const current = store.get().equipped[bot];
      const pool = allowed(slot, current, store.get().equipped[other(bot)])
        .filter((id) => store.get().unlocked.has(id) && visible(id))
        .filter((id) => id !== current[slot]);
      if (!pool.length) {
        kept.push(slot);
        continue;
      }
      store.equip(bot, slot, pool[Math.floor(rnd() * pool.length)]!);
    }
    setShuffles((n) => n + 1);
    setNote(
      kept.length
        ? `Shuffle kept your ${kept.map((s) => SLOT_LABEL[s as Slot].toLowerCase()).join(", ")}: no other allowed option yet.`
        : null,
    );
  };

  const close = (next: boolean) => {
    if (!next) {
      store.markSeen(
        CATALOG.filter((i) => !i.free && store.get().unlocked.has(i.id)).map(
          (i) => i.id,
        ),
      );
    }
    onOpenChange(next);
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Trigger asChild>
        <button
          data-testid="workshop-open"
          aria-label="Open Workshop"
          title="Workshop: change how a robot looks"
        >
          <Wrench size={14} aria-hidden="true" /> Workshop
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.content}
          data-testid="workshop-dialog"
          aria-describedby="workshop-desc"
        >
          <header className={styles.head}>
            <Dialog.Title>Workshop</Dialog.Title>
            <Dialog.Close asChild>
              <button aria-label="Close Workshop">
                <X size={16} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>
          <Dialog.Description id="workshop-desc" className={styles.note}>
            Cosmetic: does not change how {BOT_NAMES[bot]} moves.{" "}
            <span data-testid="saved-note">
              {persisted ? "Saved" : "Demo profile: not saved"}
            </span>
          </Dialog.Description>
          <div className={styles.grid}>
            <div className={styles.crew} role="group" aria-label="Robot">
              {(["pip", "nova"] as const).map((b) => (
                <button
                  key={b}
                  aria-pressed={bot === b}
                  onClick={() => {
                    setBot(b);
                    setNote(null);
                  }}
                >
                  {BOT_NAMES[b]}
                </button>
              ))}
            </div>
            <div className={styles.preview}>
              <div
                style={{ transform: mirror ? "scaleX(-1)" : undefined }}
                data-testid="workshop-preview"
              >
                <BotFigure
                  id={bot}
                  look={look}
                  size={128}
                  attrs={{ "data-preview": "true" }}
                />
              </div>
              <div className={styles.row}>
                <button onClick={() => setMirror((m) => !m)}>Turn</button>
                <button data-testid="shuffle" onClick={shuffle}>
                  <Shuffle size={14} aria-hidden="true" /> Shuffle
                </button>
              </div>
              {note && (
                <p role="status" data-testid="shuffle-note">
                  {note}
                </p>
              )}
            </div>
            <div className={styles.picker}>
              <div
                role="tablist"
                aria-label="Look parts"
                className={styles.row}
              >
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    data-testid={`workshop-tab-${t.id}`}
                    aria-selected={tab === t.id}
                    onClick={() => setTab(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {tabs
                .filter((t) => t.id === tab)
                .map((t) => (
                  <div key={t.id} role="tabpanel" className={styles.panel}>
                    {t.slots.map((slot) => (
                      <fieldset key={slot} className={styles.slot}>
                        <legend>{SLOT_LABEL[slot]}</legend>
                        <div className={styles.tiles}>
                          {itemsFor(slot)
                            .filter((item) => visible(item.id))
                            .map((item) => {
                              const isUnlocked = view.unlocked.has(item.id);
                              const why = isUnlocked
                                ? whyNot(
                                    slot,
                                    item.id,
                                    look,
                                    peer,
                                    BOT_NAMES[other(bot)],
                                  )
                                : item.minLevel > view.level
                                  ? `Reach level ${item.minLevel}`
                                  : "Pick a reward to unlock";
                              const blocked = why !== null;
                              const worn = look[slot] === item.id;
                              const fresh =
                                isUnlocked &&
                                !item.free &&
                                !view.seen.includes(item.id);
                              return (
                                <button
                                  key={item.id}
                                  className={styles.tile}
                                  data-testid={
                                    item.id === "none"
                                      ? `item-none-${slot}`
                                      : `item-${item.id}`
                                  }
                                  aria-disabled={
                                    blocked && !worn ? "true" : undefined
                                  }
                                  aria-pressed={worn}
                                  onClick={() => {
                                    if (blocked && !worn) return;
                                    store.equip(bot, slot, item.id);
                                  }}
                                >
                                  {item.color && (
                                    <i
                                      className={styles.swatch}
                                      style={{ background: item.color }}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span>{item.label}</span>
                                  {fresh && (
                                    <b
                                      data-testid="new-dot"
                                      aria-label="New"
                                      className={styles.dot}
                                    />
                                  )}
                                  {blocked && !worn && <small>{why}</small>}
                                </button>
                              );
                            })}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                ))}
            </div>
          </div>
          {offers.length > 0 && (
            <section
              className={styles.rewards}
              data-testid="reward-offers"
              aria-label="Pick your reward"
            >
              <h3>Pick your reward ({view.tokens} to pick)</h3>
              <div className={styles.row}>
                {offers.map((id) => (
                  <button
                    key={id}
                    data-testid={`reward-pick-${id}`}
                    onClick={() => {
                      const r = store.pick(id, bot);
                      setNote(r.note);
                    }}
                  >
                    {itemById(id)?.label ?? id}
                    <small> {SLOT_LABEL[itemById(id)?.slot ?? "shell"]}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
