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

- Responsive React interface, isometric Three.js room and two original procedural placeholder robots.
- Analytic mass × distance balance preview, sliders and a small supported typed-command grammar.
- Addressed messages, explicit bot-to-bot recipients, a two-turn exchange limit, stop/reset and a 30-message display cap.
- Shared Zod contracts, Fastify health/command skeleton, unit/integration tests and browser checks.

## What is not integrated yet

Live LLM conversation, microphone/STT, MuJoCo physics, ONNX walking, final Kestrel assets, navigation, physical manipulation, accounts and deployment. MuJoCo/ONNX/OpenAI dependencies are pinned integration foundations; package presence is not runtime capability. `/api/commands` validates requests and returns an explicit `501 PROVIDER_NOT_CONNECTED`.

The beam is an **ideal massless model** and its visual tilt is illustrative. Direct apparatus changes in this scaffold do not demonstrate a robot physically moving a weight. The UI explicitly labels scripted behavior.

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

## Build next

Follow [the roadmap](docs/ROADMAP.md), [product context](PRODUCT.md) and [design direction](DESIGN.md). Audit planning with [the Claude Code prompt](docs/prompts/claude-context-audit.md). Obsidian stays a private research/planning source; this repository contains a deliberately public-safe product summary.

No private vault dump, API keys or practice source is included. See [third-party references](THIRD_PARTY.md). Adding `.env` keys does not enable live features until their integration milestone is implemented. Production hosting and child-facing rollout need their own configuration and checks.
