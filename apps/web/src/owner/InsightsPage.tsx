import { DEMO_MIN_LEARNERS, type Insights } from "@kestrel/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { loadInsights, percent } from "./insights";
import styles from "./InsightsPage.module.css";

// /owner/insights: what the nightly analytics job found, for the owner only.
// The API checks the token; this page only asks for it and shows the result.

export function InsightsPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<Insights | null>(null);

  useEffect(() => {
    document.title = "Kestrel — Insights";
    const robots = Object.assign(document.createElement("meta"), { name: "robots", content: "noindex" });
    document.head.append(robots);
    return () => robots.remove();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await loadInsights(token.trim());
    setBusy(false);
    if (result.ok) {
      setInsights(result.insights);
      setError(null);
    } else {
      setInsights(null);
      setError(result.message);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>Kestrel insights</h1>
        <p className={styles.muted}>Owner only. Mastery and prompt difficulty, recomputed each night from verified attempts.</p>
      </header>

      <form className={styles.form} onSubmit={submit}>
        <label htmlFor="owner-token">Owner token</label>
        <div className={styles.row}>
          <input
            id="owner-token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" disabled={busy || !token.trim()}>
            {busy ? "Loading…" : "Show insights"}
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </form>

      {insights && <Report insights={insights} />}
    </main>
  );
}

function Report({ insights }: { insights: Insights }) {
  const { learners, demo, updatedAt, concepts, prompts } = insights;
  return (
    <section aria-label="Insights">
      {demo && (
        <p className={styles.demo} role="status">
          <strong>Demo data.</strong> Only {learners} {learners === 1 ? "learner" : "learners"} so far (fewer than {DEMO_MIN_LEARNERS}).
          Treat these numbers as a demo, not findings.
        </p>
      )}
      <p className={styles.muted}>
        {updatedAt ? `Last computed ${new Date(updatedAt).toLocaleString()}.` : "The nightly job hasn't run yet."} {learners}{" "}
        {learners === 1 ? "learner" : "learners"} with verified attempts.
      </p>

      <h2>Mastery by concept</h2>
      {concepts.length ? (
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Concept</th>
                <th scope="col">Learners</th>
                <th scope="col">Mean mastery</th>
                <th scope="col">Verified attempts</th>
              </tr>
            </thead>
            <tbody>
              {concepts.map((c) => (
                <tr key={c.concept}>
                  <th scope="row">{c.concept}</th>
                  <td>{c.learners}</td>
                  <td>{percent(c.meanMastery)}</td>
                  <td>{c.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>No mastery yet.</p>
      )}

      <h2>Prompts, hardest first</h2>
      {prompts.length ? (
        <div className={styles.scroll}>
          <table>
            <thead>
              <tr>
                <th scope="col">Prompt</th>
                <th scope="col">Attempts</th>
                <th scope="col">Right</th>
                <th scope="col">Success rate</th>
                <th scope="col">Median tries</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr key={`${p.challengeId}/${p.promptId}`}>
                  <th scope="row">{p.promptId}</th>
                  <td>{p.attempts}</td>
                  <td>{p.successes}</td>
                  <td>{percent(p.rate)}</td>
                  <td>{p.medianTries ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.muted}>No prompt attempts yet.</p>
      )}
      <p className={styles.muted}>
        Success rate is smoothed, (right + 1) / (attempts + 2), so a prompt with few attempts sits near 50%.
      </p>
    </section>
  );
}
