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

## 2026-10-24 · Claude Code (for the owner) · Two robots, faster navigation, cooperative experiments (`two-duck-lab`, uncommitted)

- **Measured the walking policy first.** Dead zones: forward 0.10–0.20, backward −0.15 to −0.30, pure turns ≤ 1.0, and lateral entirely. Top safe forward command is about 0.6 (0.27 m/s); 1.0 falls. Pivots work at 1.6–4.0. Full table in `04-status.md`.
- **Root causes fixed:** the old controllers commanded inside those dead zones (turn creep 0.1, push 0.12–0.20, back-up −0.2), and pushes ignored placed squares. A new `Navigator` replaced them: twice as fast, final error 6.2 → 2.6 cm, path 1.94× → 1.34× straight line.
- **Two robots in one MjModel/MjData**, after ROSClaw Duckverse's composer and runtime, with a cross-talk check.
- **Duckverse-style per-substep contact ledger.** Two binding bugs found and fixed along the way:
  - stale WASM typed-array views;
  - `mj_contactForce` needs a `DoubleBuffer` out-parameter.
- **Moments:**
  - The rail clamp no longer eases a carriage onto the mark; it only holds it where the robot left it.
  - The pin was raised to 8 cm, the pivot narrowed, and the paddles stiffened.
  - Added `set_balance`, the two-robot experiment, with a learner prediction panel.
- **Pythagoras:** `build_squares` (two stages, two robots). Pushes withdraw off the square and detour around other props.
- **Claude:** `set_balance` and `build_squares` tools, plus crew guidance in the prompt.
- **Attribution:** `apps/web/src/simulation/THIRD_PARTY.md`. The mesh-licence caution (CC BY-SA-NC per Duckverse) is in `PROVENANCE.md`.
- **Checks:**
  - `pnpm check` pass (159 tests).
  - `pnpm test:e2e` 121 passed and 1 skipped by design. The new UI spec runs the real two-robot experiment.
  - Benchmarks in `scripts/bench/`.
  - REA 6.7.0 `list-browser-targets` and `inspect-web-page` against the running sandbox reported no workers, and the changed modules are served.
- **Not run:** a spoken (voice) or live-Claude run on this branch.

## 2026-10-25 · Claude Code (side session for the owner) · Real `SimAdapter` for the two-bot demo (`two-bot-real-sim`)

- **Seam:** `SimAdapter.apply(task, version, signal?)` is async. It settles when the physical action lands, fails (new `reason: "failed"`) or the signal aborts it, and holds the per-object lock until then. Results carry an optional `summary`. Stub: `apply` became `async`, nothing else.
- **Coordinator:** `act` awaits the sim with an abort signal (chain + new `actTimeoutMs`, 60 s). The chain cap counts talk time and pauses while a bot acts. A failed action shows the sim's summary (the old notice is the fallback); a measured summary is added after the reply, before a handback.
- **Adapter:** `apps/web/src/simulation/real/index.ts` over the two-robot `DuckSim`:
  - `left-weight` → `weight-200` (Pip), `right-weight` → `weight-100` (Nova);
  - rails 5–30 cm;
  - snapshots are measured rail positions (0.1 cm, 100 ms poll, version bump on change);
  - abort cancels the owner's task and the clamp holds the weight where it stands.
  `real/load.ts` boots DuckSim on the Moments kit.
- **Demo:** `?demo=two-bot&sim=mujoco` lazily loads the real lab, with a loading banner, falling back to the stub on failure. The banner says which sim runs.
- **Files:** `apps/web/src/simulation/{types.ts,fake/index.ts,fake/sim.test.ts,real/*}`, `apps/web/src/coordinator/{index.ts,types.ts,coordinator.test.ts}`, `apps/web/src/demo/TwoBotDemo.tsx`, `tests/two-bot-real-sim.spec.ts`.
- **Checks:**
  - `pnpm check` pass (183 tests, 159 before).
  - Stub e2e `two-bot-demo` + `pacing` + `integration`: 108/108 passed.
  - `tests/two-bot-real-sim.spec.ts` 2/2 on desktop: "Moved the 200 g weight from 20 cm to 10.1 cm (asked for 10 cm)."; readout "Left 10.1 cm · Right 20 cm" equals the sim's measured rail; Pip's paddle contact in the contact ledger; Stop mid-push keeps the weight where it stood.
