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

Open http://127.0.0.1:5180. API health: http://127.0.0.1:5181/api/health. Both servers bind to loopback. No API key is needed for the scaffold.

Try **right weight to 40 cm**, **left weight to 10 cm**, or **hint**. Select Pip or Nova to choose a recipient. **Ask the crew** plays a bounded, two-turn scripted exchange using the current balance state. Stop and reset invalidate pending turns.

## What is implemented

- Responsive React interface on an open isometric Three.js lab floor.
- Pip and Nova as real Microduck robots in one shared MuJoCo world with a floor balance: the upstream MuJoCo WASM model and trained ONNX walking policy step at 50 Hz in the browser. Each weight request is a physical push: the policy walks the duck to the carriage's paddle and its body pushes the carriage along a detent rail to the requested notch, then it walks home. The learner can release the beam's lock and MuJoCo tips it toward the heavier turning effect.
- Open Space-style agent windows per bot (drag, snap, resize, minimise, close, arrange, Show lab, keyboard moves, remembered geometry) and a tabbed conversation sheet on phones.
- Analytic mass × distance balance fixture, sliders and a small supported typed-command grammar.
- Deterministic local action runtime with authored approach, docking and station operation, measured results, read-only snapshots, retry deduplication and exclusive station ownership. Controls submit actions; completion messages follow actual results.
- Addressed messages, explicit bot-to-bot recipients, a two-turn exchange limit, stop/reset and a 30-message display cap.
- Shared Zod contracts, Fastify health/command skeleton, unit/integration tests and browser checks.

## What is not integrated yet

Live LLM conversation, microphone/STT, final Kestrel assets, general navigation (ducks use fixed lanes and a small route planner), gripping, accounts and deployment. MuJoCo/ONNX/OpenAI dependencies are pinned integration foundations; package presence is not runtime capability. `/api/commands` validates requests and returns an explicit `501 PROVIDER_NOT_CONNECTED`.

The beam is an **ideal massless model** and its visual tilt is illustrative. The runtime still records whole-centimetre positions: a detent eases each pushed carriage onto its notch, a stopped push returns the carriage to its last recorded notch, and the runtime's bot pose is its fixture abstraction while the rendered body is MuJoCo's. A push the body cannot do (no room to stand between the weights, or the way blocked) fails with the bot's reason. Without a running Microduck body (tests, WebGL failure or a physics load error) the runtime falls back to its authored reference controller and the UI says so. Local browser tests use the Mac's GPU; software WebGL is too slow for the Microduck scene. The UI explicitly labels scripted behavior.

See [simulation interface v1](docs/simulation-interface.md) for typed requests, results, a provider-free mock sender, cancellation/revision semantics and scene coordinates. The balance is a development fixture; the first product physics mission remains open.

## Workspace

```text
apps/web/             React/Vite, CSS Modules, room, preview state, integration boundary
apps/api/             Fastify routes and future server-side provider integration
packages/contracts/   Types, Zod validation and deterministic preview model
PRODUCT.md            Intent, differentiators and unresolved product decisions
DESIGN.md             Visual reference, tokens and interaction requirements
docs/                 Architecture, build roadmap and Claude context-audit prompt
```

Core stack: TypeScript, React 19, Fiber 9, Three.js, Zustand, Radix Primitives, Motion, Fastify and Zod. Exact versions are in `pnpm-lock.yaml`. Dependencies were selected against current package metadata; the Microduck physics/policy tuple must still be integrated and benchmarked as a unit.

## Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs typecheck, unit/API tests and both builds. Browser tests cover desktop/mobile recipient selection, command effects, collaboration, stop/reset and overflow. CI runs these checks with Node 24.

For parallel checkouts, use `KESTREL_UI_PORT=5190 pnpm --filter @kestrel/web dev`
or `KESTREL_TEST_PORT=5192 pnpm test:e2e` after reserving a free port.
Playwright starts its own web-only server and refuses reuse. API configuration
uses `PORT` (server) and `KESTREL_API_PORT` (web proxy); defaults remain 5180/5181.

## Build next

Follow [the roadmap](docs/ROADMAP.md), [product context](PRODUCT.md) and [design direction](DESIGN.md). Audit planning with [the Claude Code prompt](docs/prompts/claude-context-audit.md). Obsidian stays a private research/planning source; this repository contains a deliberately public-safe product summary.

No private vault dump, API keys or practice source is included. See [third-party references](THIRD_PARTY.md). Adding `.env` keys does not enable live features until their integration milestone is implemented. Production hosting and child-facing rollout need their own configuration and checks.
