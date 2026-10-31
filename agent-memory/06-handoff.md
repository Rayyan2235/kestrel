# Current handoff — chore/cleanup

Owner repo `Rayyan2235/kestrel`, branch `chore/cleanup` off main `113c348` (P5b merged as #6; Vultr redeployed). Pushed to `rayyan`; the orchestrator opens the PR.

Done: the knip cleanup (see `07-changelog.md`, 2026-10-31), in three commits.

Next:
1. Tester (executor-c2): `pnpm check` and the infra pytest; CI runs e2e.
2. Usman: decide on the orphaned `simulation/types.ts`, `simulation/fake/` and `simulation/real/`.
3. Owner: confirm the Tiger data move, then remove the legacy path (#12-13).
4. P6 next: the `@fastify/aws-lambda` bundle and origin check, OIDC deploys, `cdk destroy` verification, and the 9 MB end-to-end check.

---

# Previous handoff — feat/p5b-voice-upload (PR #6, merged)

Owner repo `Rayyan2235/kestrel`, branch `feat/p5b-voice-upload` off main `346bb8d` (P5 merged as #5). Pushed to `rayyan`; the orchestrator opens the PR.

Done: presigned S3 voice upload (see `07-changelog.md`, 2026-10-31). The S3 code lives in `apps/api/src/storage/s3.ts`, and the web client switches on `/api/health` `voiceUpload`.

Next:
1. Tester (executor-c2): `pnpm check`, the infra pytest (`02-runbook.md`, Infra), and `tests/rescue-navigation.spec.ts` desktop, since `rescueVoice.ts` changed.
2. After P5b merges: `chore/cleanup` off `rayyan/main` (owner-approved scope from the tester's redundant-code scan).
3. Not built yet (need P6 or an AWS account): the `@fastify/aws-lambda` bundle and origin check (the API's Origin hook still accepts only local origins), `cdk destroy` verification, and the 9 MB end-to-end check.
4. Owner: create SSM `/kestrel/elevenlabs-api-key` (SecureString) and `/kestrel/origin-header` (String) before the first deploy.

---

# Previous handoff — feat/p5-cdk-infra (PR #5, merged)

Python CDK in `infra/`, synth only; merged as `346bb8d`.

---

# Previous handoff — fix/triangle-build (PR #4, merged)

"Build it together" fills 3/3 slots on the real sim (see `07-changelog.md`, 2026-10-28). Merged as `2537c38`; CI desktop 141 passed, 7 skipped.

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