- **Not changed:** Moments physics, navigation, contracts.
- **Not run:** live provider or voice with the real sim; the mobile project for the real-sim spec (skipped by design).

## 2026-10-25 · Claude Code (side session for the owner) · Live Claude for Pip and Nova in the two-bot demo (`two-bot-real-sim`)

- **API:** `POST /api/two-bot/respond` (`apps/api/src/twoBot.ts`), registered in `live.ts`. It makes one Bedrock call per bot turn (`AnthropicBedrock`, `BEDROCK_MODEL_ID`, `AWS_REGION`), uses a persona per bot, forces a flat `respond` tool, maps it onto `Respond` and validates with Zod. A peer turn can never ask again. Keys stay server-side.
- **Web:** `provider/live.ts` sits behind the existing `Provider`. It is labelled `live`; any API or contract failure falls back to the mock, labelled `mock`; an abort rejects. The demo uses it only for `?provider=live` when `/api/health` reports `liveAi`. The banner and hint say so. The default (`/?demo=two-bot`) is unchanged.
- **Contracts:** `SourceSchema` gains `live`. The ledger test now rejects an unknown label instead of `live`.
- **Checks:**
  - `pnpm check` pass.
  - New tests: 3 API with mocked Bedrock, 3 live provider with mocked fetch.
  - Stub e2e `two-bot-demo` + `pacing` + `integration`: 108/108 passed.
  - Live check `scripts/two-bot-live-check.mjs` (paid, cents): Pip handed off to Nova, Nova pushed the right weight 20 → 24.9 cm (measured), then a live handback, 15.7 s in all.

## 2026-10-25 · Claude Code (for the owner) · Moments: rail end-stop bug, tilt prediction, settling (`moments-floor-push`)

- **CI failure on PR #7 (my Moments e2e):** 200 g at 15 cm against 100 g at 30 cm read "level" by moments (29.44 vs 29.47 N·cm), but the plank measured "left side down 1°".
- **Root cause, measured:** the push stopped 0.4 mm past the 30 cm mark, which was also the rail's joint limit. The soft limit kept pressing the carriage back, and its reaction acts 5.4 cm below the pivot pin, so it tilted a balanced plank: 0° at 30.00 cm, 1.14° at 30.04 cm, 3.7° at 30.10 cm. The same happened at the 5 cm end.
- **Fix:** each rail now travels 5 mm past its 5 cm and 30 cm marks (`MOMENTS.railTravel`), and the plank is 66 cm long. Regression e2e: equal moments with a weight at or just past each end mark stays level. It fails on the old geometry (1.14°) and passes now.
- **Second cause of the same flakiness:** "level" was predicted within 2% of the moments, but measured "level" meant under 0.5°. A real 2 mm placement error tilts the plank about 1°.
  - Now the stiffness is measured from MuJoCo: k = m·g·h from the plank subtree's mass and centre of mass, and the hinge anchor, giving 0.226 N·m/rad.
  - The tilt is predicted from the net moment, with one `LEVEL_DEG` (0.5°) threshold for both prediction and measurement.
  - A static probe matched the prediction within 0.14°.
  - Large tilts (over about 4°) are under-predicted by up to about 1° by this linear model.
- **Settling:** a slow creep under 0.015 rad/s used to count as "settled", so small tilts were read early: 0.3° measured vs 0.6° predicted. It is now under about 0.001 rad/s for 0.5 s (cap 6 s), and near-balance readings match the prediction to 0.1°.
- **e2e:** the cooperative spec now checks that both weights are within 0.3 cm of their marks, that the measured tilt is within 0.4° of the predicted tilt, and that the feedback is truthful. It no longer requires a perfect landing.
- **Checks:**
  - `pnpm check` pass (160 tests);
  - e2e 123 passed, 1 skipped by design;
  - 10-case balance bench: all completed, 0 falls, directions all match.

## 2026-10-25 · Claude Code (side session for the owner) · End-stop fix brought into PR #7 (`two-bot-real-sim`)

