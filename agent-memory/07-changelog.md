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

## 2026-10-24 · Cursor · Grid route replaces Seek

- `route` in `grid.ts` plans 0.25 m cells from the duck to the stand point behind a body. `push` and `go_to` walk that list and replan if a cell stalls. Claude still only names the object and the destination.
- The half-second arc search (`chooseDrive`) is no longer used.
- Checks: `tasks.test.ts` and `walkScale.test.ts`, 13 passed. Live sandbox, walk 1× and radius 0.25 m: a push of square-5 closed from about 1.48 m to 0.57 m in 12 s without a lap. The square was not in its slot yet. The lab was reset afterward.

## 2026-10-24 · Cursor · Grid route replaces Seek

- `route` in `grid.ts` plans 0.25 m cells from the duck to the stand point behind a body. `push` and `go_to` walk that list and replan if a cell stalls. Seek is no longer used.
- Live sandbox, sliders at 1× and 0.25 m: pushing square-5, the gap fell 1.48 m → 0.57 m over 12 s. Heading stayed on the approach. The square was not in its slot yet; the trial was stopped there.
- Checks: `tasks.test.ts` and `walkScale.test.ts`, 13 passed.

## 2026-10-24 · Cursor · Seek replaces the fixed push line

- `chooseDrive` in `tasks.ts` is the mover for `go_to` and `push`. It samples short arcs, drops any that enter a prop or the walls, and keeps the one that ends closest to the goal. A stalled approach flips to the other side of the body. Sliders bound speed and the tightest arc. They no longer rewrite a task's turn into a fixed circle.
- `apps/web/src/sandbox/course.ts` is a list. Lesson 1 holds the 3-4-5 quiz flips and the student mission. The popup is not wired up.
- Checks: `tasks.test.ts`, `course.test.ts`, `walkScale.test.ts` — 14 passed. A kinematic run from the spawn gets closer to square-5. No live policy demo this session.

## 2026-10-24 · Cursor · Turn radius slider

- Added a Turn radius slider (0.15–0.60 m, default 0.25 m) under Walk speed. `applyTurnRadius` sets yaw from forward speed ÷ radius for keyboard and tasks. Straight lines are unchanged. Yaw is capped at 2 rad/s.
- Files: `apps/web/src/simulation/constants.ts`, `duckSim.ts`, `walkScale.test.ts`, `apps/web/src/sandbox/SandboxApp.tsx`.
- Checks: `walkScale.test.ts` 4/4. Live sandbox: the slider label reads `0.60 m` and writes `sim.turnRadius`. A 2.5 s walking turn measured about 0.39 m at the 0.60 m setting and about 0.15 m at 0.25 m. Mode stayed `walk`.

## 2026-10-24 · Cursor · Walk speed slider

- Added a Walk speed slider (1×–2×) on the sandbox console. `applyWalkScale` multiplies forward speed only; turning stays at the trained rate. Keyboard and Claude tasks both go through it.
- Files: `apps/web/src/simulation/constants.ts`, `duckSim.ts`, `walkScale.test.ts`, `apps/web/src/sandbox/SandboxApp.tsx`, `Sandbox.module.css`.
- Checks: `walkScale.test.ts` 2/2. Live sandbox: slider shows `2.00× · 0.50 m/s`; 1.6 s forward covered 37 cm at 2× and 11 cm at 1×, mode stayed `walk`.

## 2026-10-25 · Cursor · Removed the stub from the sandbox

- The balance-beam Pip and Nova drawing was taken off `/sandbox.html`. DESIGN.md keeps the crew in the 3D room. The stub remains only at `/?demo=two-bot`.

## 2026-10-25 · Cursor · Two-bot conversation on the sandbox page

- `/sandbox.html` scrolls to a Pip and Nova section under the 3D lab. It is the same demo that `/?demo=two-bot` opens alone. The balance beam is still the stub, and the mock provider is still scripted. The header link "Pip and Nova" jumps to that section.
- Checks: not the full e2e suite. The standalone demo URL is unchanged.

## 2026-10-25 · Cursor · Push controller restored again

- `tasks.ts` matches commit `b5d6dea` again. The flank approach and the task speed rewrite are off the push. Keyboard sliders still affect keyboard holds only.
- Checks: `tasks.test.ts` and `walkScale.test.ts`.

## 2026-10-24 · Cursor · Approach goes behind the square before pushing

- A live push of the 9-square at 1× walked into the tile and slid it sideways (67 cm from the slot down to 55 cm in 48 s, never placed). The approach now steps to the side when the stand-behind point is through the square, and it does not start the push until the duck is actually behind it.
- Checks: `tasks.test.ts`, 8 passed. Includes a kinematic run that stays outside the square.

## 2026-10-24 · Cursor · Push keeps its lining-up speed at 1×

