# Kestrel

**A little world of why.** An interactive science lab with tiny robot companions, an inviting 3D world, and a crew that can compare notes together.

Kestrel is a fresh HackPSU product repository. Its core differentiators are embodied bot interaction, exceptional UI inspired by Open Space, and bot-to-bot collaboration around shared experiments.

## Start locally

Use Node 24 LTS and pnpm 9.15.9:

```sh
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5180 for the landing page, then choose **Open console** to enter the real lab at `/console`. `/lab` and `/sandbox.html` also open the console for existing bookmarks. The old scripted preview screen has been removed. API health: http://127.0.0.1:5181/api/health. Both servers bind to loopback.

The landing page loads without starting the simulator. The console runs Microduck physics locally; live conversation and voice need the server credentials documented in `.env.example`. Keep credentials in the root `.env` (never commit it). Each teammate supplies their own local configuration.

To run it on one Ubuntu server behind Caddy, follow [docs/DEPLOY.md](docs/DEPLOY.md).

## What is implemented

- Illustrated landing page, an independent interactive balance example, companion concepts and **Open console** navigation.
- Real MuJoCo/ONNX Microduck simulation in the console, with keyboard driving, Pythagoras squares, a Moments setup and free play.
- Typed conversation and actions through Claude on Bedrock, hold-to-talk and spoken replies through ElevenLabs when configured. Stop and Reset cancel pending actions.
- Purple-tinted glass windows, noir/amethyst/silver colors, pill controls, responsive layouts and reduced-motion support.
- The separate teammate conversation demo remains at `/?demo=two-bot`; it is experimental and uses a mock provider/stub simulation. It is not the console entry point.

## Current boundaries

Landing artwork depicts the intended companions, not runtime footage. The landing balance illustration uses an ideal mass × distance model; the console uses simulated physics. Physical lifting, final robot art, accounts and production hosting remain separate work.

## Workspace

```text
apps/web/             React/Vite landing page, real console, CSS Modules and simulation
apps/api/             Fastify routes, Bedrock agent, ElevenLabs voice and Tiger Data progress
packages/contracts/   Types, Zod validation and deterministic preview model
PRODUCT.md            Intent, differentiators and unresolved product decisions
DESIGN.md             Visual reference, tokens and interaction requirements
docs/                 Architecture, build roadmap and Claude context-audit prompt
```

## Lab sandbox: two Microducks in MuJoCo (`/sandbox.html`)

- Two policy-controlled Microducks, Pip and Nova, share one MuJoCo world with the apparatus. They walk with the upstream ONNX walking policy at 50 Hz; their motion comes from the policy's joint targets and MuJoCo contact.
- **Moments:** a hinged beam with a 200 g and a 100 g weight on rails. Each robot pushes its own weight's paddle along its rail. The learner sets the targets, predicts, and runs the experiment: lock, push, withdraw, verify clear, release, then a measured tilt compared with the moments from the measured positions. Idealised parts: the lock pin and the rail clamps are kinematic holds (a clamp holds a carriage where a robot left it; it never moves one).
- **Pythagoras:** square tiles pushed onto a floor triangle (9 + 16 = 25). The robots can build it together.
- Claude (Bedrock) can drive the same tasks. ElevenLabs transcribes the learner's voice; the robots answer with a short robot sound, and their words appear in a think bubble and the log. Both need server keys in `.env`.
- **Objectives:** Balance the beam, Build the right triangle and Rescue Pip, each with an XP bar that fills only when the simulator measures the goal met (for the beam: the released plank reads level, under 0.5°, for one second).
- **Progress that survives refresh:** each browser keeps an anonymous learner ID (no name or account). A won objective is stored in `localStorage` and, when `TIGER_DATABASE_URL` is set, as a row in a Tiger Data (TimescaleDB) hypertable `attempts` with the measured beam tilt and weight positions. `POST /api/progress` records an attempt; `GET /api/progress/:learner` returns earned objectives and attempt counts. Without the database both return 503 and the browser copy is used. Only wins are logged today.
- **Free play fight:** Pip and Nova face each other, charge and back off in rounds; their bodies really collide in MuJoCo. A fast clash (closing faster than 0.45 m/s into 20 cm) draws a cartoon explosion, and a loser chosen at random is knocked over by a scripted shove (a velocity impulse, not crash physics); it gets back up with its own get-up policy.
- **Console windows:** You and Pip, and Pip and Nova, are collapsible. Pip and Nova shows the simulator's two-robot handoffs and each robot's measured result; Nova is not a separate language model.
- Not yet: robot avoidance while both walk the same lane (lanes are scheduled instead), grasping, a jump skill, hardware.

Core stack: TypeScript, React 19, Fiber 9, Three.js, Zustand, Radix Primitives, Motion, Fastify and Zod. Exact versions are in `pnpm-lock.yaml`. The Microduck physics and walking-policy integration runs in the console.

## Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs typecheck, unit/API tests and both builds. Browser tests cover desktop/mobile landing navigation, lazy simulator loading, commands, stop/reset and the separate two-bot demo. CI runs these checks with Node 24.

## Build next

Follow [the roadmap](docs/ROADMAP.md), [product context](PRODUCT.md) and [design direction](DESIGN.md). Audit planning with [the Claude Code prompt](docs/prompts/claude-context-audit.md). Obsidian stays a private research/planning source; this repository contains a deliberately public-safe product summary.

No private vault dump, API keys or practice source is included. See [third-party references](THIRD_PARTY.md). The API loads the root `.env` for configured voice and AI providers. Production hosting and child-facing rollout need their own configuration and checks.