- Reverted `a28d829` (`d715923`). That commit loosened the Moments e2e to accept tilt when the moments said level, and recorded the wrong diagnosis. The real cause was the rail end-stop bug, fixed on `moments-floor-push` (`1b8eea1`).
- Merged `origin/moments-floor-push` (merge `e0f70f7`). The only conflict was in this changelog, where both sides' entries were kept. The two-bot code builds no `ExperimentPorts` and does not call `momentsFor`, so the new stiffness parameter needed no changes.
- Checks: `pnpm check` pass (190 tests); e2e (sandbox, two-bot-real-sim, two-bot-demo, pacing, integration): 118 passed, 3 skipped, 1 failed. The failure is `sandbox.spec.ts:54` ("Claude balances the plank"), which still expects exactly "stayed level"; a ~10.1 cm landing measured 0.6° left, as the stiffness predicts. That assertion comes from `1b8eea1` and is reported to the session fixing `moments-floor-push`.
- Fixed a flaky Stop timing in `tests/two-bot-real-sim.spec.ts`: CI run `40165539290` stopped at 27.8 cm because `expect.poll` backs off to 1 s; it now polls every 100 ms and stops at > 20.5 cm (4/4 locally). `tests/lab.spec.ts` "stop interrupts a pending exchange" failed once on mobile CI in the same run; its files are untouched by this branch and it passed on the two runs before (flake, not fixed here)..
- Merged `fb8140b` from `moments-floor-push` (merge `3819b27`): the "Claude balances the plank" spec now checks a near-balanced, truthfully reported release instead of exactly level. `pnpm check` pass. Sandbox specs: 9 passed, 1 skipped in a full run, and the balance spec passed 2/2 alone. One earlier full run failed that spec once on a boolean assertion (trace overwritten). The suspected cause is the 0.5° boundary: classification uses the unrounded angle but the report rounds to 0.1°, so 0.45–0.5° reads "level (0.5°)" and fails `reported < 0.5`. Reported to the `moments-floor-push` session.
- Merged `b09fdf0` from `moments-floor-push`: tilt is rounded to 0.1° before it is called level, in the release task, `BalanceExperiment.finish()` and `balanceSnapshot()`. `pnpm check` pass (191 tests); sandbox specs 18 passed, 2 skipped across two full runs with 2 workers.

## 2026-10-25 — Codex: sandbox glass windows and pill buttons

- On `glass-windows`, restyled Sandbox.module.css with noir/amethyst/silver tokens, smoked-glass panels, light primary pills, translucent secondary controls, 44px targets, hover lift, focus and reduced-motion/transparency fallbacks. Scope excludes simulation, voice behavior and 3D materials.
- Updated DESIGN.md and memory status/decisions/handoff/backlog. Installed the user-requested design skill locally, not included in product files.
- Checks: pnpm check passed, 147 tests; sandbox Playwright 4/4 desktop/mobile; Prettier and git diff --check passed. Production visual inspection at 1440/768/390 passed with one secondary-label-size warning; requested glass/purple/floating shadows exempted. Before/after screenshots reviewed.
- Initial checks encountered missing local Bedrock SDK and occupied port 5191. Restored frozen dependencies without lockfile changes; tested own preview on 5200 via a temporary config, removed afterward.

## 2026-10-25 — Codex: integrate landing and actual console

- Owner authorized main integration. Imported only welcome components/art/font from the existing landing worktree; preserved its local changes. All Open console actions enter `/console`; Home returns to `/`. Legacy console URLs remain.
- Removed old scripted App/scene/store and their obsolete tests. Preserved shared contracts and separate teammate demo. Changed glass tint to dark purple. Updated misleading landing AI/voice copy and public route/setup documentation.
- Added routing regression tests; saw them fail on the old root view, then pass. `pnpm check` passed (139 tests); welcome/entry/sandbox Playwright 16/16 desktop/mobile passed. Inspected production desktop/mobile screenshots: no page errors or overflow.
- Read-only code review found a stale original-root integration expectation; corrected it. Integration checks and PR CI are the remaining merge gates.

Integration follow-up: 8/8 desktop/mobile checks passed, including actual `/console` physics boot without automatic external/provider calls and the preserved teammate demo. Combined relevant browser checks: 24/24.

## 2026-10-25 — Codex: workshop and camera

Created `lab-workshop-camera` from main. Added LabCamera, camera math/tests, Workshop, camera toolbar and responsive stage spacing; extracted bubble anchoring from camera following. Workshop uses original procedural geometry and the confirmed palette, preserving MuJoCo props/colliders and both robot rigs. Added browser coverage for persistent exploration, zoom, follow/frame/reset, keyboard Space isolation, lesson switching and touch pinch/cancel. Updated DESIGN and shared memory. Validation: pnpm check (185 tests, builds/API smoke) passed; Playwright 7 passed/1 intentional skip; diff whitespace check passed. Initial interpolation-sensitive assertions corrected; review-discovered Space conflict reproduced then fixed. No paid AI calls, push or merge.

