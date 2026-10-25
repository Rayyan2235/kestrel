import { Check, ChevronDown, Target } from "lucide-react";
import { OBJECTIVES, type ObjectiveId } from "./objectives";
import styles from "./Sandbox.module.css";

/**
 * The playground's objectives. Picking one sets up its challenge; its XP bar
 * stays empty until the simulator measures the goal met, then fills.
 */
export function ObjectivesBoard({
  active,
  won,
  earned,
  open,
  onToggle,
  onStart,
}: {
  active: ObjectiveId | null;
  /** This attempt at the active objective is met. */
  won: boolean;
  /** Every objective completed at least once. */
  earned: ReadonlySet<ObjectiveId>;
  open: boolean;
  onToggle: () => void;
  onStart: (id: ObjectiveId) => void;
}) {
  const current = OBJECTIVES.find((o) => o.id === active) ?? null;
  return (
    <section className={`gic-toast ${styles.objectives}`} aria-label="Objectives" data-testid="objectives">
      <button type="button" className={styles.objectivesHead} aria-expanded={open} onClick={onToggle}>
        <Target size={16} aria-hidden="true" />
        <span className="heading-sm">Objectives</span>
        <span className={`caption ${styles.objectivesCount}`}>
          {earned.size} / {OBJECTIVES.length} done
        </span>
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      </button>

      {current && (
        <div className={styles.activeObjective} data-testid="active-objective">
          <p className="body">
            <strong>{current.title}</strong>
          </p>
          <p className={`caption ${styles.objectiveBrief}`}>{won ? current.win : current.brief}</p>
          <div
            className={`${styles.xpTrack} ${won ? styles.xpWon : ""}`}
            role="progressbar"
            aria-label={`${current.title} XP`}
            aria-valuemin={0}
            aria-valuemax={current.xp}
            aria-valuenow={won ? current.xp : 0}
            data-testid="xp-bar"
          >
            <i style={{ width: won ? "100%" : "0%" }} />
          </div>
          <p className={`label ${styles.xpText}`}>{won ? `+${current.xp} XP · full bar!` : `0 / ${current.xp} XP`}</p>
        </div>
      )}

      {open && (
        <ul className={styles.objectiveList}>
          {OBJECTIVES.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={styles.objectiveItem}
                aria-pressed={o.id === active}
                onClick={() => onStart(o.id)}
              >
                <small>{o.subject}</small>
                <span>{o.title}</span>
                <span className={earned.has(o.id) ? "gic-tag gic-tag--on" : "gic-tag"}>
                  {earned.has(o.id) ? <Check size={12} aria-label="Done" /> : `${o.xp} XP`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
