# Kestrel team handoff — Oct 25

Oct 25, 2026 · @Muhammad Usman Siddiqui

Everything through PR #8 is merged into `main` (`e4c5d87`): two real Microducks in one MuJoCo world, the cooperative Moments and Pythagoras experiments, Rayyan's two-bot demo driving the real robots with live Claude, and the noir/amethyst glass UI. Pull `main`, paste the prompt below into your Claude session, and start your next feature on its own branch.

## Paste this into your Claude Code or Codex session

Open a fresh session in your Kestrel checkout and paste the whole block. It has no keys and no machine-specific paths, so it's safe to share.

```text
You're joining Kestrel mid-hackathon (HackPSU 2026, GitHub repo
usmannsiddiqui/kestrel). It's a browser science lab for ages 13-16: two
simulated Microduck robots, Pip and Nova (MuJoCo WASM physics plus a trained
ONNX walking policy at 50 Hz), run physics and maths experiments that the
learner predicts and then checks. Claude on Bedrock drives the robots and
ElevenLabs gives them voices. Get up to speed, report back, then wait for me
to pick a task.

STATE (October 25)
- Everything through PR #8 is merged into main (e4c5d87). Only PR #9
  (experiment panel contrast fix) is open.
- Routes (pnpm dev: web on :5180, API on :5181):
  /                    landing page
  /console or /lab     the lab: both robots, the Moments and Pythagoras
                       experiments, voice and typed chat with Claude
  /sandbox.html        the original single-page lab entry
  /?demo=two-bot       Pip and Nova talking (stub sim, mock provider)
    &sim=mujoco        ...driving the real MuJoCo robots instead
    &provider=live     ...with live Claude replies (needs keys)
- API: POST /api/agent/turn, /api/two-bot/respond, /api/voice/transcribe,
  /api/voice/speak; GET /api/health.

CODE MAP
- packages/contracts/src/lab.ts: props, kits, MOMENTS constants and
  DuckTaskSchema (the task kinds robots accept).
- packages/contracts/src/agent.ts: the world snapshot the agent sees.
- apps/web/src/simulation/duckSim.ts: the world. Both robots, kinematic
  holds, contact ledger, runTask.
- apps/web/src/simulation/: robot.ts (per-robot runtime), navigate.ts
  (dead-zone-aware navigator), tasks.ts (task steps), moments.ts
  (BalanceExperiment, CrewPlan), mjcf.ts (scene builder).
- apps/web/src/simulation/real/: SimAdapter over DuckSim for the two-bot demo.
- apps/web/src/sandbox/: the lab UI (SandboxApp, SandboxScene,
  ExperimentPanel, agentSession).
- apps/web/src/coordinator/, provider/ (mock + live), demo/TwoBotDemo.tsx:
  the two-bot conversation layer.
- apps/api/src/agent.ts (lab agent tools + prompt), twoBot.ts (two-bot route).
- scripts/bench/*.mjs: motion, nav, coop and crew benchmarks.
- agent-memory/: the team's shared notes for agents.

CONTRACT CHANGES SINCE PR #1 (check these if your branch touches them)
- New task kinds: place_weight {target, cm 5-30}, set_balance
  {left_cm, right_cm}, release_plank, lock_plank, build_squares.
- Agent world snapshot: optional world.balance
  {plank, lowSide, tiltDeg, weights[]}.
- DuckSim is multi-robot (pip, nova). Single-robot callers still work and
  default to pip. stopAll() stops both.
- SimAdapter.apply is async and takes an abort signal. ApplyResult can be
  "failed" with a summary. actTimeoutMs is 60 s; chainCapMs counts talk time.
  The live provider calls /api/two-bot/respond; its ledger entries have
  source "live".

MEASURED FACTS (don't re-derive them, don't fight them)
- The walking policy ignores commands in its dead zones: forward 0.10-0.20,
  backward -0.15 to -0.30, pure turns up to 1.0, and lateral entirely.
  Forward 1.0 falls over. The navigator cruises at 0.55, approaches at 0.3,
  spins at 3.0 and backs up at -0.4.
- MuJoCo WASM traps: typed-array views over WASM memory go stale when the
  heap grows (copy static arrays), and mj_contactForce needs
  new mujoco.DoubleBuffer(6).
- Balance: predicted tilt = net torque / measured plank stiffness. "Level"
  means |tilt| < 0.5 degrees after rounding. The lock pin and rail clamps are
  kinematic holds, an idealisation the UI names.

SETUP
1. Node 24 and pnpm 9. git pull origin main, then pnpm install.
2. cp .env.example .env and fill AWS_REGION, the AWS keys,
   BEDROCK_MODEL_ID and ELEVENLABS_API_KEY. Get keys from the team, never
   commit .env, never prefix a key with VITE_. Without keys the physics
   still runs; live Claude and voice don't.
3. pnpm dev.
4. Once: pnpm exec playwright install chromium.

TEAM RULES
- One branch per feature, cut from fresh main, kebab-case name. Push it,
  open a PR to main, merge with a merge commit. Never push to main.
- Before a PR: pnpm check (typecheck, unit tests, build), plus
  pnpm test:e2e for UI changes. Report failures with their output.
- Update agent-memory/ per agent-memory/README.md after every change. The
  repo is public: no secrets, no private notes.
- Secrets live only in .env. If you find one committed, report the path
  and tell us to rotate it.
- If a global gitignore hides vendor/ folders, use git add -f for vendored
  files.
- Measure before claiming. Name any idealisation in the UI.
- duckSim.ts, tasks.ts and SandboxApp.tsx are hot spots. Say in team chat
  before a branch changes them.

FIRST STEP
Read AGENTS.md, then agent-memory/README.md, agent-memory/06-handoff.md and
agent-memory/04-status.md. Run git log origin/main -1 and gh pr list. Then
tell me in 6 lines or fewer: what's on main, anything that changed since
this note, and which next feature for my area you'd start with, on what
branch name. Then wait.
```