## 2026-10-25 — Codex: Botanical Studio

Applied owner-selected palette to console and rebuilt Workshop; added studioMaterials, StudioLighting, original AO maps and bake script/provenance. Bevelled box visuals retain original dimensions/science face textures; material disposal added. Added live measured-position screen, botanical furnishings and physically separate decorative detail. Updated DESIGN, design tokens, plan and shared memory. Checks: pnpm check 185 pass/builds/API smoke; relevant Playwright 7 pass/1 intentional skip. Final screenshots inspected and Moments output contrast corrected. Independent review found no significant correctness issues. Static shading is AO, not a full GI bake. No paid requests, push or merge.

## 2026-10-25 — Codex: classroom cues and Claude Code handoff

- Replaced decorative back-wall shelves/sign with a lesson-aware teaching board, diagram, chalk tray/eraser, equipment labels and learning-station marker in Workshop.tsx. Kept Botanical palette, open floor, both bots and physics/camera behavior.
- Added docs/handoffs/claude-code-classroom-redesign.md with source revisions/findings, REA reproduction workflow, taste skill, palette, file map, constraints and checks. Updated DESIGN and shared status/handoff.
- Validation: pnpm check passed: 185 tests, typecheck, web/API builds and API health smoke. Browser screenshot run exited 0; inspected Pythagoras and Moments on desktop and mobile. Moments output contrast remains rgb(243,238,227). git diff --check passed. No new behavior tests needed for decorative geometry/labels.
- Stayed on lab-workshop-camera; no push/merge. Owner will launch Claude Code on the same branch.

## 2026-10-25 — Claude Code: playground console

- Owner redirected the classroom redesign to a bright, open playground with General Intelligence Company glass. Navy and brass (picked earlier for the classroom) superseded.
- Physics: `roomProps()` returns no fixed furniture, so the court is open; the boundary wall is unchanged. `tasks.test.ts` fixed-target check now uses the Moments pivot.
- Scene: new `Playground.tsx`, `GardenFence.tsx`, `Foliage.tsx`, `Grass.tsx`, `playgroundMaterials.ts`; removed `Workshop.tsx`, `studioMaterials.ts`, `scripts/bake-workshop.mjs`, `public/workshop/`. Equipment sits outside the collider line; fence inner faces on it. Folio Foliage/Grass techniques verified in source (revision 41046b5) and reimplemented; REA 6.7.0 static analysis parsed my-room-in-3d (21 files) and folio Game sources (118 files) without failures, plus a REA screenshot of the live room from a disposable headless profile.
- Console: full-screen stage, `gic.tsx`/`gic.css` from the owner's design-system artifact, Inter via fontsource, Home link removed (`console-entry.spec.ts` now returns home through the Kestrel mark), nav moved top left, wider desktop follow framing so the lesson board stays visible.
- Performance: headless SwiftShader measured 1.0 fps full scene, 2.0 fps without the playground, unchanged by removing grass, blur or panels; machine load average ~20. Added a software-renderer low-power path (no shadows, no grass, half resolution, `?hq` override) and a 120 s file timeout to the camera spec, matching `sandbox.spec.ts`.
- Checks: `pnpm check` passed twice (185 tests, typecheck, web/API builds, API smoke). Playwright camera + console-entry: 11 passed, 1 intentional skip; sandbox spec after the final scene: 9 passed, 1 skipped. Desktop 1440×900 and iPhone 13 screenshots of Pythagoras and Moments inspected (follow, zoomed out, experiment frame). `git diff --check` clean. No paid AI calls. Not committed, pushed or merged.

## 2026-10-25 — Codex: simple Robot Rescue Navigation

- Created `rescue-navigation` from the current playground branch; preserved the newer playground and floating-panel design.
- Added one deterministic grade 6–8 mission: blocked 200 cm shortcut, clear A/B routes (280 cm), distance prediction/check, optional Nova hint, physical Pip execution, stop/retry and evidence reflection. No battery clock or AI calls.
- Shared route geometry/clearance drives validation and a fixed MuJoCo barrier. Rescue task uses existing Navigator, settles at each authored point, checks physical arrival/contact and measures trunk travel. No automatic detours or visual teleporting.
- Added mission panel/map and matching 3D route/dock markers; unrelated voice/manual controls are unavailable in rescue. Existing lessons remain available.
- Validation and final review results are recorded in current status/handoff below. Local-only skill/config folders remain untracked; no push or main merge.
- Final validation: `pnpm check` passed (192 tests); final typecheck after mobile-scroll/copy refinement passed. Final Playwright run passed 2/2 (desktop route A, touch mobile route B), including actual physical arrival, prediction invalidation, active-tab reselect regression, reflection, retry, stop and lesson exit. Screenshots inspected. First mobile run was interrupted by source-formatting HMR; clean rerun and final combined run passed. No paid requests observed. Review's stale-tab approval finding fixed. Changes left local for owner review.

