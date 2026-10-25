# Runbook

## Requirements

- Node **24 LTS** is the declared engine (`>=24 <25`, `.nvmrc` = 24); CI uses 24.
  - This Windows machine has Node **v22.23.1**. Everything below works on it with `Unsupported engine` warnings (verified 2026-10-24). Install Node 24 if anything version-specific breaks.
- pnpm **9.15.9** (via corepack): `corepack enable && corepack prepare pnpm@9.15.9 --activate`.
- Keys are optional for the scripted preview and local physics. Live Claude and voice calls need the server-side variables in `.env` below and incur provider usage charges.

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

This console runs the physical two-robot sandbox, with Pip and Nova in the shared MuJoCo world. It has live agent and voice routes when server credentials are configured. The root preview and `/?demo=two-bot` remain separate paths; check current source before relying on older notes below.

- Keyboard: W/S or ↑/↓ to walk, A/D or ←/→ to turn, Q/E to kick, R to sit/stand, F to peck, T to roll, Esc to stop the task. Click the canvas area first if keys don't respond (focus must not be in the text box).
- **Walk speed** slider in the duck console: 1× to 2× (0.25–0.50 m/s). It changes keyboard walking only. A Claude push uses the committed controller and ignores the slider.
- **Turn radius** slider: 0.15–0.60 m, default 0.25 m. It changes keyboard turns only. A push does not use it.
- Typed tasks: `push the 3 square to its slot`, `go to the 5 square`, `turn left 90`, `walk forward 30 cm`, `kick left`, `sit`, `stand`.
- Dev-only console handle: `window.kestrelSim`. For example, `kestrelSim.manual = {vx: 0.2, wz: 0}`, `kestrelSim.status()`, `kestrelSim.propPositions()`.
- Headless probing works with SwiftShader: `chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })`.

Things to try in the preview UI: "right weight to 40 cm" (balances the beam), "left weight to 10 cm", "hint", **Ask the crew** (two-turn scripted exchange), Stop, Reset.

## Checks

| Command | What it does | Time |
| --- | --- | --- |
| `pnpm typecheck` | `tsc --noEmit` across the workspace | fast |
| `pnpm test` | Vitest across contracts, API, simulation, agent session and two-bot mock | ~10 s |
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

`.env.example` (copy to `.env`, which is gitignored). The API process in `apps/api/src/index.ts` loads it from the repository root. Do not prefix secrets with `VITE_`; Vite must never receive provider keys.

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=XrExE9yKIg1WjnnlVkGX
PORT=5181
```

The optional paid checks are `node scripts/live-voice-check.mjs` (generated speech → Scribe, browser recording → Claude → movement → speech) and `node scripts/live-pythagoras-check.mjs` (Claude plus the physical squares, speech off). Start `pnpm dev` first. They are explicit and never run in CI. The live voice check used generated audio supplied to MediaRecorder; a person speaking through the physical room microphone remains untested.

## Production-ish

```sh
pnpm build
pnpm --filter @kestrel/web preview             # serves apps/web/dist on 5180
pnpm --filter @kestrel/api start               # node dist/apps/api/src/index.js
```

No hosting or deployment is configured.

## CI

`.github/workflows/ci.yml` runs on push to main and on PRs: Node 24, `pnpm install --frozen-lockfile`, `pnpm check`, Playwright install with deps, `pnpm test:e2e`. It uploads `test-results/` and `playwright-report/` on failure.

## Shell notes

- The owner's convention is to prefix shell commands with RTK when available. RTK is **not installed** on this machine; plain pnpm works.
- On Windows use Git Bash or PowerShell; scripts have no POSIX-only steps.

## Talking to the duck (voice + Claude)

Requirements: `pnpm dev` running and `.env` with `ELEVENLABS_API_KEY`, the AWS keys and `BEDROCK_MODEL_ID=global.anthropic.claude-sonnet-4-6`. `/api/health` should show `liveAi: true, speech: true`.

- **Speak:** hold **Hold to talk** (or Space when not typing), speak, then release.
- **Type:** everything typed in the box goes to Claude (Codex removed the fixed parser from the UI; `parseDuckTask` still exists in contracts but is unused there). Each request costs a Bedrock call.
- The speaker toggle starts on **Voice off**. Replies stay in the bubble and the chat. Turn it on for speech. **Stop** cancels everything.
- If a square that was in its slot gets knocked out, the duck says so in the bubble and the next push has to put that square back before it moves another one.

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

