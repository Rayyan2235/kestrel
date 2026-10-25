import styles from "./Sandbox.module.css";

/**
 * The landing page's Kestrel mark: a pair of eyes and the Grandstander
 * wordmark with a lavender full stop. Over the console's light glass the
 * white eye pill gets an ink outline so it does not disappear.
 */
export function KestrelLogo() {
  return (
    <span className={styles.logo}>
      <svg viewBox="0 0 64 34" fill="none" aria-hidden="true">
        <rect x="1" y="1" width="62" height="32" rx="16" fill="#ffffff" stroke="#2c2c2c" strokeWidth="2" />
        <circle cx="20" cy="17" r="10" fill="#141414" />
        <circle cx="44" cy="17" r="10" fill="#141414" />
        <circle cx="22" cy="14" r="3" fill="#ffffff" />
        <circle cx="46" cy="14" r="3" fill="#ffffff" />
      </svg>
      <h1>
        kestrel<span className={styles.logoPeriod}>.</span>
      </h1>
    </span>
  );
}
