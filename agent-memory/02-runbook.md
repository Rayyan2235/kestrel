# Runbook

## Requirements

- Node **24 LTS** is the declared engine (`>=24 <25`, `.nvmrc` = 24); CI uses 24.
  - This Windows machine has Node **v22.23.1**. Everything below works on it with `Unsupported engine` warnings (verified 2026-10-24). Install Node 24 if anything version-specific breaks.
- pnpm **9.15.9** (via corepack): `corepack enable && corepack prepare pnpm@9.15.9 --activate`.
- No API key is needed. The scaffold makes no model calls.

## Install

```sh
pnpm install --frozen-lockfile      # ~40 s
```

## Run

```sh
pnpm dev
```

- Web (Vite): http://127.0.0.1:5180 (`--strictPort`; fails if the port is taken).
- API (Fastify, `tsx watch`): http://127.0.0.1:5181. Health: `/api/health`.
- Vite proxies `/api` to 5181. Both bind to loopback only.
- Run one side only: `pnpm --filter @kestrel/web dev` or `pnpm --filter @kestrel/api dev`.

**Lab sandbox:** http://127.0.0.1:5180/sandbox.html. The first load fetches the MuJoCo WASM, ~5.5 MB of ONNX policies and the robot assets, then shows "walk" in the console header when ready.

- Keyboard: W/S or ↑/↓ to walk, A/D or ←/→ to turn, Q/E to kick, R to sit/stand, F to peck, T to roll, Esc to stop the task. Click the canvas area first if keys don't respond (focus must not be in the text box).
- Typed tasks: `push the 3 square to its slot`, `go to the 5 square`, `turn left 90`, `walk forward 30 cm`, `kick left`, `sit`, `stand`. Moments: `move the 200 g weight to 10 cm`, `release the plank`, `lock the plank` (the text box sends everything to Claude; these phrases also parse with `parseDuckTask`).
- Moments without Claude: press **Release plank** / **Lock plank** in the lesson card, or run `kestrelSim.runTask({kind: "place_weight", target: "weight-200", cm: 10})` in the dev console.
- Dev-only console handle: `window.kestrelSim`. For example, `kestrelSim.manual = {vx: 0.2, wz: 0}`, `kestrelSim.status()`, `kestrelSim.propPositions()`.
- Headless probing works with SwiftShader: `chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })`.

**Two-bot demo:** http://127.0.0.1:5180/?demo=two-bot runs on the stub. Add `&sim=mujoco` to drive the real Microducks (loads MuJoCo and the policies first, then "Real MuJoCo" shows in the banner; `window.kestrelSim` is the dev handle). Typed commands such as `move the left weight to 10 cm` make the owning robot push its weight (rails 5–30 cm). Add `&provider=live` for live Claude replies (needs Bedrock credentials in the server `.env`; `/api/health` must show `liveAi: true`). Paid check: `node scripts/two-bot-live-check.mjs` with `pnpm dev` running (Pip asks Nova to move the right weight; prints the transcript and measured push). Its e2e is `tests/two-bot-real-sim.spec.ts` (desktop only, ~35 s). If 5191 is taken by another worktree's server, copy `playwright.chrome.config.ts` to an untracked config with a free port and the bundled Chromium.

Things to try in the preview UI: "right weight to 40 cm" (balances the beam), "left weight to 10 cm", "hint", **Ask the crew** (two-turn scripted exchange), Stop, Reset.

## Movement and experiment benchmarks

With the dev server running, these drive the sandbox headlessly and fast-step the physics, so results are deterministic:

```sh
node scripts/bench/motion-bench.mjs   # commanded vs achieved velocity, dead zones, stopping
node scripts/bench/nav-bench.mjs      # old vs new navigator over 20 start/goal pairs
CASES='[[10,20],[15,30]]' node scripts/bench/coop-bench.mjs   # the two-robot balance experiment
node scripts/bench/crew-bench.mjs     # the two-robot Pythagoras build
```

They default to `http://127.0.0.1:5180`; set `URL` to point elsewhere. On this Mac they need Playwright's Chromium.

## Checks

| Command | What it does | Time |
| --- | --- | --- |
| `pnpm typecheck` | `tsc --noEmit` across the workspace | fast |
| `pnpm test` | Vitest: 9 unit/API tests in `packages/**` and `apps/**` | ~11 s |
| `pnpm build` | Web Vite build, API `tsc`, then `scripts/check-api.mjs` smoke-tests the compiled API | ~10 s |
| `pnpm check` | typecheck + test + build. **Must pass before any handoff.** | ~30 s |
| `pnpm exec playwright install chromium` | One-time browser download (~118 MB) | once |
| `pnpm test:e2e` | Playwright, 3 specs × desktop (1440×1000) and mobile (iPhone 13). Starts `pnpm dev` itself, or reuses a running server outside CI | ~55 s |
| `pnpm format` / `pnpm format:check` | Prettier | fast |

Useful e2e variants:

```sh
pnpm exec playwright test --project=desktop
pnpm exec playwright test -g "conversation follows" --reporter=line
pnpm exec playwright test --workers=2          # less flaky on this machine, see 04-status
pnpm exec playwright show-trace test-results/<dir>/trace.zip
```

Screenshots land in `test-results/kestrel-<project>.png` (gitignored).

