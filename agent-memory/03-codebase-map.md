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
- `src/simulation/mjcf.ts`: `buildSceneXml(robotXml, props)` strips visual geoms, then adds the floor, walls and props (box or inline convex mesh; free, hinge, slide or fixed joints) and the STAND keyframe. A prop with `parent` becomes a nested body that moves with its parent, and never collides with anything further up its mount chain. The robot qpos comes first, then the dynamic props in MuJoCo's depth-first body order; a slide starts at its `rest` value.
- `src/simulation/duckSim.ts`: `DuckSim` loads the runtimes and policies, compiles kits, and runs a real-time 50 Hz loop on its own timer (`start/stop`). It also handles modes, fall recovery, `trigger(skill)`, `runTask(task)`, the `manual` twist, and reads for rendering (`readTrunk/readJoints/readProp`) and `status()`. For a kit with a hinged `plank` it holds a lock pin (locked, levelling or free) and a brake on every slide joint, applied before each physics substep. **Invariant:** a brake is off only while a `place_weight` task is pushing that weight; anything else re-brakes it where it stands.
- `src/simulation/tasks.ts`: `TaskRunner` is a pure controller from a `DuckTask` to `{vx, wz, trigger, brake, pin, done}` per step, with time budgets, push planning, and turn-creep and kick-start workarounds. `WorldView.balance` carries the measured pin state, plank angle and rail positions. It also runs `release_plank` (reports the settled tilt) and `lock_plank`. Tested in `tasks.test.ts`.
- `src/simulation/moments.ts`: `Driver` (turn on the spot, then walk; kick-starts a stopped gait; a goal just passed counts as reached, so it never orbits) and `PlaceWeight` (route to the lane behind a paddle, push to the mark, brake, step clear; refusals for no room or the wrong side). Its `DRIVE` numbers were measured against the walking policy.
- `src/simulation/rig.ts` builds the three.js rig from `kinematics.json` + `microduck.glb`, with a per-bot shell tint.
- `public/microduck/` holds the vendored upstream assets: MJCF, kinematics, GLB, 9 collision STLs, 7 ONNX policies, `PROVENANCE.md` and `SHA256SUMS`.

### Two robots and navigation (`two-duck-lab`)

- `src/simulation/mjcf.ts`: `buildSceneXml(robotXml, props, ducks)` duplicates the robot tree, actuators and sensors once per duck, with every name prefixed `<id>/`. The robots come first in qpos.
- `src/simulation/robot.ts`: `Robot` is one duck's runtime (Duckverse `DuckRuntime`). It resolves addresses through `actuator_trnid` and owns its observation, command, previous action, mode, fall recovery and `TaskRunner`. It only writes `ctrl[ctrlAdr]`.
- `src/simulation/duckSim.ts`: one world. Each control step: tasks → one inference per robot → 4 substeps, with the holds before each and the contact audit after each. Also the apparatus runner (`release_plank`/`lock_plank`), the `BalanceExperiment` and the `CrewPlan`.
  - Exposes `contacts()`, `touchForce()`, `perf` and `assertNoCrossTalk()`.
  - `place_weight` always runs on the weight's owner (`MOMENTS.weights[].owner`).
- `src/simulation/navigate.ts`: `Navigator` (`NAV` holds the measured commands). Pivot-then-walk with hysteresis, never commanding dead zones, settling before "arrived".
- `src/simulation/moments.ts`: `PlaceWeight` (the per-robot interaction state machine), `BalanceExperiment`, `momentsFor()` (moments from measured rails), `CrewPlan` (staged multi-robot plans).
- `src/simulation/tasks.ts`: `WorldView` carries `id`, `speed`, `others` and `touching`. `routeAround()` detours push approaches around movable props and the other robot.
- `src/sandbox/ExperimentPanel.tsx`: targets, prediction, run, and measured result. `SandboxScene` renders every robot, plus the walkway, the pivot stand and pin, the lock collar, and the paddle contact glow.
- `src/simulation/THIRD_PARTY.md`: what was adapted from microduck-simulator and ROSClaw Duckverse.
- **Invariant:** typed arrays over WASM memory (`model.geom_bodyid`, `data.qpos`, …) go stale when the heap grows. Read them fresh, or copy static ones. Out-parameters (e.g. `mj_contactForce`) need a `mujoco.DoubleBuffer`; a JS array never receives the result.

### packages/contracts additions (`src/lab.ts`, re-exported from index)