## 2026-10-25 — Codex: replace rescue worksheet with spoken obstacle course

- Owner clarified player speaks directions; removed arithmetic gate, equal A/B choices and Pythagoras hint. Added three physical barriers and genuinely unequal named passages.
- Existing STT endpoint now accepts explicit learner recordings; conservative landmark parser plus typed fallback. Ambiguous and negated speech asks for clarification.
- Physical travel drains a game battery. Failure shows “Battery died!” in Pip's bubble, then resets after 2.5 simulation seconds. Shorter path succeeds through physical arrival checks.
- Reviewer caught stale recordings surviving reset and curly-apostrophe negation. Added reset version guard/media cancellation and apostrophe normalization, with regressions. Bubble positioning clamped to scene bounds.
- Live provider requests were mocked in browser verification; real MuJoCo navigation, battery exhaustion, auto-reset and arrival were exercised. No paid model/voice calls made.
- Final verification: `pnpm check` passed (193 tests, typecheck, web/API builds and health smoke). Desktop/mobile end-to-end voice-course tests passed (2/2), including delayed transcript rejected after reset, long-route battery death, automatic reset, shorter-route physical success and lesson exit. Additional desktop pass verified the visibly anchored death bubble using a physics-paused screenshot, then resumed and verified reset/success. Removed the stray reset-reason bubble and hid bubbles until anchored. Screenshot inspected. No push/merge; changes remain local.


## 2026-10-25 — Zigzag rescue refinement

Researched Blockly maze source and Bebras robot-path excerpts. Replaced two passage choices with staggered walls and ordered blue/orange/mint checkpoints. All six orders clear geometry; only efficient 7.6 m order fits 9 m battery (closest wrong order 9.3 m). Replaced underlined disclosure with keyboard button and focused multiline form. Browser tests passed: desktop physical death/reset/success (2 min), mobile typing smoke (24.6 sec). Screenshots checked; corrected positive charge rounding and outdated passage copy, allowed stop-at speech. pnpm check passed before final copy/parser refinement; final validation recorded below.

Final validation after parser/copy/charge-display refinements: pnpm check passed (193 tests / 23 files, typecheck, web/API builds, API health smoke). git diff --check clean. Browser physics checks preceded only these small refinements; no physics geometry or battery threshold changed afterward.


## 2026-10-25 — Four-path network

Owner corrected the puzzle topology: changed zigzag into four distinct directed paths matching supplied diagram. Added shared graph, adjacency schema/parser, visible floor paths/arrows and SVG map with distance labels. Shortest 3.096 m; other paths 4.970, 5.320, 5.959 m; game budget 4.2 m. Unit geometry check caught a supply-island clearance overlap; relocated islands before browser validation. No commits or main changes.

Validation complete: pnpm check passed (194 tests / 23 files, typecheck, web/API builds and health smoke). Desktop browser verified real-physics shortest success and next-shortest failure/reset with mocked STT; mobile entry/focus/stop/reset and overflow checks passed. Inspected desktop/mobile screenshots, enlarged 3D checkpoint letters, then reran mobile browser smoke and typecheck successfully. git diff --check clean. Remains local on rescue-navigation.


2026-10-25: Created four preview-only duck material colorways in docs/previews/duck-colorways using actual rigs and simplified playground-colored stage. Production materials unchanged. Await user selection before applying. See README for exact colors and mapping scope.


2026-10-25: Owner selected dark grey and navy. Applied Pip #454B54 and Nova #244267 to sandbox shell/foot accents, with neutral #E4E6E5 panels; crew dots match. Existing non-tinted rig materials remain unchanged. Typecheck passed. Selected material render in docs/previews/duck-colorways/selected. Still rescue-navigation, no main push.


