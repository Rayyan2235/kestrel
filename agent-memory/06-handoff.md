# Current handoff — tiger-data-progress

Branch `tiger-data-progress` (from `rescue-main`), PR to `main`. Do not merge; do not touch PR #21.

Done: learner progress for the Tiger Data prize. Wins are logged to `localStorage` and, with `TIGER_DATABASE_URL`, to the `attempts` hypertable (see `03-codebase-map.md`, Progress). `pnpm check` is green with the database mocked.

Next:
1. Owner creates the Tiger Data service and sets `TIGER_DATABASE_URL` in the root `.env`.
2. Restart the API; `/api/health` should show `progress: true`. Verify a real insert (`POST /api/progress`) and read (`GET /api/progress/:learner`), then win an objective in the console, refresh, and check the board keeps it.
3. Possible follow-up: log failed attempts too (for example a beam experiment that finishes tipped), so attempt counts mean more than wins.

Previous handoff (rescue-main, PR #21) is unchanged: see `07-changelog.md`.