- `PropSpec` and `LabKit`, with builders `tile()` and `block()`, and kits `pythagorasKit()`, `momentsKit()`, `freeKit()` and `roomProps()`. Kits are listed in `KITS`. `PropSpec` also has `parent`, `anchor`, `range`, `damping` and `rest`, for props mounted on other props.
- `MOMENTS` holds the balance geometry (pivot, plank, paddles, the duck's lane and walkway, rail range, minimum gap, the two weights) and `railAt(side, cm)`. `momentsKit()` is built from it, and the push planner reads it. A weight's block plus paddle mass equals its labelled grams.
- `pythagorasSlots(a, b, origin)` and `slotFilled()`.
- `DuckTaskSchema` (Zod) is the tool contract for Claude. It includes `place_weight {target, cm 5–30}`, `release_plank` and `lock_plank`.
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

## Two-bot conversation demo (`apps/web/src/`, `?demo=two-bot`)

- `simulation/types.ts` is the only seam: `SimAdapter` (`snapshot`, `subscribe`, `propose`, `apply(task, version, signal?) → Promise`, `release`, `reset`). `apply` settles when the action finishes, fails (`reason: "failed"`) or the signal aborts it; the per-object lock is held until then. Results may carry a `summary` (the sim's measured words). No React or model imports under `simulation/`.
- `simulation/fake/` is the TEMPORARY stub (analytic world, 5–45 cm, instant). `simulation/real/` is the adapter over the two-robot `DuckSim`: `left-weight`/`right-weight` map to `MOMENTS.weights` (`weight-200` pushed by Pip, `weight-100` by Nova), `apply` runs `place_weight` on the owner and settles on its `task-done`, snapshots are measured rail positions (0.1 cm, polled every 100 ms, version bumps on every measured change), rails are 5–30 cm. `real/load.ts` boots DuckSim on the Moments kit; it is imported lazily, only for `?sim=mujoco`.
- `coordinator/` owns the ledger, per-bot state, abort/epoch, chain budget (2 calls, 1 hop; the cap counts talk time from call-1 dispatch and pauses while a bot acts), `actTimeoutMs` per action (default 60 s), and the world-version check on every action. A failed or measured action adds a `notice` with the sim's summary; a handback stays last.
- Invariants: every ledger event has a required `to`; bubbles, chips, gaze and aria all derive from `to` only; a late or stale result is dropped; Stop and Reset abort the chain.
- `presentation/` paces the room (one bubble, reading-time holds). It never changes the ledger or coordinator timing.
- `provider/mock.ts` is deterministic and offline. `provider/live.ts` (`?provider=live`, only when `/api/health` reports `liveAi`) calls `POST /api/two-bot/respond` in `apps/api/src/twoBot.ts` (Bedrock, server-side) and returns the same `Respond` labelled `live`, falling back to the mock (labelled `mock`) on any failure.

## Planned runtime components (from docs/ARCHITECTURE.md and the planning notes; not built)

World/experiment state, per-bot session, crew coordinator (turn/time/token budgets, object locks), speech router (binds the recipient at capture start), model service (OpenAI Responses with strict function tools), task executor, physical bot controller (MuJoCo + ONNX Microduck policy, outside React), presentation layer and lesson content packs.

## Product entry integration — 2026-10-25

- `src/main.tsx`: `/` renders `welcome/WelcomePage`; `/console`, `/lab` and nested `/lab/` paths lazy-load `sandbox/SandboxApp` outside StrictMode to boot physics once. `?demo=two-bot` remains a separately lazy-loaded teammate demo.
- `sandbox.html`: legacy console entry retained. Console Home links return to `/`.
- `src/welcome/`: imported landing UI and Arc controls; public artwork/font assets under `public/welcome/`. Landing balance example uses shared deterministic contracts but does not load MuJoCo or ONNX.
- Removed the old `App.tsx`, `App.module.css`, `world/LabScene.tsx`, and preview-only Zustand `state/lab.ts` plus its obsolete tests. The older map above is historical for those files. Shared contracts and teammate demo runtime remain.
- `tests/console-entry.spec.ts` and `tests/welcome.spec.ts` cover product navigation and landing interactions; sandbox specs exercise real physics at `/console` and the legacy `/sandbox.html` route.

## Workshop and camera — 2026-10-25

`SandboxScene` delegates view control to `LabCamera.tsx`, pure framing/pan math to `camera.ts`, and visual-only environment dressing to `Workshop.tsx`. Camera orientation remains fixed to `CAMERA_OFFSET`, preserving screen-relative robot commands. Bubble projection is independent. Workshop dressing preserves furniture collider dimensions; dock markings do not implement charging.