2026-10-25: Added white lower-head trim (jaw/bottom head shell) to the selected charcoal/navy rigs. Increased NAV cruise .55→.65, approach .30→.35, spin 3→3.6, near spin 1.8→2.1. New scripts/bench/speed-bench.mjs compares six real MuJoCo/ONNX runs per preset: baseline 6/6, mean 5.2 s, 2.5 cm error, 0 falls; faster 6/6, mean 4.2 s, 2.4 cm error, 0 falls. Manual forward now .65, reverse -.4 (outside dead zone), pivot 3.6; moving turns use .35 forward and 1.2 yaw. Physics timestep and simulation clock unchanged. Final rescue/check results recorded below.

Final verification: pnpm check passed (194 tests, typecheck, builds, API health smoke); desktop real-physics rescue test passed with faster rates (shortest arrival, longer-route battery death, reset, stale transcription guard). White head trim inspected in native rig render. git diff --check clean. No main push.


2026-10-25: Reproduced owner command “go to B then E then H” returning null with a failing regression. Parser unnecessarily required speaking A despite Pip already starting there. Parser now prepends only known origin A; it never fills missing intermediate nodes. Updated input guidance and browser voice/typed test phrases to omit A. Invalid skips (B→H, C→E→H), negatives and missing junctions remain rejected; task live-pose origin guard remains intact.

Omitted-start fix verified: regression failed before fix, then pnpm check passed (195 tests, typecheck, builds/health smoke). Desktop real-physics browser passed with A omitted in mocked voice transcript and exact typed “go to B then E then H”; Pip physically reached charger. No live STT provider call made. git diff --check clean.

## 2026-10-25 · Claude Code · rescue-main: robot sound, objectives with XP, console windows

- Made rescue-navigation the base (`ba2ccc7`, `-s ours` merge of main). `8d8041c`: robot sound instead of TTS (`agentSession.say`), one-sentence prompt, `normalizeTask` in `apps/api/src/agent.ts` (+6 tests).
- `55bef60`: `sandbox/objectives.ts` (+5 tests), `ObjectivesBoard.tsx`, right rail in `Sandbox.module.css`, wiring in `SandboxApp.tsx`.
- `c4b9914`: `ConsolePane.tsx`, `crewChannel.ts` (+3 tests), You and Pip / Pip and Nova accordion (`kestrel.console.window` in localStorage).
- Live checks (browser, real MuJoCo, 5212): Balance the beam tipped the plank 5.8° left; the experiment with 200 g at 10 cm (and again at 15 cm with 100 g at 30 cm) read level at 0.4° and filled the bar to 100 XP. The crew window showed Pip's handoff, each robot's measured move and the joint result, with an unread count while closed. A live Claude turn on 5220 walked Pip 20 cm, played the robot clip twice and made no `/voice/speak` call.
- Checks: `pnpm check` passed (typecheck, unit tests, builds, API health smoke).
- `b0ea98b`: `runTask` emits a `plan` event for set_balance and build_squares; the Pip and Nova window uses it for Pip's handoff. Polling `status().task` missed build_squares because each robot's own push masks the crew task.
- Local desktop e2e on the dev server: sandbox, console-entry and integration passed (11). The rescue spec timed out once while `duckSim.ts` hot-reloaded mid-run, then passed alone (5.8 min).

## 2026-10-25 · Claude Code · Polish, confetti, pixel bubbles, Pip vs Nova fight (`4cdc4ca`, rescue-main)

- Console: a collapsed Controls pill (`kestrel.controls.open`), "Your Kestrel", the provider note removed (the mic disclosure is now the Hold-to-talk tooltip), and a speaker/mute icon for robot sound.
- `Confetti.tsx` (canvas, no dependency) fires on every objective win. The bubble is pixel art (`@fontsource/pixelify-sans` 500).
- Fight: `fight.ts` (+3 tests) holds the face/charge/recoil controller and `isClash`; `Explosion.tsx` and `sfx.ts` (a Web Audio boom) handle the effects; `DuckSim.knock` is the scripted shove for the random loser.
- Measured live in a visible browser: charges close at 0.6–0.76 m/s over 300 ms. A 50 ms two-sample rule fired 17 false clashes in 36 s from gait sway, so the rule now uses a 300 ms window and one clash per approach. After that: 9 clashes in 40 s, each knocking exactly one robot over, Pip 5 to Nova 4, and every robot got back up.
- `e5ba375`: the lesson card folds to its title row (`kestrel.lesson.open`). Then the Kestrel eyes logo replaced the bird in the console nav (`KestrelLogo.tsx`, reusing `/welcome/fonts/grandstander-latin-900.woff2`), and the CI job limit went 12 → 25 min. PR #21's first CI run was cancelled at the 12-minute limit, not by a failing test.
- Verified headlessly: a beam win fired confetti (374 painted samples 1.8 s after XP hit 100); a close-up of the pixel bubble; the logo nav. E2E: sandbox, console-entry and integration passed. One Moments run failed while a source edit hot-reloaded the page; it passed on rerun.

