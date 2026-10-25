# Current handoff — 2026-10-25

- Branch: `glass-windows`, created from main `4154acf`. Leave main unchanged; merge later only at owner direction.
- Implemented sandbox smoked-glass lesson, console and speech windows; palette-scoped pill buttons, hover/focus/disabled states, mobile layout, reduced motion/transparency. App change is confined to `apps/web/src/sandbox/Sandbox.module.css`.
- Verified: `pnpm check` (147 tests), sandbox Playwright 4/4 desktop/mobile, formatting and diff whitespace checks. Production screenshots inspected at 1440/768/390px; visual inspector zero failures, one compact-label warning.
- Preview: Vite on 5200 and production preview on 5201 for this session. These are UI previews only; live API is not launched. Browser tests mocked AI.
- Requested design-taste skill installed locally in `.agents/skills/design-taste-frontend` with `skills-lock.json`; left untracked and out of the product PR.
- Next: owner reviews the window/button treatment. 3D materials, robot tint, the old scripted preview and other branch work are unchanged.

---

## Previous handoff (historical; separate work)

# Handoff

_Rewrite this file at the end of every session. Last rewritten: 2026-10-24 (Claude Code, after resuming from Codex and pushing `as-kestrel`)._

## Two-bot demo branch (added 2026-10-24, implementer session)

Branch `feat/two-bot-demo` holds the two-bot conversation demo (see `04-status.md` and `03-codebase-map.md`) merged with `origin/main` (PR #2). It stays behind `?demo=two-bot`. **Next task, separate PR:** implement `SimAdapter` over `duckSim` and wire the coordinator to it; do not change layers above `SimAdapter`. Open for the owner: default presentation speed, and whether Pause also holds an in-flight model call (currently it does not).

## The goal (teammate slice, see `08-current-scope.md`)

The learner speaks to the duck; Claude decides whether to answer, act, or both; the duck acts in the physics lab; replies appear in a bubble beside the duck and in the chat, and are spoken aloud. Pythagoras squares are the first lesson; Moments is next.

## Where the code lives

- Branch **`as-kestrel`** on `usmannsiddiqui/kestrel` (public). It was cut from `73a294c` and is **not** rebased on `origin/main` (`32c575d`).
- The owner's branch **`origin/microduck-lab-windows`** also builds a Microduck lab with per-bot agent windows. It overlaps heavily; compare before merging either.
- Local secrets live in `.env` (gitignored): ElevenLabs key, AWS IAM key (`AKIA…`, no session token), `AWS_REGION=us-east-1` and `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6`. Never print or commit them.

## Works (verified live on 2026-10-24)

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
2. **Moments isn't an experiment yet.**
   - The duck can't put a weight on the plank (the plank top is about 7 cm up; push only works along the floor).
   - Claude's system prompt has only Pythagoras guidance.
   - Moments is untested with Claude and voice.
3. **First live voice run timed out once** (no "Moved" within 90 s). It was flaky and not reproduced.
4. **Disk** is about 0.15 GB free on C:. Headless Chromium crashed once mid-demo, probably because of it. Check free space before installs or long runs.

## Next steps, in order

This is the short list; the full backlog with acceptance checks is in `11-remaining-steps.md`.

1. **Moments as a real lesson:**
   - Add a bounded `place_weight` task: `{ weight, side: left|right, cm: 5–30 }`. It sets the weight onto the plank at that distance (an authored station action, honestly labelled; not a physical lift), and its result reports the measured tilt.
   - Add Moments guidance to the agent prompt: explain moment = mass × distance, predict, place, observe the tilt, balance (200 g × 20 cm = 100 g × 40 cm).
   - Verify by voice: "balance the plank".
2. Apply the largest-first demo fix and re-run `tests/.probe-demo.mjs` (paid, about $0.10 per run) until the 3-square demo succeeds repeatably. Then investigate the post-push fall.
3. Turn the useful probes (`tests/.probe-demo.mjs`, `.probe-right.mjs`, `.probe-moments.mjs`; gitignored) into Playwright specs with mocked Claude. Keep `scripts/live-voice-check.mjs` as the paid end-to-end check.
4. Compare with and reconcile against the owner's `microduck-lab-windows` before opening a PR.
5. Later: a second duck (good teacher / bad teacher).

## Blocked / needs owner

- TTS and provider choice: ElevenLabs plus Claude on Bedrock instead of the planned OpenAI.
- Youth data terms.
- Microduck asset licences (vendored under the upstream Space's Apache-2.0).
- Bedrock access: Haiku 5.5, Sonnet 5 and Sonnet 5.5 are unavailable to this account, and Haiku 4.5 needs Marketplace subscribe permissions.
