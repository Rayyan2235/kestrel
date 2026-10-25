# Status

_Last updated: 2026-10-24 by Claude Code. The Moments sections reflect branch `moments-floor-push` (on top of `4154acf`); the rest is unchanged from earlier sessions._

## Implemented

### Scripted preview (`/`, unchanged)

Isometric room, Pip and Nova placeholders, the analytic balance, the typed grammar, the two-turn scripted exchange, stop/reset. The header now links to the sandbox.

### Lab sandbox (`/sandbox.html`, new)

- **Physics and policies.** Real Microduck physics: MuJoCo 3.11 WASM stepping the upstream MJCF, with 7 upstream ONNX policies at **50 Hz** (verified headless): walk, sit/stand, get-up, kick L/R, roll and peck. Fall recovery uses the get-up policy, and the duck respawns if it fails.
- **Controls.** Keyboard: WASD or arrows, Q/E kick, R sit/stand, F peck, T roll, Esc stops the task. There are also console buttons and a reset.
- **Lessons.** Maths · Pythagorean theorem (3×3, 4×4 and 5×5 grid tiles, a floor triangle and slots that light up), Physics · Moments (a beam balance: a locked plank on a pivot, with a 200 g and a 100 g weight on rails that the duck pushes; see below), and Free play. The court has no fixed furniture (removed 2026-10-25 so the robots have the whole floor); the boundary wall remains.
- **Typed tasks.** These go through `parseDuckTask` → `DuckTaskSchema` → `TaskRunner` and report measured results in the log.
- **Bubble.** A reply bubble sits next to the duck, and the log keeps history.

### Two-bot conversation demo (`/?demo=two-bot`, new, on `feat/two-bot-demo`)

A temporary demo of two robots talking to each other and to the learner. By default it runs on a **stub simulation** (`simulation/fake/`) and a **scripted mock provider**; nothing calls a model, uses a key, the network or MuJoCo. Fast commands are labelled `built-in`, mock replies `mock`, fixed fallbacks `scripted`. One bubble shows in the room at a time (paced by `presentation/`), with Pause/Resume and a 0.5x speed; the side rail shows everything.

**Real sim (`/?demo=two-bot&sim=mujoco`, branch `two-bot-real-sim`, stacked on `two-duck-lab`):** the same demo drives the real MuJoCo Microducks through `simulation/real/`. Verified 2026-10-25 by `tests/two-bot-real-sim.spec.ts` (desktop, SwiftShader): "move the left weight to 10 cm" made Pip physically push the 200 g weight (paddle contact in the contact ledger, no Nova contact); the rail showed "Moved the 200 g weight from 20 cm to 10.1 cm (asked for 10 cm)." and the readout "Left 10.1 cm · Right 20 cm", equal to the sim's measured rail. Stop mid-push left Nova's weight clamped where it stood. Known limits: the 2D beam's tilt is still the analytic ideal beam from measured positions (the plank stays locked; no release step in the demo); the fast-path reply text is written before the push, so on a failed push it is followed by a correcting notice; mock replies never carry actions, so only typed commands move weights.

**Live Claude (`&provider=live`, 2026-10-25):** `provider/live.ts` calls `POST /api/two-bot/respond` (Bedrock, server-side only) and returns the same `Respond`, labelled `live`; on any API or contract failure the mock answers, labelled `mock`. Used only when asked for and `/api/health` reports `liveAi`. Live check (`scripts/two-bot-live-check.mjs`, real sim): "Please ask Nova to move the right weight to 25 cm." → Pip (live) handed off to Nova → Nova (live) moved its weight → measured "Moved the 100 g weight from 20 cm to 24.9 cm (asked for 25 cm)." (110 paddle contact samples, peak 11.1 N) → Nova's live handback asked for a prediction. 15.7 s end to end. Nova's reply is worded as future tense though the push has already landed when it shows.

## Not integrated (do not claim)

- **Voice:** there's no microphone capture, STT or TTS anywhere in the app. ElevenLabs has only had its key checked.
- **Claude in the app:** the sandbox text box is the fixed `parseDuckTask` grammar. Claude Sonnet 4.6 has only run from the terminal bench, against simulated tool results.
- Also missing: multiple ducks in the physics, jumping, gripping, new trained skills, final Kestrel art and deployment.

## First user test (2026-10-24): failed against the goal