## 2026-10-25 · Claude Code · Landing hero rebuilt in GIC style (branch `landing-redesign`)

- `apps/web/src/welcome/WelcomePage.tsx` and `.module.css` replaced: one 1440×1280 frame scaled by `--u = 100vw/1440`; one still plate (`LANDING.plate`, placeholder `public/landing/hero.jpg`; now the owner's Midjourney art: `hero-wide.jpg` 16:9 for desktop, `hero.jpg` 9:8 for phones) with an optional aligned loop (`LANDING.video`, null for now); Grandstander kicker and two-line headline; GIC solid and glass pills; three objective cards linking to `/console`; one Web Animations entrance timeline, cancelled under reduced motion; phone layout at ≤820px. Removed the old balance demo, FAQ, companion picker and `welcome/arc/`.
- Tests: `tests/welcome.spec.ts` rewritten for the new hero (the old content is gone); `console-entry.spec.ts` heading updated. Both specs passed on desktop and mobile (10/10) against a dev server.
- To swap art: replace `public/landing/hero.jpg` (2160×1920 fills the frame exactly) and the card paths in `LANDING`.

## 2026-10-25 · Claude Code · Landing redesign folded into PR #21

- Merged `landing-redesign` (PR #22) into `rescue-main` (`f8afb2e`); the only conflict was this changelog, and both entries are kept. `tests/integration.spec.ts` still expected the old landing heading, so it now expects "Real robots.Real physics.".
- Checks: `pnpm check` passed (212 tests, builds, API smoke). welcome, console-entry and integration e2e passed on desktop and mobile (18).

## 2026-10-25 · Claude Code · CI budget for rescue-main (PR #21)

- CI on #21 failed 2 of 144 on timing: the rescue route never reached "Battery died!" in 170 s, and the camera spec ran out of its 120 s budget. Main's `e13e51d` (lighter low-power scene, camera budget 300 s) had been dropped when rescue's tree replaced main's, so it is cherry-picked back (`1578f95`).
- Rescue spec: each route gets 480 s, the respawn 120 s, and the test 20 min. The CI job limit is now 40 min.

## 2026-10-25 · Claude Code · Tiger Data learner progress (branch `tiger-data-progress`)

- Contracts `progress.ts`; API `progress.ts` (`pg` 8.23.1, `attempts` hypertable on `at`, `POST /api/progress`, `GET /api/progress/:learner`, 503 without `TIGER_DATABASE_URL`, driver errors hidden); `/api/health` gains `capabilities.progress`. Web `progress.ts`: anonymous learner ID, localStorage fallback, silent failures; `SandboxApp` loads earned objectives on mount and logs wins with beam tilt and weight positions.
- Tests: `apps/api/src/progress.test.ts`, `apps/web/src/sandbox/progress.test.ts` (database and fetch mocked). `pnpm check` passed (29 files, 221 tests, builds, API smoke). Not yet verified against a real Tiger Data service.

## 2026-10-25 · Claude Code · Tiger Data verified for real

- Ran `connectProgress` + `buildApp` against the owner's Tiger Cloud service (one-off script, URL never printed). Hypertable `attempts` created with a time dimension on `at`; 3 POSTs → 201; GET → `{"earned":["balance-beam","rescue-pip"],"attempts":{"balance-beam":2,"rescue-pip":1}}`; rows read back with the measured tilt and cm values.
- The strict TLS check failed first with `SELF_SIGNED_CERT_IN_CHAIN` (the new service's temporary certificate from `ca.timescale.com`). The fallback behaved as designed: one log line with the code only, and no crash. The verification run used `uselibpqcompat=true&sslmode=require` for that command only; `.env` and the code are unchanged.

- 14:27 UTC recheck: the certificate is now issued by Google Trust Services; the same check passes with the unmodified `.env` URL (strict TLS), `health.progress = true`.

## 2026-10-25 · Claude Code · Tiger Data progress verified in the browser

- Console on 5180 (API 5181 restarted via `tsx watch` so it loaded `TIGER_DATABASE_URL`; health `progress: true`). Balance the beam: 200 g at 10 cm, 100 g at 20 cm, run with both robots; won in about 12 s ("1 / 3 done"). The browser sent `POST /api/progress` (201), and Tiger stored `balance-beam ok=true tilt_deg=0.2 left_cm=10 right_cm=20`.
- Removed the localStorage `earned` copy (kept the learner ID) and reloaded: `GET /api/progress/:learner` (200) restored Balance the beam as done on the board, so progress came back from the database alone.

- CI then failed 3 of 142 on timing. (1) The rescue death bubble expired (12 s of real time) before the test's next check on the slow runner. The rescue result bubble is now sticky until the next reset or run, which is also better for kids. (2) Two Moments tests gave the lesson switch 5 s; that wait is now 30 s, since the switch waits on the physics loop.
- CI on `399d396` was 137 passed, 1 failed: the rescue spec's bubble-position poll. The CI trace shows the bubble correctly positioned (`transform: translate(741.5px, 467.8px)…`); the poll's first read had not returned within the 5 s default. The rescue spec now gives every default wait 30 s (`expect.configure`).

## 2026-10-25 · Claude Code · Judges deck and loop (branch `judges-deck`)

- Added `docs/judges/`: `kestrel-judges.pptx` (11 slides with speaker notes), `loop.html` (7 scenes, 8 s each, 12 s under reduced motion, wake lock, 6-hour self-reload, click or F for full screen), `assets/` (landing art and real console screenshots), `build/render-art.mjs` (glass plates and the mark via Playwright), `build/build-deck.cjs` (pptxgenjs) and `README.md`. Both pieces use the GIC design system with Kestrel's own mark; the purple Pip concept portrait is deliberately not used (owner's request).
- Checks: the deck validates (pptx skill `validate.py`) and was rendered through PowerPoint to PDF and inspected slide by slide. The loop was screenshotted per scene at 1920×1080 in headless Chromium, and a timed run showed scenes 0→1→2…→6→0 with no console errors.

## 2026-10-25 · Claude Code · README rewritten for Devpost judges

- Rewrote `README.md` against the code on `main` at `9f0e56e` (rescue-main, landing redesign, Tiger Data progress, deploy guide and judges kit merged) (objectives/XP and the collapsible You and Pip / Pip and Nova windows included). It now covers two robots, GIC light glass over the playground, the chirp with one-sentence bubbles (no text-to-speech), Rescue/Pythagoras/Moments/Free play, a no-keys demo path, named idealisations and credits. It flags the reply sound's unrecorded provenance and the mesh licence caution.
- Hero image: the owner's console screenshot (Robot rescue, Objectives board), added as `docs/images/kestrel-console.webp`. No Team section, per the owner.
- Rebased on `main` `9f0e56e` and updated: progress survives reloads (localStorage, optional Tiger Data), `TIGER_DATABASE_URL`, the deploy guide, landing credits (Arc UI and the balance toy are gone; Midjourney hero art, real console cards), `docs/judges/` and `deploy/` in the repo map.
- Added "Pip vs Nova, just for fun" from `4cdc4ca`/`aa81e1d`: the Free play fight, its clash rule, the live 9-clashes-in-40-s check, and the scripted-shove, random-loser idealisation. Demo path step 4, Free play row, confetti and Pixelify Sans credit.
- Removed stale claims: purple/noir glass, spoken ElevenLabs replies, "one Microduck", the separate `/sandbox.html` section and "two-robot physics on other branches".
- Measured on this branch (headless SwiftShader, fast-stepped, web dev server on port 5230): `coop-bench.mjs` 5/5 balance runs, 0 falls, weights within 0.2 cm, predicted side = measured side every time, 10.6–12.3 s; `speed-bench.mjs` faster preset 6/6, mean 4.2 s, 2.4 cm mean error, 0 falls.
- Checks: `pnpm exec prettier --check README.md` pass; every relative link and backticked path resolves; README commands match `package.json`; `pnpm test` 209/209. No paid calls. Committed locally only; not pushed.
- Stale docs reported to the owner, not edited: `PRODUCT.md` scaffold scope, `docs/ARCHITECTURE.md` provider, `THIRD_PARTY.md` (Microduck assets, fonts).
