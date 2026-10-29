# Current handoff — fix/triangle-build

Owner repo `Rayyan2235/kestrel`, branch `fix/triangle-build` off main `e39c395`. Pushed to `rayyan`; the orchestrator or owner opens the PR (body draft from the implementer). Flag: it changes `apps/web/src/simulation/` (task layer only).

Done: "Build it together" fills 3/3 slots on the real sim (see `07-changelog.md`, 2026-10-28). Vultr runs `e39c395` and `pnpm smoke:live` passed.

Next:
1. Tester (executor-c9): run `tests/triangle-build.spec.ts` alone, once, desktop, with nothing else heavy running; then CI.
2. Implementer: P5 on a new branch off `rayyan/main`: a Python CDK app in `infra/` with pytest assertions; `cdk synth` only, no deploy (no AWS account yet).

---

# Previous handoff — judges-deck

Branch `judges-deck`, PR #24 to `main`. PRs #21–#23 are merged into `main`.

Done: `docs/judges/` holds the judges' deck (`kestrel-judges.pptx`) and the table loop (`loop.html`); see `docs/judges/README.md` and `07-changelog.md`.

Next:
1. Owner review of the deck and loop on PR #24.
2. Install Inter on the presenting laptop (`brew install --cask font-inter`) so PowerPoint does not substitute it.

---

# Previous handoff — tiger-data-progress

Branch `tiger-data-progress` (from `rescue-main`), PR to `main`. Do not merge; do not touch PR #21.

Done: learner progress for the Tiger Data prize. Wins are logged to `localStorage` and, with `TIGER_DATABASE_URL`, to the `attempts` hypertable (see `03-codebase-map.md`, Progress). `pnpm check` is green with the database mocked.

Next:
1. Done: a real insert and read against Tiger Cloud are verified (see `07-changelog.md`).
2. Restart the API; strict TLS now passes, so `/api/health` should show `progress: true`. A win then a refresh, with progress restored from the database alone, is verified in the browser.
3. Possible follow-up: log failed attempts too (for example a beam experiment that finishes tipped), so attempt counts mean more than wins.

Previous handoff (rescue-main, PR #21) is unchanged: see `07-changelog.md`.