- Forcing every task command to the slider's flat m/s made the approach walk through the square, so placements missed. `applyTaskDrive` now multiplies the controller's own command. At 1× and 0.25 m the push is unchanged. At 2× the same command is twice as fast, and a wider radius scales the yaw down.
- Keyboard holds still use the slider speed and radius directly.
- Checks: `walkScale.test.ts`.

## 2026-10-24 · Cursor · Sliders drive tasks as well as the keyboard

- `applyDrive` makes any forward command the slider speed (0.25–0.50 m/s) and a full turn the slider radius (0.15–0.60 m). Keyboard and Claude tasks both go through it. A partial yaw stays a fraction of that turn so a small aim correction is wider than the slider arc. At 0.50 m/s, yaw is capped at 2 rad/s, so the tightest arc is 0.25 m.
- Checks: `walkScale.test.ts`.

## 2026-10-24 · Cursor · Floor check before the duck finishes

- A square that was in its slot and is then knocked out is listed on the next tool result as `outOfSlot`. The session will not run a different push, and will not accept a closing summary, until that square is pushed back or the 6-action budget is used. The prompt tells Claude the same rule.
- Voice defaults to off. The bubble and the chat are the reply. Speech still runs only when Voice is on.
- Checks: `agentSession.test.ts` and `tasks.test.ts`, 13 passed.

## 2026-10-24 · Cursor · Restored the push that placed the squares

- `tasks.ts` matches commit `b5d6dea` again. Push is beside, behind, face the outline, then walk in. Done at 4 cm. `grid.ts` and Seek are gone.
- Keyboard sliders still scale manual driving only. A running push is not passed through the turn-radius rewrite.
- Checks: `tasks.test.ts` and `walkScale.test.ts`, 11 passed.

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

## 2026-10-25 · Cursor · Pip and Nova in a larger room

- The sandbox room is 5.2 m across (`ROOM_HALF` 2.6). The camera frames that floor. Furniture sits near the walls.
- Pythagoras tiles stay 0.12 m, 0.16 m and 0.20 m. Slot centers and the triangle outline are 3× farther from the right angle, and each tile starts 0.55 m past its slot edge.
- Pip (teal) is still the physics duck. Nova (coral) is a second rig in the room: she faces the lesson, turns her head, and shifts. She is not a MuJoCo body.
- Files: `apps/web/src/simulation/constants.ts`, `apps/web/src/sandbox/SandboxScene.tsx`, `packages/contracts/src/lab.ts`, `packages/contracts/src/lab.test.ts`.
- Checks: `lab.test.ts`, `tasks.test.ts`, `walkScale.test.ts`, 17 passed. Live sandbox at 50 Hz: both name plates visible, squares at their spread starts, room walls in frame.

## 2026-10-25 · Cursor · Slots sit on the larger triangle

- The triangle stays enlarged. Each slot is the tile's own size again and its inner edge lies on the matching side. The loose tiles start just outside those slots.
- Files: `packages/contracts/src/lab.ts`, `packages/contracts/src/lab.test.ts`.
- Checks: `lab.test.ts` and `tasks.test.ts`, 13 passed. Live sandbox: the three slot marks sit on the triangle sides.

## 2026-10-25 · Cursor · Squares match the triangle sides

- Each Pythagoras tile and its slot now has the same length as the side it sits on. The 3× enlargement applies to the triangle and the squares together: 0.36 m, 0.48 m and 0.60 m. The grids stay 9, 16 and 25.
- Files: `packages/contracts/src/lab.ts`, `packages/contracts/src/lab.test.ts`.
- Checks: `lab.test.ts` and `tasks.test.ts`, 13 passed. Live sandbox: the slot marks and the tiles match the three sides.

## 2026-10-25 · Codex · Stabilize sequential Pythagoras pushes

- Pushes now stop at the shared 20%-of-slot-side tolerance, re-align if Pip drifts off the push line, and use bounded MuJoCo centerline forces. After a square lands, Pip follows a forward obstacle-cleared retreat. During later pushes, bounded spring-damper forces hold tiles near their slots to prevent corner collisions from knocking them out.
- Pythagoras spawn begins clear of the loose 3×3. The 3-4-5 square dimensions are unchanged. Box mass/size was not increased.
- Full live typed Claude check passed once in 203 seconds with no browser errors: center errors 0.20 cm (3×3), 0.04 cm (4×4), 3.33 cm (5×5); tolerances 7.2, 9.6 and 12 cm. Earlier full runs failed, so repeatability remains unverified.
- `pnpm check` passed: typecheck, 162 tests, web/API builds, and compiled API health smoke. Node 22.23.1 emits the repo's Node 24 engine warning.
- Files changed: `apps/web/src/simulation/tasks.ts`, `duckSim.ts`, `tasks.test.ts`, `packages/contracts/src/lab.ts`, `lab.test.ts`, `apps/api/src/agent.ts`, `scripts/live-pythagoras-check.mjs`, `README.md`, `agent-memory/03-codebase-map.md`, `04-status.md`, `06-handoff.md`, `07-changelog.md`, `08-current-scope.md`, `10-voice-agent-design.md`, `11-remaining-steps.md`.

