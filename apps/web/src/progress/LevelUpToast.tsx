import { useEffect, useRef } from "react";
import styles from "./Hud.module.css";

/** Toast dwell follows the Pacing rule: max(2.5 s, 60 ms per character), capped at 6 s. */
export const toastMs = (text: string): number =>
  Math.min(6000, Math.max(2500, text.length * 60));

/**
 * Level-up notice. role=status, never takes focus. Pause freezes its timer.
 * Everything it says also lives on the XP pill, Recent XP and the Workshop.
 */
export function LevelUpToast({
  level,
  hasReward,
  paused,
  speed,
  onDismiss,
  onWorkshop,
}: {
  level: number;
  hasReward: boolean;
  paused: boolean;
  speed: number;
  onDismiss: () => void;
  onWorkshop: () => void;
}) {
  const text = hasReward
    ? `Level ${level}. Pick your reward`
    : `Level ${level}`;
  const left = useRef(toastMs(text));
  const live = useRef({ paused, speed });
  live.current = { paused, speed };
  useEffect(() => {
    left.current = toastMs(text);
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (!live.current.paused)
        left.current -= (now - last) * live.current.speed;
      last = now;
      if (left.current <= 0) onDismiss();
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <div className={styles.toast} data-testid="levelup-toast" role="status">
      <span>{text}</span>
      {hasReward && (
        <button onClick={onWorkshop} data-testid="toast-workshop">
          Open Workshop
        </button>
      )}
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
