# Changelog

Append-only, newest at the bottom. Format: `## YYYY-MM-DD · agent · summary`, then bullets for changes, files and checks.

## 2026-10-24 · Claude Code · Repo familiarization and shared memory

- Read every repo doc and source file, plus the planning notes (`_context`, `build-order`, `project-status`, `product-brief`, `codebase-architecture`, `adr/README`).
- Copied the owner's planning folder into `context/HackPSU-2026/` (24 files) and gitignored `context/`.
- Created `agent-memory/` (this folder) and pointed `AGENTS.md`, `CLAUDE.md` and the new `CLAUDE.local.md` at it.
- Installed dependencies and Playwright Chromium. Ran `pnpm check`: pass, 9/9 tests. Ran `pnpm test:e2e`: 4/6; the chat-scroll test times out under the parallel run and passes alone.
- Published a private product readback page: https://claude.ai/artifact/LxXzM1Wedne7URXy8hVNGk
- No source code changed. Nothing committed.

## 2026-10-24 · Claude Code · Microduck lab sandbox and teammate scope

- Scope set by the teammate: Pythagoras with pushable squares, plus a voice base (STT/TTS with ElevenLabs, agent on local Qwen or Bedrock). Recorded in `08–10`.
- Cloned HF Space `pollen-robotics/microduck-simulator` (rev ad9d41a, Apache-2.0) to `../upstream/`. Vendored the MJCF, kinematics, GLB, 9 STLs and 7 ONNX policies into `apps/web/public/microduck/`, with PROVENANCE and SHA256SUMS.
- New contracts: `packages/contracts/src/lab.ts` (prop kits, Pythagoras slots, `DuckTaskSchema`, `parseDuckTask`) and `lab.test.ts`.
- New simulation: `apps/web/src/simulation/{constants,mjcf,duckSim,tasks,rig}.ts` and `tasks.test.ts`.
- New page: `apps/web/sandbox.html` and `src/sandbox/{main,SandboxApp,SandboxScene}.tsx` plus `Sandbox.module.css`. `vite.config.ts` now builds two pages. `App.tsx` links to the sandbox.
- Checks: typecheck pass, 18/18 unit tests. Headless probes: 50 Hz, walking, and the 3×3 push to its slot succeeds. The 5×5 push is unreliable. Build and e2e were not re-run.
- Found and worked around policy quirks: right turns stall from standstill, and small commands don't start the gait.
- The disk filled up mid-session. The user freed 4.55 GB.

## 2026-10-24 · Claude Code · Milestone: Pythagoras puzzle prototype

