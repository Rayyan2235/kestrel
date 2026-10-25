import styles from "./Hud.module.css";

export type FeedItem = { id: number; text: string; info: boolean };

/** One reason at a time ("+25 prediction matched", "already counted"). Static: no motion needed. */
export function XpFloaters({ item }: { item: FeedItem | null }) {
  return (
    <div className={styles.floaterSlot} role="status" aria-live="polite">
      {item && (
        <span
          key={item.id}
          className={styles.floater}
          data-testid="xp-floater"
          data-info={item.info}
        >
          {item.text}
        </span>
      )}
    </div>
  );
}