- **Wrong page.** The teammate opened `/` (old scripted preview) instead of `/sandbox.html`, and the keys did nothing. On the sandbox, keys work (verified).
- **No understanding.** Natural requests ("what is the pythagorean theorem", "show me why 9 plus 16 equals 25") returned the parser fallback. There is no speaking, no understanding and no meaningful action from natural language.
- **Root cause.** The session prioritised the environment (physics, sandbox, puzzle artifact, model benchmark) over the voice → understand → act loop, which was the teammate's main goal. That loop is now the top priority in `06-handoff.md`.

## Last verification for `moments-floor-push` (2026-10-24, macOS, Node 24.16)

- `pnpm check`: pass (19 test files, **154 tests**, both page builds, API smoke).
- `pnpm test:e2e` (run against a local dev server): **120/120** on desktop and mobile, including the new mocked-Claude Moments spec (a real push to 10 cm, then a measured level release).

## Earlier verification (2026-10-24, Windows, Node 22.23.1)

- `pnpm typecheck`: pass.
- `pnpm test`: **18/18** (9 original, plus 5 lab-contract tests and 4 task-runner tests).
- Headless sandbox probes (SwiftShader WebGL):
  - Boots with no page errors and holds 50 Hz.
  - W held for 4 s moves the duck ~37 cm.
  - "push the 3 square to its slot" **succeeds in ~30 s**: the measured distance to the slot is 4 cm and the slot lights.
  - "push the 5 square to its slot" is **unreliable**. Runs went from 0.94 m to 0.41 m before timing out, and in one run the square was shoved into a corner. The runner reports failure honestly.
- `pnpm check` (typecheck, tests, both page builds, API smoke test): **pass** after the sandbox was added. `pnpm test:e2e` has not been re-run.

## Known issues

1. **The 5×5 push is unreliable.** The push planner is a simple waypoint controller (side point → behind → align → push), and the walking policy turns with a radius. Next steps: a pure-pursuit approach, a lower push speed with stall back-off tuning, or a trained push skill.
2. **Policy quirks (measured).** From a standing start, a right turn with vx = 0 stalls near −15°, and commands of 0.15 m/s or less may not start the gait. The runner creeps at 0.1 m/s during turns and kick-starts at 0.25 m/s for 0.8 s if the duck hasn't moved for 1.5 s.
3. **Flaky chat-scroll e2e test under load** (preview app). It passes alone and times out in the full parallel run.
4. **Large chunks.** The `LabScene` chunk is ~842 kB. The sandbox adds the MuJoCo WASM (~10 MB unpacked) and the ORT WASM.
5. **`world.version` (preview) only advances on reset.**
6. **Node 22 on this machine** vs the required 24 (works with warnings).
7. **`pnpm format:check` flags 42 files** on Windows (likely CRLF). New files are not Prettier-formatted yet either.
8. **Asset licences.** The Microduck mesh and policy licences aren't stated upstream beyond Apache-2.0 for the app and code. See `apps/web/public/microduck/PROVENANCE.md`.

## Two robots and navigation (2026-10-24, branch `two-duck-lab`, uncommitted)

**Measured movement contract (BEST_alpha_walking.onnx, fast-stepped MuJoCo, flat floor):**

| Command | Result |
| --- | --- |
| Forward vx 0.10–0.20 | **0 m/s**: dead zone, the gait never starts |
| Forward vx 0.25 / 0.30 / 0.40 / 0.50 / 0.60 | 0.108 / 0.137 / 0.171 / 0.214 / 0.272 m/s |
| Forward vx 1.0 | falls |
| Backward vx −0.15 to −0.30 | **0 m/s** |
| Backward vx −0.40 | −0.19 to −0.24 m/s |
| Lateral vy up to ±0.25 | 0 m/s (the policy ignores strafe) |
| Pure turn wz 1.0 | stalls |
| Pure turn wz 1.6 / 3.0 / 4.0 | 0.86 / 1.75 / 2.3 rad/s, pivot radius ≤ 1 cm |
| Walk 0.25 while turning wz 1.0–1.6 | turn radius 0.14–0.17 m |
| Stop from 0.25 / 0.40 | coasts 1.0 / 1.8 cm, settles in ~0.5 s |
| 0.64 N·m torque clamp (Duckverse, `infer_policy.py`) | no change on flat walking; the peak joint torque is 0.51 N·m |

**Defects found in the old controllers:**

- `steerTo` turned with a 0.1 m/s creep and wz ≤ 1.0, both inside dead zones, so turns stalled until the 1.5 s kick-start fired.
- The tile push walked at vx 0.12–0.20, which never starts the gait, so it only advanced in kick-start bursts. That is why the 5×5 push was unreliable.
- `move` backed up at −0.2, which never moves the duck.
- Push approaches didn't route around placed squares, so the 3×3 push knocked the 4×4 69 cm off its slot.

