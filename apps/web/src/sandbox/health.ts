// What the server can do, from /api/health, asked once per page. Offline or
// unreachable reads as the plain defaults (direct voice upload, ledger XP).

type Health = { voiceUpload?: string; verifiedXp?: boolean };
let health: Promise<Health> | null = null;

export const serverHealth = (): Promise<Health> =>
  (health ??= fetch("/api/health")
    .then((r) => (r.ok ? (r.json() as Promise<Health>) : {}))
    .catch(() => ({})));
