import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { LevelUpToast } from "./LevelUpToast.js";
import { XpBar } from "./XpBar.js";
import { XpFloaters, type FeedItem } from "./XpFloaters.js";
import type { ProgressStore } from "./store.js";
import { useProgress } from "./useStore.js";
import styles from "./Hud.module.css";

const SHOW_MS = 1500;
const RECENT_MAX = 8;

/** Turns store changes into readable lines: one per triggering event, plus rejections. */
function useFeed(store: ProgressStore) {
  const view = useProgress(store);
  const [queue, setQueue] = useState<FeedItem[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const seen = useRef({ awards: view.awards.length });
  const nextId = useRef(1);
  useEffect(() => {
    const fresh = view.awards.slice(seen.current.awards);
    seen.current.awards = view.awards.length;
    const items: FeedItem[] = [];
    const groups = new Map<number, typeof fresh>();
    for (const a of fresh)
      groups.set(a.triggeredBy, [...(groups.get(a.triggeredBy) ?? []), a]);
    for (const group of groups.values()) {
      const xp = group.reduce((n, a) => n + a.xp, 0);
      const reason = (group.find((a) => a.ruleId === "match") ?? group.at(-1)!)
        .reason;
      items.push({
        id: nextId.current++,
        text: `+${xp} ${reason}`,
        info: false,
      });
    }
    for (const r of view.rejections)
      items.push({ id: nextId.current++, text: r, info: true });
    if (view.rejections.length) store.ackRejections();
    if (!items.length) return;
    setQueue((q) => [...q, ...items]);
    setRecent((r) => [...items.map((i) => i.text), ...r].slice(0, RECENT_MAX));
  }, [view.awards, view.rejections, store]);
  const [current, setCurrent] = useState<FeedItem | null>(null);
  useEffect(() => {
    if (current || !queue.length) return;
    setCurrent(queue[0]!);
    setQueue((q) => q.slice(1));
  }, [current, queue]);
  useEffect(() => {
    if (!current) return;
    const id = window.setTimeout(() => setCurrent(null), SHOW_MS);
    return () => window.clearTimeout(id);
  }, [current]);
  return { view, current, recent };
}

export function ProgressHud({
  store,
  paused,
  speed,
  onWorkshop,
}: {
  store: ProgressStore;
  paused: boolean;
  speed: number;
  onWorkshop: () => void;
}) {
  const { view, current, recent } = useFeed(store);
  const [open, setOpen] = useState(false);
  const jump = view.levelUps.at(-1);
  useEffect(() => {
    if (jump) store.markSeen(view.awards.map((a) => a.awardId));
  }, [jump, store, view.awards]);
  return (
    <div className={styles.hud}>
      <XpBar view={view} />
      <XpFloaters item={current} />
      <button
        className={styles.link}
        data-testid="recent-xp-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <History size={14} aria-hidden="true" /> Recent XP
      </button>
      {open && (
        <ul className={styles.recent} data-testid="recent-xp">
          {recent.length ? (
            recent.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)
          ) : (
            <li>Nothing yet</li>
          )}
        </ul>
      )}
      {jump && (
        <LevelUpToast
          level={jump.to}
          hasReward={view.tokens > 0}
          paused={paused}
          speed={speed}
          onDismiss={() => store.ackLevelUps()}
          onWorkshop={() => {
            store.ackLevelUps();
            onWorkshop();
          }}
        />
      )}
    </div>
  );
}