**Navigator, before → after** (20 start/goal pairs, 4 headings; `scripts/bench/nav-bench.mjs`):

| Metric | Before | After |
| --- | --- | --- |
| Completed | 20/20 | 20/20 |
| Mean / max time | 10.0 / 16.4 s | 5.1 / 7.2 s |
| Final error, mean (p90) | 6.2 (6.4) cm | 2.6 (3.0) cm |
| Path ÷ straight line | 1.94 | 1.34 |
| Falls | 0 | 0 |

**Two robots in one world:**

- Pip has ctrl 0–13 and Nova ctrl 14–27, each with its own qpos/qvel slice. `assertNoCrossTalk` throws at compile time if any address is shared.
- Robot↔robot and robot↔apparatus contacts are live.

**Cooperative Moments experiment** (`set_balance`; `scripts/bench/coop-bench.mjs`):

- Sequence: lock, both robots push their own paddles (together when their lanes don't overlap, otherwise one at a time), stop, withdraw, verify clear and still for 0.5 s, release, measure.
- Per robot: TRAVEL → ALIGN → APPROACH → CONTACT → PUSH → STOP → WITHDRAW → VERIFY → READY. The rail clamp comes off only on real MuJoCo paddle contact. Bounded retries.
- Results over 8 runs on the final geometry (plus the UI run and the e2e run): every one completed with 0 falls and positions within 0.1 cm of the targets, in 11.7–13.8 s (1.1 s when nothing needs moving). The predicted and measured outcomes agreed every time:
  - level: 10/20 and 15/30;
  - left down: 20/20, 25/12, 30/15 and 11/20;
  - right down: 10/30 and 10/22.
- 5/8 cm is correctly refused (no room to stand between the weights).
- Contact ledger: paddle push peaks of 4–16 N and max penetration 1.2–3.9 mm (paddle `solref` 0.005). No robot touched the pivot or the other robot.

**Cooperative Pythagoras** (`build_squares`; `scripts/bench/crew-bench.mjs`): Pip 5×5 with Nova 4×4 in parallel, then Pip 3×3. It takes 63 s (one robot alone: about 117 s). All three squares land 2.5–2.9 cm from their slots, none disturbed, 0 falls, 0 robot–robot contact.

**Performance** (M3 Pro, headed Chromium, during a live two-robot experiment):

- Rendering: 120 fps (display-limited), with frame times of p50 8.3 ms and max 9.4 ms. Zero long tasks.
- Control step: 0.92 ms (both inferences 0.27 ms, physics 0.48 ms, contact audit 0.11 ms) within each 20 ms tick.
- REA 6.7.0 `inspect-web-page` reported **no workers**: physics and inference run on the main thread, so a Web Worker isn't needed at this load.

**Tilt prediction (Oct 25):** the predicted tilt comes from net moment ÷ the balance's MuJoCo-measured stiffness (0.226 N·m/rad). It matches the measurement within about 0.1° near balance. Above about 4° it under-predicts by up to about 1° (linear model). The rails have 5 mm of travel past their 5 and 30 cm marks, so a push that overshoots never presses an end stop.

**Idealisations, stated in the UI and README:**

- The lock pin is a kinematic hold that levels the plank at a fixed rate.
- Each rail clamp holds its carriage where it is and engages when the carriage reaches the requested mark. It never moves a carriage.
- The plank's pin is 8 cm above the plank, like a beam balance's pivot above the centre of mass.
- The tilt stops at ±0.1 rad (5.7°), so most imbalances read as "down 5.7°".

## Moments lesson (2026-10-24, branch `moments-floor-push`)

- **Apparatus.** The plank is a beam balance, held level by a lock pin until released. Each weight rides a slide joint on its own side of the pivot (200 g left, 100 g right, both starting at 20 cm; rails run 5–30 cm). A paddle hangs off each weight into a walking lane beside the plank.
- **The duck really pushes the weights.** `place_weight {target, cm}` walks Pip to the lane, frees that weight's brake, pushes the paddle with its body to the mark, brakes it and steps back clear. No authored placement or teleport. It locks a released plank first, and refuses a push that would leave no room to stand between the weights ("Try N cm or more").
- **Release and lock.** `release_plank` reports the measured tilt once the plank settles; `lock_plank` levels and locks it. The learner has a Release/Lock button and chips with each weight's measured cm.
- **Tilt.** The hinge sits ~2 cm above the loaded centre of mass, so equal moments rest level and any imbalance tips to the ±0.1 rad stop (about 5.8°). This is smaller than the earlier −11.8° because the paddles hang low and must clear the floor.
- **Claude.** The tool schema has the three new kinds and a `cm` field; the system prompt has Moments guidance; the world snapshot carries the measured balance (lock state, low side, tilt, each weight's side and cm). **Verified with live Claude (Bedrock, typed, voice off), 2026-10-24:** asked "Can you balance the plank?", Claude computed 200 × 20 = 4000 vs 100 × 20 = 2000 g·cm, called `place_weight` (200 g → 10 cm; measured "Moved the 200 g weight from 20 cm to 10 cm."), then `release_plank` (measured "It stayed level (0.0°)."), and closed with an explanation that matched the measurement. 3 model turns (1.3–2.2 s each), no errors. Spoken input and output are not yet checked for Moments.
- **Measured (fast-stepped physics harness, not committed):**
  - 24 random placements: 22 exact landings in 11–18 s, 1 correct refusal, 1 already there, **0 falls**.
  - Release: left side down 5.8° at the start; level at 200 g × 10 cm = 100 g × 20 cm; right side down at 100 g × 30 cm vs 200 g × 10 cm; level again at 200 g × 15 cm = 100 g × 30 cm.
  - Live in the app (real time): 20 → 10 cm push, then Release reads "It stayed level (0.0°)".
- **Limits.** The duck can only push from the paddle side of the plank; from the far side it refuses. A single duck only.

## UI branch verification — 2026-10-25

On `glass-windows` (from main `4154acf`): sandbox lesson/console/speech windows and buttons now use noir/amethyst/silver styling. No simulation or agent behavior changed. `pnpm check` passes (147 tests, typecheck, web/API builds, API smoke). Sandbox Playwright passes 4/4 using installed Chrome on desktop and mobile with mocked provider requests. Production visual inspection at 1440/768/390px: zero failures, one compact-secondary-text warning; glass, floating shadows and purple explicitly allowed for the brief. Missing local Bedrock SDK was resolved with frozen-lockfile install; lockfile unchanged.

## Integrated entry — 2026-10-25

Root now serves the landing page; Open console enters the real lab at `/console`, with `/lab` and `/sandbox.html` compatibility. The original scripted screen, scene and store are removed; the explicit two-bot demo remains separate. Console windows now have a dark purple glass tint. `pnpm check` passes with 139 tests after removing eight obsolete preview-store tests. Landing/navigation/sandbox browser checks pass 16/16 on desktop/mobile. Production entry/console screenshots have no page errors or overflow. Merge to main explicitly authorized by owner, pending CI.

Integration follow-up: 8/8 desktop/mobile checks passed, including actual `/console` physics boot without automatic external/provider calls and the preserved teammate demo. Combined relevant browser checks: 24/24.

## Workshop/camera branch — 2026-10-25

On `lab-workshop-camera`: palette-aligned workshop, independent pan/pinch/wheel camera, follow/frame/reset and keyboard controls, reduced-motion behavior and mobile layout. Physics unchanged. `pnpm check`: 185 passing tests and successful builds/API smoke. Browser: 7 passed; 1 intentional desktop skip of mobile pinch test. Independent review finding (Space keyup interception) fixed with a failing-then-passing browser regression. Not merged.

## Botanical Studio — 2026-10-25

On `lab-workshop-camera`, console and room now use the owner-selected warm stone/forest/sage/brass palette. Richer original materials, furniture detail, fixed-surface AO, dynamic shadows and live wall display replace the initial dark room. Landing, camera behavior and MuJoCo actions unchanged. pnpm check: 185 tests/builds/API smoke pass. Browser: 7 pass, 1 intentional skip. Independent review: no significant findings. Final desktop/mobile screenshots inspected. Not merged.

## Classroom refinement (2026-10-25)

On `lab-workshop-camera`, Botanical room now has a lesson-specific teaching board, chalk tray and labeled equipment storage. Claude Code continuation guide is in `docs/handoffs/claude-code-classroom-redesign.md`. `pnpm check` passes (185 tests); both lessons rendered and screenshots inspected at desktop 1440×1000 and touch mobile 390×844. Existing mobile lesson card scroll and small in-world labels remain; use zoom for board details. No physics/camera logic changes, no paid AI calls, no push/merge.

## Playground — 2026-10-25

On `lab-workshop-camera` (uncommitted): the classroom became a full-screen playground on a grass island with an open court, garden picket fence on the boundary wall, swings, slide, seesaw, sandpit, lesson board, Folio-style trees and grass, and clouds. Fixed furniture removed from physics. Console restyled with the owner's General Intelligence Company glass system (light toast glass over the scene, Inter, Home removed). Low-power mode for software WebGL.

Verified: `pnpm check` (185 tests, typecheck, builds, API smoke). Playwright: camera + console-entry 11 passed, 1 intentional skip (after adding a 120 s file timeout to the camera spec; it passed with 120 s alone under load average ~20); sandbox spec 9 passed, 1 skipped on the final scene. Screenshots of both lessons inspected at 1440×900 and iPhone 13. Known: headless SwiftShader renders ~1–2 fps on this machine even without the playground (2 fps bare scene); the board can be clipped at the top in some follow framings on short screens.

## Simple Rescue Navigation — 2026-10-25

Local `rescue-navigation` branch adds a deterministic grade 6–8 mission to the current playground: three route choices, one real obstacle, prediction/check, physical navigation, hint, reflection and retry. No battery timer or model/voice calls. Tests cover route clearance, validation, arrival/settling, contact failure, cancellation and timeout. `pnpm check` passed with 192 tests plus typecheck/build/API health. Both authored detours physically completed in desktop/mobile browser runs; final reviewed regression run recorded in changelog. Actual walking distance differs from geometric route length because of turning/gait sway; displayed separately.

## Owner correction: voice-led obstacle course (supersedes worksheet above)

Removed A/B route buttons, calculation gate and Pythagoras hint. Current rescue has three fixed barriers and unequal blue/orange passages. Player speaks a named passage via existing STT or types directions. Physical travel drains a distance-based battery; longer route fails with a Pip bubble and automatic reset, shorter route reaches dock. Reset generations/cancellation prevent stale speech execution. Current limitation: explicit passage names, not arbitrary freeform navigation. Live STT provider not exercised; browser tests mock transcription while running real MuJoCo.

Voice-course verification: 193 unit tests and full check pass; desktop/mobile browser flows pass, including reset-vs-transcription regression. Final desktop visual check confirms death bubble is above Pip, followed by reset and successful retry. Browser audio/STT is mocked; live microphone/provider still needs owner playtest.


## 2026-10-25 — Zigzag rescue refinement

Rescue now uses a three-checkpoint zigzag with six possible orders, actual-distance battery and backtracking. Keyboard fallback redesigned. Desktop real-physics death/reset/success and mobile keyboard smoke passed; microphone/STT mocked. Local rescue-navigation only.


## 2026-10-25 — Four-path network

Owner-requested four-path branching network implemented, replacing the one-corridor zigzag. Letters A/B/C/D/E/F/H, directed links, only shortest fits 4.2 m battery. Validation results in latest changelog.

## rescue-main — 2026-10-25 (Claude Code)

Rescue-navigation is the base. On top of it: robot sound instead of TTS, one-sentence replies, `normalizeTask`, the objectives board with XP, and the collapsible You and Pip / Pip and Nova windows.

- **Verified live (real MuJoCo, browser):** Balance the beam tips the plank 5.8° left. Two different learner solutions read level at 0.4° and fill the bar to 100 XP. Pip's handoff, each robot's measured move and the joint result appear in Pip and Nova. A live Claude turn walked Pip 20 cm with the robot clip and no TTS call.
- **Seen, not judged:** two Build-the-triangle runs in a hidden (throttled) browser tab each had one robot fall, so only 1 of 3 squares landed and XP correctly stayed 0. Re-check `build_squares` in a visible tab before demoing it.
- **Progress storage (branch `tiger-data-progress`):** won objectives survive refresh via localStorage, and via a Tiger Data hypertable when `TIGER_DATABASE_URL` is set. Unit-tested with a mocked database, and verified against a real Tiger Cloud service on 2026-10-25: the hypertable was created (time dimension `at`), 3 POSTs returned 201, and the GET returned the right earned objectives and counts. The service first served a temporary self-signed certificate (`SELF_SIGNED_CERT_IN_CHAIN` under `pg` 8, where `sslmode=require` means verify-full); by 14:27 UTC Tiger had swapped in a CA-signed (Google Trust Services) certificate and the unmodified `.env` URL passes strict TLS. In-browser: a beam win was stored (tilt 0.2°, 10/20 cm) and restored after a refresh with the local copy cleared.
- **Not ported from main:** the coordinator and two-bot LLM conversation, the progress store and levels, and #11–#17's other UI.
