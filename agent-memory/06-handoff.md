# Current handoff — feat/p5-cdk-infra (PR #5)

Owner repo `Rayyan2235/kestrel`. Main is `2537c38`: PR #4 (triangle build fix) is merged, and CI ran the triangle spec green on desktop. PR #5 (P5, Python CDK in `infra/`, synth only) is in review; the tester passed it (pytest 5/5, synth 32 resources), and this branch now includes main.

Next:
1. PR #5: CI, then the owner merges.
2. P5b, after #5 merges, on a new branch off `rayyan/main`. Approved scope:
   - `POST /api/voice/upload-url` returns a presigned POST (≤ 10 MB, key `voice/<uuid>`, 5 min expiry).
   - `/api/voice/transcribe` also takes JSON `{key}`, accepting only `^voice/<uuid>$`. It reads the object and deletes it in a `finally`, even when transcription fails.
   - The raw-body path stays for Vultr; the web client picks a path from a `/api/health` flag.
   - Dependencies: `@aws-sdk/client-s3` and `@aws-sdk/s3-presigned-post`, pinned, in `apps/api`, and bundled.
   - Infra: `grant_put` on `voice/*` only, with a pytest assertion.
   - Unit tests use fake credentials (signing is local). The 9 MB end-to-end check is an [owner] item in `11-remaining-steps.md` (needs the AWS account).
3. Still not built (need P6 or an AWS account): the `@fastify/aws-lambda` bundle and origin-header check, and `cdk destroy` verification.
4. Owner: create SSM `/kestrel/elevenlabs-api-key` (SecureString) and `/kestrel/origin-header` (String) before the first deploy.

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
