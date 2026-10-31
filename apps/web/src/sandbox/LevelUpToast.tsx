import { Sparkles } from "lucide-react";
import { useEffect } from "react";
import styles from "./Sandbox.module.css";

/** How long the level-up notice stays before it dismisses itself. */
const LEVEL_UP_MS = 4000;

/** Level-up celebration (ported from the gamification HUD). role=status, never takes focus. */
export function LevelUpToast({ level, onDismiss }: { level: number; onDismiss: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, LEVEL_UP_MS);
    return () => window.clearTimeout(id);
  }, [level, onDismiss]);
  return (
    <div className={styles.levelUp} role="status" data-testid="levelup-toast">
      <Sparkles size={18} aria-hidden="true" />
      <strong className="heading-sm">Level {level}!</strong>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