- Published "Square Up Puzzles" (https://claude.ai/artifact/NDm9dCFutiYqNPZ558FNgF):
  - Draggable unit-tile squares that snap only onto a side of the same length.
  - A live a² + b² = c² readout.
  - A hint ladder: another try, then a hint, then a demonstration.
  - Level 4 (good/bad teacher) and level 5 (doesn't close).
  - A table mapping each level to sandbox tasks and voice.
- Smoke-tested headless: keyboard placement completes level 1, no overflow at 400 px, no errors.
- Memory docs `08–10` written. The 5×5 push tolerance change was reverted to the version that completes the 3×3 push.

## 2026-10-24 · Claude Code · Milestone: Qwen located, agent model benchmark, pipeline explainer

- Found local Qwen: Ollama 0.40.8 on :11434 with `qwen2.5:1.5b` (the only chat model). Hardware and disk limits recorded.
- Added `scripts/agent-bench.mjs`: 6 learner requests against the real tool list on any OpenAI-compatible endpoint. Result: qwen2.5:1.5b scored 4/6, failing multi-step and the demonstration.
- Created `.env` (gitignored) with empty slots for ElevenLabs, Qwen and Bedrock. No secrets were written.
- Published an explainer of the action pipeline and the model options: https://claude.ai/artifact/YMQK6wK3QcdsP3ZTJKVVRg

## 2026-10-24 · Claude Code · Credentials check

- ElevenLabs key present in `.env` (`sk_…`, 51 chars) and recognized, but **restricted**: `user_read`, `models_read` and `voices_read` are all denied (HTTP 401 missing_permissions). It needs Text to Speech, Speech to Text and Voices (read) enabled in the ElevenLabs dashboard.
- Bedrock path chosen by the teammate: Claude in Amazon Bedrock (Mantle endpoint `https://bedrock-mantle.{region}.api.aws/anthropic/v1/messages`). The TS client is `AnthropicBedrockMantle` from `@anthropic-ai/bedrock-sdk`. Model IDs are `anthropic.claude-haiku-5-5` and `anthropic.claude-sonnet-5-5`. The IAM action is `bedrock-mantle:CreateInference`. Haiku 5.5 and Sonnet 5.5 have per-model access criteria, shown in the Bedrock console under Model access.
- `.env` gained empty `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_SESSION_TOKEN` slots, and the Qwen and Bedrock model defaults were prefilled. No AWS CLI is installed and there is no `~/.aws`.
- ElevenLabs key re-checked after the permission update: `/v1/user`, `/v1/models` and `/v1/voices` all return 200.
  - Plan and quota were checked; account details are not recorded here.
  - TTS models include `eleven_flash_v2_5` (lowest latency) and `eleven_v3`.
  - 33 voices are available. Candidates: Matilda `XrExE9yKIg1WjnnlVkGX` (educational) and Jessica `cgSgspJ2msm6clMCkdW9` (playful).

## 2026-10-24 · Claude Code · Milestone: Bedrock verified, Claude Sonnet 4.6 chosen

- `.env`: `AWS_REGION=us-east-1`. The IAM key is permanent (`AKIA`), so no session token is needed.
- Added `@anthropic-ai/bedrock-sdk@1.1.0` (exact pin) to `apps/api`. Added `apps/api/scripts/bedrock-check.mjs` and `agent-bench-bedrock.mjs`.
- Model access probe: Sonnet 4.6 works on the legacy route. Haiku 4.5 needs Marketplace subscribe IAM permissions. Haiku 5.5, Sonnet 5 and Sonnet 5.5 are not available to the account.
- Both benches now run a multi-step agent loop. Sonnet 4.6 scored 6/6; qwen2.5:1.5b scored 4/6. Total bench spend was about $0.11 at list price.

## 2026-10-24 · Claude Code · Export zip

- Created `../kestrel-duck-sandbox.zip` (6.4 MB, outside the repo). It contains the simulation, sandbox, contracts, Microduck assets, bench scripts, the memory docs 03, 09 and 10, the lockfile and package manifests, plus a README with install, run, command list, pipeline and file map. It has no `.env` and no secrets (checked).
- The teammate tested the typed box with natural questions and got the parser's fallback. **Voice and in-app Claude are still not built.** The disk filled up again, and the first attempt to write `apps/api/src/agent.ts` and `voice.ts` failed with nothing left on disk. This is the next priority.

## 2026-10-24 · Claude Code · Status reset after the user test

- Rewrote `06-handoff.md` with an honest state: what works, what isn't built (the whole voice/agent loop), and what failed (wrong-page confusion, the parser fallback on natural language, the disk-full write failure). It also has an ordered plan with exact ElevenLabs and Bedrock request details.
- `04-status.md`: added the first-user-test failure and its root cause (environment prioritised over the voice loop).
- `08-current-scope.md`: added a progress-vs-scope table and a lesson for the next agent.

## 2026-10-24 · Codex (GPT) · Voice + Claude loop built (recorded by Claude Code from Codex's transcript)

- Codex didn't update memory itself.
- Added `packages/contracts/src/agent.ts`: the agent request/response schemas and `validConversation`, which enforces tool_use/tool_result pairing.
- `DuckTaskSchema` push gained `direction` (left/right/forward/backward, relative to the start heading). The runner refuses direction plus toward together, and refuses a self-target.
- Added `apps/api/src/{agent,live,voice}.ts`:
  - `/api/agent/turn` calls Bedrock Sonnet 4.6 with one flat `duck_task` tool. The top-level `anyOf` schema was rejected by Bedrock, so it's flattened; the server re-validates with Zod.
  - `/api/voice/transcribe` uses ElevenLabs `scribe_v2`.
  - `/api/voice/speak` uses `eleven_flash_v2_5` with the Matilda default voice.
  - Requests are local-origin only, max 4 concurrent, with no logging of bodies.
  - `index.ts` loads `.env` via `process.loadEnvFile`.
- Added `apps/web/src/sandbox/agentSession.ts`, which owns mic capture, the agent loop and TTS. Each step speaks, then acts one task and returns the measured result plus the world. At most 6 actions, then a text-only summary. Stop, reset or a new request cancels everything.
- `SandboxApp`: Hold to talk, a voice toggle and phase display. Health mode changed `scaffold` → `sandbox`, and `check-api.mjs` was updated to match.
- Tests: `apps/api/src/live.test.ts`, `agentSession.test.ts` and `tests/sandbox.spec.ts` (mocked Claude). Codex reported 26 unit tests passing and `pnpm check` passing.
- Paid live check: `scripts/live-voice-check.mjs` (run with `pnpm dev` up). `scripts/check-agent.ts` is a one-call diagnostic.

## 2026-10-24 · Claude Code · Resumed from Codex: live verification

- Live run 1: the TTS→STT round trip passed, then the "Moved" wait timed out at 90 s with no diagnostics. This is flaky; the cause is unknown.
- Live run 2 (`tests/.probe-live.mjs`, which adds diagnostics):
  - **Voice loop passed:** synthetic speech, MediaRecorder, ElevenLabs STT ("Please walk forward 20 centimeters", 281 ms), Claude `move 0.2`, the duck moved 18 cm (measured), and 2 spoken replies.
  - **Demo "show me why 9 plus 16 equals 25":** Claude explained the theorem, then pushed square-3 (3 cm from its slot ✅) and square-4 (4 cm ✅). Pushing square-4 **knocked square-3 out of its slot** (1.34 m). square-5 was at 0.44 m when headless Chromium crashed ("Page crashed"), probably from the low disk (0.25 GB free).
- Fix: moved the Pythagoras tile starts so each tile approaches its slot from outside its own side: square-3 (-0.25, 0.35), square-4 (0.43, -0.8), square-5 (0.95, 0.62).
- **Live run 3 (`tests/.probe-demo.mjs`, typed, voice off):**
  - "What is the Pythagorean theorem?": the explanation appeared in the bubble and the chat, then in the same turn the duck pushed square-3 (4 cm), square-4 (4 cm) and square-5 (3 cm) into their slots. ✅ The new start positions fixed the knock-out.
  - ❌ The duck **fell after the last push**, and the recovery scattered the tiles (final 22–35 cm off). Claude's closing line still said "all placed".
  - "Move the crate to the right" (Free play): Claude called `push crate direction:right`. The crate moved 23 cm, mostly +x (duck-relative "right" plus a push timeout). Claude then wrongly said "it did not move", because the timeout summary had no measurement.
- **Fixes:**
  - `SCREEN_DIRS` and `CAMERA_OFFSET` in `simulation/constants.ts`. Push `direction` is now **screen-relative**: right means screen right, which is MuJoCo (+x, +y)/√2 with the fixed iso camera. `SandboxScene` uses the shared offset.
  - A push timeout now reports "It moved N cm and is still M cm from the target."
  - The agent prompt says directions are screen-relative and the closing summary must describe the CURRENT world.
  - Tests: 27/27 (updated the direction test, added a measured-give-up test). `tsc` is clean.
- **Live run 4, "Move the crate to the right":** the crate moved 16 cm screen-right with 0 cm sideways ✅. Claude still said "no movement registered", because every snapshot it sees is post-action.
  - Fix: a push success summary is now "X moved N cm and is M cm from its target", and the prompt says snapshots are post-action and to trust the measured summary.
- **Live run 5:** ✅ Claude now says "The crate moved 16 cm to the right, just a little short of the full 20 cm." The teammate's "move the box to the right" requirement is verified, typed with voice off.
- **Live run 6, theorem demo:** square-3 and square-4 placed, the square-5 push gave up (moved 39 cm, 49 cm short), and squares 3 and 4 were disturbed. ✅ Claude's summary was now **honest**: it said all slots were empty and the earlier placements undone. ❌ The demo is unreliable.
  - Change: the prompt now pushes **largest first** (5 → 4 → 3) so later tiles slide in from open sides. The push time budget went from 120 to 150 s.
- **Live run 6, theorem demo:** square-3 and square-4 were placed, the square-5 push gave up (moved 39 cm, 49 cm short), and squares 3 and 4 were disturbed. ✅ Claude's closing summary was **honest**: it said all slots were empty and the earlier placements undone. ❌ The demo is unreliable.
  - A proposed fix (prompt order largest-first 5 → 4 → 3, push budget 120 → 150 s) was **not applied**; the user interrupted.
- Added a "What to say" guide with observed replies to `02-runbook.md`.

## 2026-10-24 · Claude Code · Moments physics check

- First check of the Moments lesson (`tests/.probe-moments.mjs`, free). **Bug:** the plank tilted only about 1° with the 200 g weight 20 cm out. The pivot wedge's ridge ran along the plank (y), so the plank lay flat on a 10 cm ridge.
- Fix: the pivot gets `yaw: Math.PI / 2` in `momentsKit()`, so the ridge runs along the hinge axis (x). Re-check: the plank tips to −11.8° in about 3 s (its end on the floor; predicted ≈12.7°), and the weight stays on the plank.
- **Still limited:**
  - The duck can only push weights along the floor. It can't lift the 100 g weight onto the plank (the plank top is about 7 cm up), so no balancing experiment is possible yet.
  - Claude's prompt has no Moments-specific guidance.
  - The Moments lesson hasn't been tested with Claude or voice.

## 2026-10-24 · Claude Code · Pushed to branch `as-kestrel`

- Created branch `as-kestrel` from `73a294c` (the scaffold). It is **not** rebased onto `origin/main` (`32c575d`, a DESIGN.md update) and **not** merged with the owner's `origin/microduck-lab-windows`, which also puts real Microduck robots in a lab with per-bot agent windows and overlaps this work. Compare the two before merging.
- The repo is public. Before committing: scanned for secrets (none), removed the ElevenLabs quota details and the private vault path from memory, and confirmed `.env`, `context/` and `CLAUDE.local.md` stay gitignored. Excluded `debug.log` and the `tests/.probe-*.mjs` scratch probes.
- Rewrote `06-handoff.md` to the current state (the voice loop is built and verified, the demo is unreliable, Moments physics is fixed but there's no experiment action) and added a progress update to `08-current-scope.md`.

## 2026-10-24 · Claude Code · Moments display fix

- **Problem (screenshot):** the follow camera was centred on the duck at zoom 420, so the Moments plank and pivot (about 1.1 m away) were off-screen; only a plank corner showed. The lesson card also claimed pushing the floor weight affects the beam.
- **Fix:**
  - `LabKit.focus` (required): pythagoras (0.45, −0.05), moments (0.5, 0), free (0.1, 0).
  - `Duck` in `SandboxScene` centres the camera between the duck and `kit.focus`, with zoom easing from 420 down to 240 as they separate.
  - The Moments card text now describes the real state and says placing weights comes next.
- **Verified:** the screenshot shows the duck, pivot, tipped plank with the 200 g weight, and the floor weight. Tilt is −11.8°, no page errors, `tsc` clean, 27/27 tests.
- **Minor:** the duck's bubble can overlap the lesson card when the duck is top-left.

## 2026-10-24 · Claude Code · Remaining-steps backlog

- Added `11-remaining-steps.md`: 26 items in six groups (finish the slice, multiple bots, quality and tests, merge into the product, safety/cost/deployment, longer term), each tagged with acceptance checks where relevant. It's linked from `README.md` (with an update-protocol line) and from `06-handoff.md`.

## 2026-10-24 · Claude Code (implementer session) · Two-bot conversation demo, merged with `origin/main`

- **Added, behind `?demo=two-bot` only (the scripted preview and the sandbox are untouched):**
  - Contracts: `packages/contracts/src/ledger.ts` (addressed ledger event, `respond` tool schema, `eventId`) and `bot.ts`; `applyWeight` now bumps the world version on every mutation, plus `bumpVersion` and `resetWorld`.
  - `apps/web/src/simulation/types.ts` (`SimAdapter`) and `simulation/fake/` (a **temporary** stub over the analytic balance world; nothing above `SimAdapter` may depend on it).
  - `coordinator/` (ledger, per-bot state, abort, chain budget, `localTurn`/`askPeer`), `provider/` (deterministic **mock**, no network), `fastpath/` (number words, units, more/less/again/undo/other side, silence gate).
  - `bubbles/`, `handoff/`, `capsule/` (pure view models plus `BubbleLayer`, `ChannelPanel`, `CapsuleOverlay`), `presentation/` (paced one-bubble queue, Pause/Resume, 0.5x), `demo/TwoBotDemo.tsx`.
  - Tests: unit tests next to each module and `tests/two-bot-demo.spec.ts` (Playwright, installed Chrome, `playwright.chrome.config.ts`).
- **Merge:** merged `origin/main` (PR #2, the Microduck sandbox) into `feat/two-bot-demo` with no conflicts. Contracts `index.ts` exports both sets. The coordinator is **not** wired to `duckSim` yet; that is a separate task.
- **Checks:** `pnpm check` green after the merge (19 test files, 147 tests, build and API health OK).

## 2026-10-24 · Claude Code (for the owner) · Moments: weights the duck physically pushes, on branch `moments-floor-push`

- **What:** the Moments lesson is now a working experiment in the sandbox. It ports the owner's floor-balance work (weights on rails, paddles, a locked beam, and a driver tuned to the walking policy) into this lab's `PropSpec` / `buildSceneXml` / `DuckSim` / `TaskRunner` model, at real scale. Pythagoras and Free play are unchanged.
- **Files:**
  - `packages/contracts/src/lab.ts` (`PropSpec` mount fields, the `slide` joint, `MOMENTS`, `railAt`, the new `momentsKit`, three task kinds, grammar) and `agent.ts` (`world.balance`).
  - `apps/web/src/simulation/mjcf.ts` (nested bodies, slide joints, excludes, depth-first keyframe), `duckSim.ts` (lock pin and brakes), `tasks.ts` (balance tasks) and the new `moments.ts` (`Driver`, `PlaceWeight`).
  - `apps/web/src/sandbox/` (plank ruler, balance chips, Release/Lock button, measured balance in the agent snapshot, paddles hidden from Claude).
  - `apps/api/src/agent.ts` (tool kinds, `cm`, Moments prompt, target check).
  - Tests: `lab.test.ts` (+2), `tasks.test.ts` (+5), `tests/sandbox.spec.ts` (+1 mocked-Claude Moments spec).
- **Fixed along the way:** the route planner let the final leg ignore the target's own paddle, so a diagonal route walked through it (one push took 31.5 s); it now only exempts a leg that stays behind the paddle (17 s). A refusal said "Try 8 cm" when 7 was right (float rounding).
- **Checks:** `pnpm check` pass (154 tests); `pnpm test:e2e` 120/120 desktop + mobile; fast-stepped physics harness (24 random placements: 22 exact in 11–18 s, 1 refusal, 1 already there, 0 falls); live in the app, a 20 → 10 cm push then a level release. Not yet run: live Claude or voice.

## 2026-10-24 · Claude Code (for the owner) · Live Claude check of Moments on `moments-floor-push`

- Ran this branch's API (Bedrock credentials from the owner's local `.env`) behind the sandbox page, Moments lesson, voice off, and typed "Can you balance the plank?".
- Claude: worked out 4000 vs 2000 g·cm, called `place_weight {weight-200, 10}` (measured: moved from 20 cm to 10 cm), then `release_plank` (measured: stayed level, 0.0°), then a closing explanation consistent with the measurement. 3 model turns, 1.3–2.2 s each, no errors, no page errors.
- Not checked: spoken input and replies for Moments; "what are moments?".
