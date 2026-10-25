import styles from "./Lessons.module.css";

export function DemoOutcomeOverlay({ complete, lesson, message, onContinue, onRetry }: {
  complete: boolean;
  lesson: "pythagoras" | "moments";
  message: string;
  onContinue: () => void;
  onRetry: () => void;
}) {
  return (
    <div className={styles.scrim}>
      <section className={styles.quiz} role="dialog" aria-modal="true" aria-labelledby="demo-result-title">
        <header className={styles.head}>
          <div>
            <span className={styles.kicker}>{complete ? "DEMONSTRATION COMPLETE" : "DEMONSTRATION INCOMPLETE"}</span>
            <h2 id="demo-result-title">{complete ? "Here is what the robots measured" : lesson === "pythagoras" ? "The squares need another try" : "The balance test needs another try"}</h2>
          </div>
        </header>
        <div className={styles.question}>
          <p>{message}</p>
          <footer className={styles.footer}>
            {complete ? (
              <button className={styles.primary} onClick={onContinue}>Continue to the quiz</button>
            ) : (
              <button className={styles.primary} onClick={onRetry}>Reset the board and try again</button>
            )}
          </footer>
        </div>
      </section>
    </div>
  );
}