### Repeatability check: 4x4 stall (2026-10-25)

- The next full typed Claude/MuJoCo check did not pass. 3x3 stayed within its slot; 4x4 moved 27 cm then stalled 19 cm short. Claude retried the push, and the run was stopped for diagnosis.
- The earlier successful run is not repeatable yet. Diagnose the 4x4 close-in push failure before more full-board runs.

### Handoff review and main server restart (2026-10-25)

- Confirmed the local as-kestrel source tree is at e4c5d87, matching fetched origin/main; preserved agent-memory during refresh and pushed nothing.
- Restarted pnpm dev (session 5898). Browser loaded /console and verified both Pip and Nova initialize; local routes and API health returned HTTP 200.
- Reconciled actual code with root handoff-kestrel.md; root README contains older conflicting capability claims. Updated status and handoff to record the two-lesson quiz/book, concise-output, beep-bop and skill-indicator roadmap. No application source changed.
### Finalized lesson, recipient and output requirements (2026-10-25)

- Pythagoras definition requests should yield one concise definition, a coordinated demo, and one measured conclusion; suppress per-square narration.
- Add selectable recipients Pip, Nova or Both, with safe concurrent group tasks and one shared measured outcome.
- Finalized book and quiz overlays for Pythagoras and Moments; beep-bop output option; skill-tray indicators with no skill narration.
- Background and level-design changes remain excluded. No application source changed.

### Lesson-book-to-quiz flow clarified (2026-10-25)

- Asking about the current lesson/level briefly introduces it and opens the book; finishing the pages leads into a mixed maths/physics quiz. Saying quiz me opens the selected lesson quiz directly.
- Recorded exact one-definition / quiet coordinated demonstration / one measured conclusion behavior and Pip, Nova or Both recipient targeting.
- No application source changed.

### Lesson flow, recipients and reply sound implemented locally (2026-10-25)

- Pulled main baseline remains `e4c5d87`; no push. Preserved the owner handoff and agent-memory folder.
- Added broad introductory lesson-book and quiz agent tools, concise Bedrock guidance, Pip/Nova/Both contracts, and shared build/balance routing.
- Added lesson content/live graphs and book/quiz overlays. Sequence is intro → book → coordinated demo → measured conclusion → quiz → follow-up; quiz me opens the selected quiz directly.
- Added hold-to-talk/Space wiring through the existing ElevenLabs STT route, recipient targeting, skill tray-only output, concise agent display, and optional local beep-bop sound.
- Installed owner MP3 at `apps/web/public/audio/bd1-reply.mp3`.
- `pnpm typecheck` passed; `git diff --check` clean. Dev server restarted (`pnpm dev`, session 22399). Fresh browser initialization and live provider/speech flow have not been retested; prior hot reload logged MuJoCo binding errors. No tests or paid provider calls were run.

### Robot sound timing and browser playback fix (2026-10-25)

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

## 2026-10-25 — Claude Code: crew windows and main merge

