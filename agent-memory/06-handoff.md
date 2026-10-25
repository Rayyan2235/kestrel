# Current handoff — fix-contact-leak

Branch `fix-contact-leak` (from `main`), PR #29. PRs #21–#24 are merged into `main`.

Done: `DuckSim.audit()` now frees MuJoCo's `data.contact` copy, which leaked ~2 MB/s of wasm memory until the tab aborted at the 2 GB cap. See `07-changelog.md`.

Rule for MuJoCo bindings: any value with a `.delete()` method (an embind object returned by value) must be freed by JS; typed-array views such as `data.xpos` need nothing.

Next: merge PR #29 and redeploy, so a demo tab can stay open through judging.

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
