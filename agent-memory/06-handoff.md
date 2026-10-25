# Handoff

_Last rewritten: 2026-10-25 (Claude Code), when the owner's stack merged with `main`._

## Where everything is now

- **PR #8 (glass windows, landing page) is on `main`:**
  - `/` is the landing page.
  - The real console is at `/console`; `/lab` and `/sandbox.html` still work.
  - The windows use noir/amethyst glass.
- **On `moments-floor-push` (PR #5 → `main`):**
  - PR #6: two real Microducks, the navigator, the cooperative Moments and Pythagoras experiments, the contact ledger.
  - PR #7: Rayyan's two-bot demo on real physics at `/?demo=two-bot&sim=mujoco`, with live Claude for Pip and Nova via `&provider=live`. It falls back to the scripted mock.
  - The rail end-stop fix, tilt predicted from measured stiffness, and round-then-classify for tilt labels.
  - `main` (PR #8) has been merged into it, so PR #5 brings everything to `main`.
- **Next:** voice on the two-bot page; the owner's further UI work; Rayyan's review of the `SimAdapter` interface change (async `apply`, `actTimeoutMs`, a talk-time chain cap).

The earlier handoff notes follow, unchanged.


_Rewrite this file at the end of every session. Last rewritten: 2026-10-25 (Claude Code, real `SimAdapter` for the two-bot demo on `two-bot-real-sim`)._

## Two-bot demo on the real Microducks (branch `two-bot-real-sim`, PR into `two-duck-lab`)

Cut from `two-duck-lab` (PR #6), so it stacks on #6 → #5. `/?demo=two-bot&sim=mujoco` runs the PR #4 demo on the real two-robot `DuckSim`; without `&sim=mujoco` it is the stub, unchanged.

- **Seam change** (teammate's area, explained in the PR): `apply(task, version, signal?)` returns a promise that settles when the push lands, fails (`reason: "failed"`) or is aborted; optional `summary` on results; coordinator `actTimeoutMs` (60 s) and a chain cap that pauses while a bot acts.
- **Adapter:** `apps/web/src/simulation/real/` (`index.ts` pure and unit-tested against a fake DuckSim; `load.ts` boots DuckSim on the Moments kit, lazily imported).
- **Verified:** `pnpm check` (183 tests); stub specs `two-bot-demo`, `pacing`, `integration` (108/108 passed); new `tests/two-bot-real-sim.spec.ts` 2/2 (a real 20 → 10.1 cm push with the measured result in the rail and readout; Stop mid-push leaves the weight clamped where it stood).

- **Live Claude for Pip and Nova** (`&provider=live`): API route `/api/two-bot/respond` (`apps/api/src/twoBot.ts`) and `provider/live.ts`; mock fallback stays labelled. Live check passed: Pip asked Nova, Nova pushed the right weight 20 → 24.9 cm.
- **Rail end-stop fix merged in** from `moments-floor-push` (`1b8eea1`, merge `e0f70f7`). A carriage held just past its 5/30 cm end stop pressed on MuJoCo's soft limit and tipped a balanced plank; the rails now travel 5 mm past the marks. A loosened test (`a28d829`) that hid it was reverted (`d715923`), so the strict Moments checks from `1b8eea1` apply.
- PR #7's base is still `two-duck-lab`; #6 is merged into `moments-floor-push`, so the base should move there once the owner approves.

**Next:**
1. The teammate (PR #4 author) reviews the seam change and the live provider.
2. Demo follow-ups in `11-remaining-steps.md`: release-and-measure so the room shows measured tilt; a "moving…" cue during the push; reply text after the measured result.
3. Merge order: #5, then #6, then this PR.

## Two robots, faster navigation, cooperative experiments (branch `two-duck-lab`, uncommitted)

Built on `moments-floor-push` (PR #5). It is **not committed or pushed**: the owner asked not to commit unless requested. What it does (details and numbers in `04-status.md`):

- Pip and Nova are both real Microducks in one MuJoCo world (`mjcf.ts`, `robot.ts`, `duckSim.ts`).
- A new `Navigator` (`navigate.ts`) drives every task without commanding the measured dead zones, about twice as fast as before.
- Moments: both robots push their own weights at once, step clear, and the lab verifies they are clear before releasing (`set_balance`). The learner predicts first.
- Pythagoras: both robots build the squares in two stages (`build_squares`).
- Claude has `set_balance` and `build_squares`.

**Next:**
1. The owner decides whether to commit it as a PR (it stacks on PR #5).
2. A spoken (voice) run of both experiments.
3. The owner's UI and palette pass.
4. Robot-to-robot avoidance if lanes ever have to be shared.

Benchmarks to rerun after any change to movement are in `scripts/bench/` (see `02-runbook.md`).

## Moments balance branch (added 2026-10-24, Claude Code for the owner)

Branch `moments-floor-push`, one commit on top of `main` (`4154acf`), with an open PR into `main`. It turns the Moments lesson into a working experiment in the sandbox: weights on rails that Pip pushes physically, a locked plank the learner or Claude releases, measured tilt results, and Claude tools plus prompt guidance. Details are in `04-status.md`. Verified with live Claude, typed and with voice off: "Can you balance the plank?" moved the 200 g weight to 10 cm and released a level plank (see `04-status.md`). **Next for this slice:** the same by voice (hold to talk, spoken replies), and "what are moments?". Pythagoras behaviour is unchanged.
## Current task

Owner explicitly requested merging the landing page and actual console to main after removing the old scripted view and adding a dark purple glass tint. Changes are on `glass-windows`, PR #8. The original `welcome-preview` worktree is preserved; only its landing components/assets were copied, avoiding its older simulation ancestors.

Branch `feat/two-bot-demo` holds the two-bot conversation demo (see `04-status.md` and `03-codebase-map.md`) merged with `origin/main` (PR #2). It stays behind `?demo=two-bot`. The `SimAdapter` over `duckSim` is now on `two-bot-real-sim` (above). Open for the owner: default presentation speed, and whether Pause also holds an in-flight model call (currently it does not).
## Delivered

- `/` is the illustrated landing page; all Open console links lead to `/console`, the real MuJoCo/ONNX SandboxApp. Home returns to `/`. `/lab` and `/sandbox.html` remain usable.
- Old App screen, preview scene and preview store removed with obsolete tests. Separate `?demo=two-bot` teammate demo preserved, lazily loaded.
- Console runs outside StrictMode to initialize WASM once; landing does not load physics. Purple glass tint and existing pill controls use the owner palette.
- Landing FAQ describes current AI/voice honestly, including server configuration and current single robot. Other two-robot physics branches are not included in this UI integration.
- README, design, provenance and codebase map updated. Local installed design skill remains untracked.

## Verification

- `pnpm check`: passed, 139 tests, types, web/API builds and API smoke. Eight obsolete preview-store tests were removed with the store.
- Landing/navigation/real-console Playwright: 16/16 desktop/mobile, including actual movement at `/console` and Stop/Reset at `/sandbox.html`, with mocked AI.
- Production screenshots inspected at desktop and phone sizes: no page errors or horizontal overflow; purple glass and Open console/Home navigation confirmed.
- Code review caught a stale root-page integration assertion; corrected to the landing contract. Follow-up integration checks and GitHub CI gate the requested merge.

## Next

Finish integration/CI checks, merge PR #8 using a merge commit as authorized, and verify origin/main includes it. Teammates pull main, install frozen dependencies, and run pnpm dev; each supplies their own .env for live AI/voice. Do not merge unrelated simulation PRs.

- **Voice loop:** hold-to-talk (or Space) → MediaRecorder → ElevenLabs `scribe_v2` → Claude Sonnet 4.6 on Bedrock → duck acts → ElevenLabs `eleven_flash_v2_5` speaks. "Please walk forward 20 centimeters" made the duck move 18 cm, followed by spoken replies.
- **All typed text goes to Claude.** The fixed parser is no longer used in the UI.
- **"What is the Pythagorean theorem?"** puts the explanation in the bubble and chat, then the duck pushes squares in the same turn.
- **"Move the crate to the right"** (Free play) pushes the crate 16 cm **screen-right**, and Claude reports the measured result accurately.
- **Claude's honesty:** results include measured distances, and the closing summary describes the current world, failures included.
- **Moments physics:** the plank tips to about −12° under the 200 g weight, after the pivot was rotated (`yaw: π/2`).
- **Moments display:** the camera frames the duck plus the lesson apparatus (`LabKit.focus`), so the tipping plank is visible.
- **Tests:** 27/27 unit tests and `tsc` clean.

## Unreliable or broken

1. **Three-square demo.** Individual pushes reach 3–4 cm, but across a full demo the duck sometimes falls afterwards, or pushing the 5×5 stalls and disturbs placed tiles.
   - A proposed fix is **not applied**: prompt order largest-first (5 → 4 → 3) in `apps/api/src/agent.ts`, and push budget 120 → 150 s in `tasks.ts`, with the test loop updated to match.
2. **Moments is untested with live Claude and voice.** The experiment itself works on `moments-floor-push`: the duck pushes each weight along a rail by a paddle at floor level, the plank stays locked until released, and Claude has tools and guidance for it.
3. **First live voice run timed out once** (no "Moved" within 90 s). It was flaky and not reproduced.
4. **Disk** is about 0.15 GB free on C:. Headless Chromium crashed once mid-demo, probably because of it. Check free space before installs or long runs.

## Next steps, in order

This is the short list; the full backlog with acceptance checks is in `11-remaining-steps.md`.

1. **Moments by voice.** `place_weight {target, cm}`, `release_plank`, `lock_plank` and the prompt guidance are on `moments-floor-push` (a physical push, not an authored placement; rails run 5–30 cm, so the balance is 200 g × 10 cm = 100 g × 20 cm). Verified with live Claude by typing; still to do: the spoken round trip.
2. Apply the largest-first demo fix and re-run `tests/.probe-demo.mjs` (paid, about $0.10 per run) until the 3-square demo succeeds repeatably. Then investigate the post-push fall.
3. Turn the useful probes (`tests/.probe-demo.mjs`, `.probe-right.mjs`, `.probe-moments.mjs`; gitignored) into Playwright specs with mocked Claude. Keep `scripts/live-voice-check.mjs` as the paid end-to-end check.
4. Compare with and reconcile against the owner's `microduck-lab-windows` before opening a PR.
5. Later: a second duck (good teacher / bad teacher).

## Blocked / needs owner

- TTS and provider choice: ElevenLabs plus Claude on Bedrock instead of the planned OpenAI.
- Youth data terms.
- Microduck asset licences (vendored under the upstream Space's Apache-2.0).
- Bedrock access: Haiku 5.5, Sonnet 5 and Sonnet 5.5 are unavailable to this account, and Haiku 4.5 needs Marketplace subscribe permissions.
Integration follow-up: 8/8 desktop/mobile checks passed, including actual `/console` physics boot without automatic external/provider calls and the preserved teammate demo. Combined relevant browser checks: 24/24.
