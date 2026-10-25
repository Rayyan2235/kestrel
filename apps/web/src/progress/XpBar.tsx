import { useEffect, useRef, useState } from "react";
import { barSegments } from "./barSegments.js";
import { need } from "./levels.js";
import type { ProgressView } from "./store.js";
import styles from "./Hud.module.css";

const MERGE_MS = 1200;

/**
 * One pill: level, a two-segment bar (what you had, what you just earned) and
 * XP into the level. The new segment merges after the floater has been read.
 */
export function XpBar({ view }: { view: ProgressView }) {
  const [shown, setShown] = useState(view.xp);
  const last = useRef(view.xp);
  useEffect(() => {
    if (view.xp === last.current) return;
    last.current = view.xp;
    const id = window.setTimeout(() => setShown(view.xp), MERGE_MS);
    return () => window.clearTimeout(id);
  }, [view.xp]);
  const prev = Math.min(shown, view.xp);
  const seg = barSegments(prev, view.xp);
  return (
    <div
      className={styles.pill}
      data-testid="xp-pill"
      role="progressbar"
      aria-label={`Level ${view.level} progress`}
      aria-valuemin={need(view.level)}
      aria-valuemax={need(view.level + 1)}
      aria-valuenow={view.xp}
      aria-valuetext={`Level ${view.level}, ${view.into} of ${view.needed} XP`}
    >
      <strong>Lv {view.level}</strong>
      <span className={styles.track} aria-hidden="true">
        <i className={styles.old} style={{ width: `${seg.oldWidth * 100}%` }} />
        <i
          className={styles.fresh}
          style={{ width: `${seg.newWidth * 100}%` }}
        />
      </span>
      <span>
        {view.into} / {view.needed} XP
      </span>
      {view.unsaved && (
        <span className={styles.unsaved} data-testid="unsaved-note">
          Progress isn&apos;t being saved on this device
        </span>
      )}
    </div>
  );
}
