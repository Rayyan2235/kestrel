import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./Sandbox.module.css";

/** One collapsible window in the console. Closed, it is a single header row. */
export function ConsolePane({
  title,
  dot,
  state,
  open,
  onToggle,
  unread = 0,
  children,
}: {
  title: string;
  dot?: ReactNode;
  /** The robot's live state, shown at the right of the header. */
  state?: string;
  open: boolean;
  onToggle: () => void;
  unread?: number;
  children: ReactNode;
}) {
  return (
    <div className={styles.pane} data-open={open}>
      <button type="button" className={styles.paneHead} aria-expanded={open} onClick={onToggle}>
        {dot}
        <span className="label">{title}</span>
        {state && (
          <span className={`caption ${styles.paneState}`}>
            {state}
          </span>
        )}
        {!open && unread > 0 && (
          <span className="gic-tag" aria-label={`${unread} new`}>
            {unread} new
          </span>
        )}
        <ChevronDown size={14} aria-hidden="true" className={`${styles.chevron} ${state ? "" : styles.pushRight}`} />
      </button>
      {open && children}
    </div>
  );
}