- New branch `crew-windows` in a separate worktree (the main checkout holds Codex's in-flight `rescue-navigation`). Merged `origin/main` (merge commit); resolved `SandboxApp.tsx` from main's logic plus the playground layout, and `Sandbox.module.css` from the playground stylesheet plus main's picker/overlay/progress scopes.
- Teammate rail: `ChannelPanel` gained opt-in accordion props; console shows Log / You and Pip / Pip and Nova as one-open-at-a-time glass windows with unread counts, persisted choice, auto-open on robot talk, Ask/Stop in the robots' header. Demo markup unchanged. Progress (XP, challenges, Workshop) moved to the lesson card.
- Checks: `pnpm check` 316 tests, typecheck, builds, API smoke. Visual: desktop and iPhone 13 after Ask Nova and after unfolding the learner thread. Playwright results recorded below.

- Replaced late-created HTMLAudio playback with a reusable Web Audio context/buffer primed during the user's mic, text-submit or demo-button gesture to address autoplay blocking. Playback failures now log instead of disappearing silently.
- First concise reply sound is awaited before the lesson book opens. A second sound starts alongside the coordinated robot action; measured demo conclusion and quiz score are silent, giving the learning flow two sound cues.
- `pnpm typecheck` passes. Console and MP3 return HTTP 200. Audible browser playback and fresh MuJoCo boot remain unverified; no live provider calls or browser tests were run.

### Preserve settled squares during coordinated demo (2026-10-25)

- Latest measured full run showed the final 3x3 push knocked the previously placed squares out: only 1/3 remained in slots after settling, despite each task's near-target summary. Quiz stayed gated and did not open.
- Added a capped spring-damper force toward the slot for already-seated squares while other squares are pushed; active push targets are excluded. This uses applied physics force rather than teleporting positions.
- pnpm typecheck passes. Live port 5180 responds HTTP 200. The new fixture has not yet been validated in a full physical/browser demo; repeatability and end-to-end spoken flow remain unverified.

### ElevenLabs 400 diagnostics (2026-10-25)

- Clarified that robot beep-bop playback uses the local MP3; ElevenLabs is called by microphone transcription. The visible 400 therefore came from /api/voice/transcribe (unless another caller is added), and the PowerShell message was simply pasted as a command.
- API now parses and surfaces ElevenLabs' bounded validation message for provider failures without logging or returning credentials. pnpm typecheck passes.

- Live retry: POSTed local beep-bop MP3 to /api/voice/transcribe; ElevenLabs returned HTTP 200 and an empty transcript as expected for non-speech. Confirms credentials + MP3 request path. Browser microphone capture/WebM request remains to be retested.

## 2026-10-25 — Claude Code: fold Rayyan's #15 and #17 into the playground console

- Branch `fold-in-rayyan` from `lab-workshop-camera`; merged `feat/3d-looks` (#17, which already contains #15). Conflicts in `SandboxApp.tsx` and `SandboxScene.tsx` resolved by keeping the playground layout and applying his edits; `route()` and `selectBot()` verified identical to his branch.
- #15: typed unaddressed lines go to the selected robot's agent; only "move this/it" asks which weight; only spoken turns can be redirected by tapping the other robot. This fixes the sandbox/real-console failures on main.
- #17: Workshop looks (shell colour, antenna, party hat, backpack) on the 3D robots via `cosmetics/rig3d.ts`; console Workshop offers only what the robots can show.
- Workshop dialog portals to `<body>`; the console now marks `body.gic-console` while mounted so the dialog wears GIC glass, tags and solid selection above the floating panels. Demo page unaffected.
- Camera spec budget 120 s → 180 s: CI's software WebGL ran past 120 s at the last click on #16.
- Checks: `pnpm check` 316 tests, typecheck, builds, API smoke. Workshop and looks checked in screenshots (Pip sky shell applied on the 3D rig).

## 2026-10-25 — Claude Code: lighter low-power scene for CI

- #14's CI (19.2 min vs 8.7–9.4 min on Rayyan's branches) failed the camera spec at 180 s and a 5 s Moments wait. The CI trace showed every Playwright action taking 3–20 s: the page was saturated on the runner's software WebGL.
- Low-power mode (software GL) now draws `SimpleCanopies` (one solid low-poly ball per canopy, one draw call) instead of alpha-cut leaf cards, and skips clouds and rose foliage. On this Mac's many-core SwiftShader the frame rate was unchanged (≈2 fps either way), so the CI gain is expected, not measured locally.
- Camera spec budget 180 s → 300 s; the sequence reached its last click at 172 s on CI.
- `sandbox.spec` natural text still fails on main, #15 and #17 alike (#13's agent session no longer logs the pre-action line); not addressed here.

## 2026-10-25 — Claude Code: Pip ignored commands; stray blur

- **Pip ignored commands.** Claude often answers "walk forward 20 cm" with `duck_task {kind: "move", meters: 0.2, direction: "forward"}`. The advertised tool schema allows `direction`, but the strict `move` schema does not, so `AgentResponseSchema` threw and every such turn failed as "Claude or speech request failed". `apps/api/src/agent.ts` now normalises tool input per task kind (`normalizeTask`): a backward/right direction becomes the sign of meters/degrees, unused fields are dropped, a sideways walk still fails visibly. Verified by replaying the captured failing request against live Bedrock: now returns `{kind: "move", meters: 0.2}`. Unit tests in `agent.test.ts`.
- **Natural-text e2e.** #13 intentionally removed pre-action narration ("For a simple action request, do it with no pre-action narration"). The test still expected "I'll walk forward"; it now expects only the measured conclusion. (An earlier attempt to restore narration was reverted: it contradicted #13.)
- **Whole console blurred.** The Workshop backdrop rule (`div[data-state][class*="overlay"]`) also matched the always-on capsule overlay (`data-testid="capsule"`). It now matches only the Workshop dialog's preceding sibling. Verified: no full-screen blur at rest; only the Workshop backdrop blurs when open.
- **Camera spec on CI.** Main's run failed the drag-to-pan check: `expect.poll` waited the default 5 s for `data-camera-target`, which updates once per rendered frame, and CI's software WebGL renders seconds apart. The three frame-driven polls now allow 30 s.

