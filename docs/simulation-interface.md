# Simulation interface v1

## Implementation plan

The local controller owns one shared world. Rendering consumes snapshots; external
senders request supported actions. Existing balance behavior is a development
fixture, not a choice of opening mission.

- [x] C0: additive contracts, render fixture and initial snapshot; isolated dev/test
      configuration. Validate malformed requests, run `pnpm check`, commit separately.
- [x] Runtime: implement `createSimulation` in `apps/web/src/simulation/runtime.ts`.
      First test measured execution, pinned recipient, stale/malformed input, duplicate
      IDs, apparatus contention, Stop/reset, late callbacks, controller failure and
      deterministic event order with a controlled clock. Run focused tests red/green.
- [x] Facade: migrate `apps/web/src/state/lab.ts` to runtime submission and results,
      retain scripted exchange and selection methods. Test completion timing and
      cancellation, expose a provider-free mock sender, run `pnpm check`, commit.

Review focus: mutated caller objects must not change accepted requests; observer
exceptions must not strand locks; synchronous observers must not reenter mutation;
duplicate IDs must not execute after reset; direct controls must obey ownership.
These cases are exercised in runtime/facade behavioral tests. Work stays in the
existing checkout; the interface and runtime are separate commits. No providers,
new dependencies or presentation edits are part of this slice.

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
reusing a request ID with another payload fails `REQUEST_ID_CONFLICT`. The local
session keeps up to 1,000 accepted request identities, including terminal and
pre-reset requests. At capacity it rejects new actions until a new runtime/session
is created. Reset does not erase deduplication history. An old retry returns its
historical result without publishing another event or changing the current world.

Events have monotonic sequence numbers and immutable snapshots. Action lifecycle:
received → validated → started → completed/failed/cancelled. Rejections never
replace an active action. Progress phases are approach → dock → operate → done.
The result reports actual authoritative quantities, never text-match success.
Submission rejections return an error and produce no action events. `lastSubmission`
is a receipt, not a live progress record; follow snapshot/events for progress.
Subscribers receive historical immutable event snapshots in sequence order;
`getSnapshot()` returns the newest state. A throwing subscriber is isolated from
the controller and other subscribers. Submitting from an event callback returns
`REENTRANT_CALL`; Stop/reset are supported there.

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

The runtime advances a fixed 50 ms simulation step per scheduled callback; a
throttled tab slows the authored animation instead of jumping to a late success.
Each action is bounded to 30 simulated seconds. It validates controller output
for finite positions, walkway bounds, maximum step distance, phase order,
docking position and minimum dock/operate durations. Failure releases ownership.
Stop leaves the bot at its current pose; reset restores both spawn poses. A
subsequent action reuses its bot-specific lane. The view must render published
poses rather than run its own navigation.

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

`submitAction(input)` also exists on the store, and `labSimulation` is the exported
adapter from `apps/web/src/state/lab.ts`. Motion timers run only during accepted
actions. `busy` includes both motion and scripted exchange. Starting an exchange
during motion does not queue stale observations. Starting an action invalidates
queued exchange turns; hints and selection do not cancel motion. `applyWeight`
now increments `World.version`; it remains a pure helper, not an adapter bypass.

## Executable integration example

Run this provider-free example from the repository root (it exits after completion):

```sh
pnpm exec tsx -e 'import { createSimulation } from "./apps/web/src/simulation/runtime.ts"; import { createMockSender } from "./apps/web/src/simulation/mock-sender.ts"; const sim = createSimulation(); sim.subscribe(e => { if (e.action?.status === "completed") console.log(e.action.result); }); const sender = createMockSender(sim, "pip", "demo"); sender.send(sender.prepareMove("right", 40));'
```

Use the application adapter in the UI. In a headless integration harness, replace
it with `createSimulation()` from `apps/web/src/simulation/runtime.ts`.

```ts
import { labSimulation } from "../state/lab.js";
import { createMockSender } from "../simulation/mock-sender.js";

const sender = createMockSender(labSimulation, "pip", "voice-demo-session-1");
const unsubscribe = labSimulation.subscribe((event) => {
  if (event.action?.status === "completed") console.log(event.action.result);
});
// Capture at input start, before asynchronous interpretation or selection changes.
const prepared = sender.prepareMove("right", 40);
const receipt = sender.send(prepared);
// Repeating sender.send(prepared) deduplicates; a new intent needs a new ID.
// labSimulation.stop() cancels motion; labSimulation.reset() restores the fixture.
// unsubscribe() when the integration no longer needs events.
```

`prepareMove` captures bot identity, world revision and reset generation. Give
each sender instance a unique short request prefix. Keep the prepared request
unchanged across retries. A delayed pre-reset request fails `STALE_WORLD`; read
a fresh snapshot and obtain a new user intent rather than silently refreshing it.
The mock invokes no provider and captures no microphone input.

Example payload at the initial world:

```ts
const request = {
  requestId: "voice-demo-session-1-1",
  botId: "pip",
  worldRevision: 0,
  resetGeneration: 0,
  action: "move-weight",
  stationId: "balance",
  objectId: "right-weight",
  parameters: { positionCm: 40 },
} satisfies import("@kestrel/contracts").ActionRequest;
```

Completion produces world revision 1, right position 40 cm, and:

```ts
const result = {
  leftGramCentimeters: 4000,
  rightGramCentimeters: 4000,
  leftNewtonMeters: 0.3924,
  rightNewtonMeters: 0.3924,
  balance: "balanced",
} satisfies import("@kestrel/contracts").BalanceMeasurement;
```

The current scaffold scene does not yet consume motion poses; combined rendered
action/reset evidence belongs to the presentation integration. Runtime tests
verify state and event behavior independently of WebGL.

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
