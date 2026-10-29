# Current handoff — feat/p5-cdk-infra

Owner repo, branch `feat/p5-cdk-infra` off main `e39c395`. Synth only: no AWS account yet.

Done: the Python CDK stack in `infra/` with 5 pytest infra-policy checks (see `07-changelog.md`, 2026-10-28, and `02-runbook.md`, Infra).

Next:
1. Tester: run the commands in `02-runbook.md` → Infra exactly.
2. Not in this branch: the `@fastify/aws-lambda` bundle and origin-header check, the presigned voice upload route and the 9 MB end-to-end check, and `cdk destroy` verification. All need P6 or an AWS account.
3. Owner: create SSM `/kestrel/elevenlabs-api-key` (SecureString) and `/kestrel/origin-header` (String) before the first deploy.

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
