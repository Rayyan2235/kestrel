# Codebase map

pnpm workspace: `apps/*`, `packages/*`. TypeScript everywhere, ESM, one root `tsconfig.json` (bundler resolution, `noEmit`).

## packages/contracts (`@kestrel/contracts`)

`src/index.ts` is the shared truth for types and science. It is imported raw as TS by both apps (exports `./src/index.ts`).

- `BotSchema` = `"pip" | "nova"`. Adding a bot starts here.
- `CommandSchema` = `{ botId, text (1–500, trimmed), worldVersion }`, strict.
- `World` = `{ version, leftCm, rightCm, leftGrams: 200, rightGrams: 100 }`. Masses are fixed today.
- `balance(w)` compares mass × distance and returns `left | right | balanced`.
- `applyWeight(world, side, cm, version)` throws on a stale version or cm outside 5–45, and returns a new world. It does **not** bump `version`.
- `messageFor(command, world)` is the scripted grammar: `(move the) left|right (weight) (to) N cm` and `why|hint|explain`. Anything else gets a "scripted preview understands…" reply with no action.
- `previewExchange(botId, world)` returns exactly two addressed messages, initiator → peer, then peer → initiator, grounded in `balance()`.

Tests: `src/index.test.ts`.

## apps/web (`@kestrel/web`)

- `src/main.tsx` is the React root.
- `src/App.tsx` holds the whole shell: header and info dialog (Radix), room section (mission card, lazy `LabScene`, latest-bubble overlay, measurement sliders), crew conversation panel (log capped at 30, empty state, "Give me a hint"), and the dock (Pip/Nova selector, command form, Ask the crew/Stop, Reset). The exchange delivery timer lives here: 650 ms for the first turn, 1100 ms after that.
- `src/state/lab.ts` is the Zustand store `useLab`: `selected, world, messages, busy, epoch, queued, nextTurn`, plus actions `select, moveWeight, send, startExchange, deliverExchange, stop, reset`.
- `src/world/LabScene.tsx` is the R3F `Canvas` (orthographic, shadows): procedural `Robot` (clickable, selection ring, idle sway that respects reduced motion), `BalanceStation` (beam damps to ±0.12 rad), `Room`, `Plant`, and an error boundary plus `fallback` for missing WebGL.
- `src/styles/tokens.css` and `global.css` hold design tokens (see DESIGN.md). Components use `App.module.css`.
- `src/simulation/README.md` marks the MuJoCo/ONNX integration boundary. Nothing is loaded yet.
- `vite.config.ts` sets up the React plugin and proxies `/api` to 5181.

Tests: `src/state/lab.test.ts`.

### Lab sandbox (new, `/sandbox.html`)

- `sandbox.html` and `src/sandbox/main.tsx` are a separate Vite entry, without StrictMode so the WASM runtimes boot once. `vite.config.ts` builds both pages.
- `src/sandbox/SandboxApp.tsx` holds the lesson picker, lesson card and slot chips, the duck console (telemetry, log, task input, skill buttons), keyboard control and the bubble state. In dev only it exposes `window.kestrelSim`.
- `src/sandbox/SandboxScene.tsx` is the R3F scene: room and chalkboard, `PropMesh` (one per `PropSpec`, posed from MuJoCo each frame), slots and the triangle outline, the duck rig, the isometric follow camera, and the DOM bubble projected above the duck.
- `src/simulation/constants.ts` holds the upstream policy interface (61-D observation, 14 actions, 50 Hz), policy paths, velocity limits and room size. **Do not change the interface constants.**
- `src/simulation/mjcf.ts`: `buildSceneXml(robotXml, props)` strips visual geoms, then adds the floor, walls and props (box or inline convex mesh; free, hinge or fixed joints) and the STAND keyframe. The robot qpos comes first, then the dynamic props in order.
- `src/simulation/duckSim.ts`: `DuckSim` loads the runtimes and policies, compiles kits, and runs a real-time 50 Hz loop on its own timer (`start/stop`). It also handles modes, fall recovery, `trigger(skill)`, `runTask(task)`, the `manual` twist, and reads for rendering (`readTrunk/readJoints/readProp`) and `status()`.
- `src/simulation/tasks.ts`: `TaskRunner` is a pure controller from a `DuckTask` to `{vx, wz, trigger, done}` per step, with time budgets, push planning, and turn-creep and kick-start workarounds. Tested in `tasks.test.ts`.
- `src/simulation/rig.ts` builds the three.js rig from `kinematics.json` + `microduck.glb`, with a per-bot shell tint.
- `public/microduck/` holds the vendored upstream assets: MJCF, kinematics, GLB, 9 collision STLs, 7 ONNX policies, `PROVENANCE.md` and `SHA256SUMS`.

### packages/contracts additions (`src/lab.ts`, re-exported from index)

- `PropSpec` and `LabKit`, with builders `tile()` and `block()`, and kits `pythagorasKit()`, `momentsKit()`, `freeKit()` and `roomProps()`. Kits are listed in `KITS`.
- `pythagorasSlots(a, b, origin)` and `slotFilled()`.
- `DuckTaskSchema` (Zod) is the tool contract for the future LLM.
- `parseDuckTask(text, props)` is the deterministic grammar for typed commands and transcripts. `resolveProp()` maps phrases like "the 3 square" or "five by five" to ids.

## apps/api (`@kestrel/api`)

- `src/app.ts` has `buildApp()`, a Fastify app with a 16 KB body limit.
  - `GET /api/health` returns `{ name, mode: "scaffold", capabilities: { liveAi:false, speech:false, mujoco:false } }`.
  - `POST /api/commands` returns 400 `INVALID_COMMAND` when the body fails `CommandSchema`, and otherwise 501 `PROVIDER_NOT_CONNECTED`.
- `src/index.ts` listens on 127.0.0.1:`PORT` (5181) and shuts down cleanly on signals.
- `openai` SDK is a dependency but unused.

Tests: `src/app.test.ts`. Compiled smoke test: `scripts/check-api.mjs`.

## tests/ (Playwright)

`tests/lab.spec.ts`:

1. Full learner loop: select Nova, balance, exchange, reset. Also checks for no page errors and no horizontal overflow.
2. Stop interrupts the exchange; unsupported input leaves the world unchanged.
3. Chat auto-scroll after the 30-message cap and on reopen.

## Invariants the code enforces (keep them, and test any change to them)

- **Epoch token:** `startExchange` returns an epoch. `deliverExchange(token, turn)` drops anything whose token ≠ current epoch, whose turn is out of order, or that is repeated. Stop, reset, `send` and `moveWeight` all bump the epoch, which cancels pending turns.
- **Recipient capture:** the exchange's speakers are fixed when it starts. Changing selection mid-exchange does not reroute it.
- **World version:** rejects stale actions. Only `reset` bumps it today. Live model actions will need every world edit to bump it.
- **Turn cap:** `previewExchange` yields exactly 2 turns.
- **Display cap:** 30 messages.
- **Unsupported input** never mutates the world.
- **Science comes from `balance()`**, never from message text.

## Planned runtime components (from docs/ARCHITECTURE.md and the planning notes; not built)

World/experiment state, per-bot session, crew coordinator (turn/time/token budgets, object locks), speech router (binds the recipient at capture start), model service (OpenAI Responses with strict function tools), task executor, physical bot controller (MuJoCo + ONNX Microduck policy, outside React), presentation layer and lesson content packs.