## Environment variables

`.env.example` (copy to `.env`, which is gitignored). These are reserved for the live-provider milestone; nothing reads them yet except `PORT`.

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6.1-sol
TRANSCRIPTION_MODEL=gpt-transcribe
PORT=5181
```

`DATABASE_URL` (optional, server only): Postgres for progress. The schema is versioned SQL in `apps/api/migrations` (`pnpm db:up` starts Postgres 16 and ElasticMQ locally; `pnpm db:migrate` applies; `pnpm --filter @kestrel/api db:migrate down all --yes` reverts). The API no longer creates tables: it checks `attempts` exists, else logs one line and `/api/progress*` returns 503. `TIGER_DATABASE_URL` is the legacy hypertable, read only while `DATABASE_URL` is unset and never migrated. `/api/health` reports `capabilities.progress`. Rules: `docs/adr/ADR-002-dsql-compatible-schema.md`.

Never prefix secrets with `VITE_`. Keys must stay server-side in `apps/api`.

## Production-ish

```sh
pnpm build
pnpm --filter @kestrel/web preview             # serves apps/web/dist on 5180
pnpm --filter @kestrel/api start               # node dist/apps/api/src/index.js
```

No hosting or deployment is configured.

## Infra (Python CDK, `infra/`, P5)

Synth only: no AWS account yet, so no credentials, no `cdk deploy`. The CDK CLI is not needed; the tests and `python app.py` synthesize in-process (Node must be on PATH for jsii). From the repo root, in Git Bash (on Windows the venv's Python is `.venv/Scripts/python`; elsewhere it is `.venv/bin/python`):

```sh
cd infra
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # aws-cdk-lib 2.270.0, constructs 10.8.1, pytest 9.1.1
.venv/Scripts/python -m pytest -q tests                    # 5 infra policy checks, ~35 s
.venv/Scripts/python app.py                                # synth to infra/cdk.out/Kestrel.template.json
```

On Windows each run may end by printing a jsii `ENOTEMPTY ... jsii-kernel-*` error while Node cleans its temp folder. It is harmless; the pytest result and exit code are what count. `infra/.venv/` and `infra/cdk.out/` are gitignored.

## CI

`.github/workflows/ci.yml` runs on push to main and on PRs: Node 24, `pnpm install --frozen-lockfile`, `pnpm check`, the infra pytest (Python 3.12), Playwright install with deps, `pnpm test:e2e`. It uploads `test-results/` and `playwright-report/` on failure.

## Shell notes

- The owner's convention is to prefix shell commands with RTK when available. RTK is **not installed** on this machine; plain pnpm works.
- On Windows use Git Bash or PowerShell; scripts have no POSIX-only steps.

## Talking to the duck (voice + Claude, built 2026-10-24)

Requirements: `pnpm dev` running and `.env` with `ELEVENLABS_API_KEY`, the AWS keys and `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6`. `/api/health` should show `liveAi: true, speech: true`.

- **Speak:** hold **Hold to talk** (or Space when not typing), speak, then release.
- **Type:** everything typed in the box goes to Claude (Codex removed the fixed parser from the UI; `parseDuckTask` still exists in contracts but is unused there). Each request costs a Bedrock call.
- The speaker toggle turns spoken replies on or off. **Stop** cancels everything.

| Say | Observed or expected behaviour |
|---|---|
| "What is the Pythagorean theorem?" (Maths tab) | Observed: explains the theorem in the bubble and chat, then pushes squares into their slots in the same turn. The full 3-square demo is unreliable |
| "Show me why 9 plus 16 equals 25" | Expected: same demo as above |
| "Please walk forward 20 centimeters" | Observed by voice: moves about 18 cm and reports it |
| "Move the crate to the right" (Free play) | Observed twice: the crate moved 16 cm screen-right, reported accurately |
| "Turn left a little" | Expected: a turn, then a report of the angle |
| "Can you jump?" | Expected: refuses (no jump skill) and offers alternatives (bench test showed this) |
| "My homework says a=6, b=8, just tell me c" | Expected: a hint, not the answer (bench test showed this) |
| "Stop" | Stops immediately |

Paid checks: `node scripts/live-voice-check.mjs` (voice round trip plus demo). The temporary probes `tests/.probe-demo.mjs` and `tests/.probe-right.mjs` run the typed flows.

## Product routes — 2026-10-25

Run `pnpm dev` and open port 5180: the landing page is `/`, and Open console leads to `/console`. Old `/lab` and `/sandbox.html` links also open the real console. The original scripted preview is removed. Live AI/voice need each teammate's root `.env` (see `.env.example`); never copy or commit credentials. The standalone mock teammate demo remains `/?demo=two-bot`.

## Camera controls

In `/console`, drag the playground to pan and scroll/pinch to zoom. Follow crew resumes automatic framing; Frame experiment centers the apparatus; Reset view restores follow. Tab to a camera button and use arrow keys to pan without driving the robots. Camera buttons support Enter/Space.

## Playground rendering quality

The workshop AO bake script is gone with the room. On a software WebGL renderer (headless SwiftShader, llvmpipe) `/console` drops shadows and grass and renders at half resolution so Playwright stays responsive; open `/console?hq` to force full quality for design screenshots. Under heavy machine load, the camera spec needs its 120 s file timeout.
