# Status

_Last updated: 2026-10-24 by Claude Code. The Moments sections reflect branch `moments-floor-push` (on top of `4154acf`); the rest is unchanged from earlier sessions._

## Implemented

### Scripted preview (`/`, unchanged)

Isometric room, Pip and Nova placeholders, the analytic balance, the typed grammar, the two-turn scripted exchange, stop/reset. The header now links to the sandbox.

### Lab sandbox (`/sandbox.html`, new)

- **Physics and policies.** Real Microduck physics: MuJoCo 3.11 WASM stepping the upstream MJCF, with 7 upstream ONNX policies at **50 Hz** (verified headless): walk, sit/stand, get-up, kick L/R, roll and peck. Fall recovery uses the get-up policy, and the duck respawns if it fails.
- **Controls.** Keyboard: WASD or arrows, Q/E kick, R sit/stand, F peck, T roll, Esc stops the task. There are also console buttons and a reset.
- **Lessons.** Maths · Pythagorean theorem (3×3, 4×4 and 5×5 grid tiles, a floor triangle and slots that light up), Physics · Moments (a beam balance: a locked plank on a pivot, with a 200 g and a 100 g weight on rails that the duck pushes; see below), and Free play. Shared room furniture (bench, shelf, crate) is part of the physics in every lesson.
- **Typed tasks.** These go through `parseDuckTask` → `DuckTaskSchema` → `TaskRunner` and report measured results in the log.
- **Bubble.** A reply bubble sits next to the duck, and the log keeps history.

### Two-bot conversation demo (`/?demo=two-bot`, new, on `feat/two-bot-demo`)

A temporary demo of two robots talking to each other and to the learner. It runs on a **stub simulation** (`simulation/fake/`) and a **scripted mock provider**; nothing calls a model, uses a key, the network or MuJoCo. Fast commands are labelled `built-in`, mock replies `mock`, fixed fallbacks `scripted`. One bubble shows in the room at a time (paced by `presentation/`), with Pause/Resume and a 0.5x speed; the side rail shows everything. Not yet connected to `duckSim`.

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

## Moments lesson (2026-10-24, branch `moments-floor-push`)

- **Apparatus.** The plank is a beam balance, held level by a lock pin until released. Each weight rides a slide joint on its own side of the pivot (200 g left, 100 g right, both starting at 20 cm; rails run 5–30 cm). A paddle hangs off each weight into a walking lane beside the plank.
- **The duck really pushes the weights.** `place_weight {target, cm}` walks Pip to the lane, frees that weight's brake, pushes the paddle with its body to the mark, brakes it and steps back clear. No authored placement or teleport. It locks a released plank first, and refuses a push that would leave no room to stand between the weights ("Try N cm or more").
- **Release and lock.** `release_plank` reports the measured tilt once the plank settles; `lock_plank` levels and locks it. The learner has a Release/Lock button and chips with each weight's measured cm.
- **Tilt.** The hinge sits ~2 cm above the loaded centre of mass, so equal moments rest level and any imbalance tips to the ±0.1 rad stop (about 5.8°). This is smaller than the earlier −11.8° because the paddles hang low and must clear the floor.
- **Claude.** The tool schema has the three new kinds and a `cm` field; the system prompt has Moments guidance; the world snapshot carries the measured balance (lock state, low side, tilt, each weight's side and cm). **Not yet verified with live Claude or voice.**
- **Measured (fast-stepped physics harness, not committed):**
  - 24 random placements: 22 exact landings in 11–18 s, 1 correct refusal, 1 already there, **0 falls**.
  - Release: left side down 5.8° at the start; level at 200 g × 10 cm = 100 g × 20 cm; right side down at 100 g × 30 cm vs 200 g × 10 cm; level again at 200 g × 15 cm = 100 g × 30 cm.
  - Live in the app (real time): 20 → 10 cm push, then Release reads "It stayed level (0.0°)".
- **Limits.** The duck can only push from the paddle side of the plank; from the far side it refuses. A single duck only.
