# Simulation interface v1

## Implementation plan

The local controller owns one shared world. Rendering consumes snapshots; external
senders request supported actions. Existing balance behavior is a development
fixture, not a choice of opening mission.

- [ ] C0: additive contracts, render fixture and initial snapshot; isolated dev/test
      configuration. Validate malformed requests, run `pnpm check`, commit separately.
- [ ] Runtime: implement `createSimulation` in `apps/web/src/simulation/runtime.ts`.
      First test measured execution, pinned recipient, stale/malformed input, duplicate
      IDs, apparatus contention, Stop/reset, late callbacks, controller failure and
      deterministic event order with a controlled clock. Run focused tests red/green.
- [ ] Facade: migrate `apps/web/src/state/lab.ts` to runtime submission and results,
      retain scripted exchange and selection methods. Test completion timing and
      cancellation, expose a provider-free mock sender, run `pnpm check`, commit.

Review focus: mutated caller objects must not change accepted requests; observer
exceptions must not strand locks; synchronous observers must not reenter mutation;
duplicate IDs must not execute after reset; direct controls must obey ownership.
These cases belong in runtime/facade behavioral tests.

## Boundary

`SimulationAdapter` exposes `getSupportedActions`, `getSnapshot`, `submit`,
`subscribe`, `stop` and `reset`. `submit` accepts unknown input and validates it.
The action payload is independent of text, microphones and model providers.
`ActionRequest` includes request ID, immutable addressed bot, world revision,
reset generation, station/object identity and explicit parameter units.

Only `move-weight` at station `balance` exists. Objects are `left-weight` and
`right-weight`; `parameters.positionCm` is 5–45 cm from the fixed pivot.
Requests outside this capability fail explicitly. One station owner at a time,
no queue: competing requests fail `BUSY`. Selection changes never retarget work.

World revision increments on apparatus changes and reset, not on motion or
event publication. Reset also advances reset generation. Stop cancels active
work, clears scheduled callbacks and fences callbacks already delivered by the
scheduler. Both release ownership. Identical retries return the prior record;
reusing a request ID with another payload fails `REQUEST_ID_CONFLICT`.

Events have monotonic sequence numbers and immutable snapshots. Action lifecycle:
received → validated → started → completed/failed/cancelled. Rejections never
replace an active action. Progress phases are approach → dock → operate → done.
The result reports actual authoritative quantities, never text-match success.

## Render fixture

`BALANCE_FIXTURE` is shared scene geometry. Ground is x/z in scene meters, y up;
heading 0 faces +z, +π/2 faces +x. Room spans x ±4.2, z ±3.35. Table center is
[0,0,-0.5], footprint 3.25 × 1.2, top y=0.85, pivot [0,1.34,-0.5], beam length 3.
The apparatus is an enlarged display: a distance in cm renders as `cm / 32`
scene meters, not a physical 1:1 scale.

Pip starts [-1.2,0,1.2], Nova [1.25,0,1.4]. Their approach lanes use x=-0.65
and +0.65 respectively via z=1.4, docking at z=0.8 facing π. Keep decorations
outside x[-1.6,1.65], z[0.4,1.8], and body radius ≤0.35. The authored controller
moves at 0.8 scene m/s, docks for 0.3 s and operates for 0.6 s before applying
the change. This is game-controlled station actuation, not learned walking,
physical gripping or collision simulation. Bot mass does not enter beam science.

The beam is ideal and massless. Results use mass × distance in g·cm and turning
effects in N·m with gravity 9.81 m/s². Tilt is illustrative; no angular dynamics.

`createSimulationSnapshot()` supplies a static initial fixture. The store field
is `useLab.simulation: SimulationSnapshot`; the runtime will update it without
an App timer hook. `simulation.mode` is `view-fixture` in C0 and
`game-controlled` with the runtime. `useLab.lastSubmission: ActionSubmission | null`
exposes submission rejection without replacing active work. The existing App
timer still owns scripted exchange delivery; runtime owns only action motion.
Existing `select`, `send`, `moveWeight`, `startExchange`,
`deliverExchange`, `stop`, `reset` remain. Sliders should submit once on release,
keyboard controls on keyup. C0 alone supplies static fixture state, not motion.

## Local isolation

Use Node 24 and pnpm 9.15.9 with frozen dependencies. UI defaults to port 5180,
API to 5181. `KESTREL_UI_PORT` selects UI/preview, `PORT` selects API, and
`KESTREL_API_PORT` selects the Vite API proxy target.

```sh
KESTREL_UI_PORT=5190 pnpm --filter @kestrel/web dev
PORT=5191 KESTREL_API_PORT=5191 KESTREL_UI_PORT=5190 pnpm dev
KESTREL_TEST_PORT=5192 pnpm test:e2e
```

Playwright starts a web-only server, refuses existing servers and uses a unique
readiness token for this checkout/process. Reserve ports with other developers
before starting servers. Headless unit tests need no server.