## What changed since PR #1

| PR | Author | What it did | Status |
| --- | --- | --- | --- |
| #1 | usmannsiddiqui | Real Microducks in an open lab with per-bot agent windows | Closed, replaced by #5 to #7 |
| #2 | ammarsapru | Voice lab sandbox: one real Microduck, a Claude agent on Bedrock, ElevenLabs speech | Merged |
| #3 | usmannsiddiqui | Floor-push balance, stacked on #1 | Closed, replaced by #5 |
| #4 | Rayyan2235 | Two-bot conversation demo on a stub sim with a mock provider (`?demo=two-bot`) | Merged |
| #5 | usmannsiddiqui | Moments: a robot physically pushes weights along rails on a locked plank. It also carried #6 and #7 into main | Merged |
| #6 | usmannsiddiqui | Two Microducks in one MuJoCo world, about 2x faster navigation that avoids the policy's dead zones, the cooperative Moments experiment, two-robot Pythagoras, a contact ledger and a prediction panel | Merged through #5 |
| #7 | usmannsiddiqui | Rayyan's two-bot demo drives the real MuJoCo robots (a SimAdapter over DuckSim), with live Claude for Pip and Nova | Merged through #5 |
| #8 | usmannsiddiqui | Landing page linked to the real console, scripted preview removed, glass windows | Merged |
| #9 | usmannsiddiqui | Experiment panel readable on the dark glass windows | Open |

**Known gaps on main**

- After Nova pushes a weight, Nova's handback says it *will* move it, in future tense, though the push already happened.
- Voice isn't wired on the two-bot page yet.
- Rayyan hasn't reviewed #7's changes to the SimAdapter contract yet.

## Who could take what next

Suggestions only. Confirm with Muhammad before starting, and keep to one branch each so nobody collides.

| Who | Feature | Branch |
| --- | --- | --- |
| Ammar | Voice on the two-bot page, reusing `/api/voice/*` | `two-bot-voice` |
| Ammar | Nova as a second agent in the lab console | `nova-in-console` |
| Ammar | Moments teaching flow: predict, run, explain | `moments-teaching-flow` |
| Rayyan | Review #7's SimAdapter changes and flag anything to undo | `simadapter-review` |
| Rayyan | Fix Nova's future-tense handback after a push | `nova-handback-tense` |
| Rayyan | Bring Ask Nova and the channel panel into `/console` | `ask-nova-in-console` |
| Rayyan | Autonomy budget: cap bot-to-bot hops before control returns to the learner | `autonomy-budget` |
| Muhammad | UI polish pass and PR #9 | `experiment-panel-glass` |
| Everyone | 90-second demo script and video before noon ET | none |

## Team rules

1. Cut each feature branch from fresh `main` (`git pull origin main` first) with a plain kebab-case name.
2. Push it, open a PR to `main`, merge with a merge commit. Nobody pushes to `main` directly.
3. Before opening the PR, run `pnpm check`. For UI changes, also run `pnpm test:e2e`. Paste failures with their output.
4. If `main` moves while you work, merge `main` into your branch rather than rebasing a branch someone else has pulled.
5. Keys go in `.env` only, shared in team chat, never in this doc, a commit or `agent-memory/`.

Code freeze is 10 AM ET today. Devpost is due at noon ET.
