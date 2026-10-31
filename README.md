# Kestrel

**Real robots. Real physics.** Kestrel is a browser science playground for ages 13–16. You tell two small walking robots, Pip and Nova, what to do. They walk across a 3D playground, push the apparatus with their bodies, and report what the physics simulator measured.

![The Kestrel console during the Robot rescue mission: Pip and Nova on the playground court, the one-way route map with distances in cm, Pip's battery and the Objectives board](docs/images/kestrel-console.webp)

The robots are Pollen Robotics Microducks running in MuJoCo, driven by trained ONNX walking policies. Robot and apparatus motion comes from the simulation, never from animation. If a push misses, you see it miss.

Built for HackPSU 2026.

## Try it in about a minute

Steps 1–4 need no API keys.

1. Start the app ([Run it locally](#run-it-locally)) and open http://127.0.0.1:5180/console.
2. **Objectives → Balance the beam.** The beam tips left: 200 g and 100 g, both 20 cm from the pivot. In the experiment panel, set the 200 g weight to 10 cm, pick a prediction and press **Run it with both robots**. Each robot walks to its own weight if it needs moving, pushes it along its rail to your mark and steps clear. Then the plank is released. Open the **Pip and Nova** window to see Pip hand Nova its part and each robot's measured result. When the simulator reads the plank within 1.5° of level for a full second, the XP bar fills. If it's close but not there, a hint says which weight to move and by how much.
3. **Robot rescue.** Read the distances on the one-way map, then type a route such as `B E H` (or say it). Pip walks it. Choose a longer path and Pip's battery runs out on the way.
4. **Free play → Pip vs Nova: fight!** The two robots face off, charge and crash into each other. Each clash sets off a cartoon explosion and knocks one of them over, and it gets back up on its own.
5. **With Claude configured:** open Pythagoras and ask "What is the Pythagorean theorem?" Pip answers in one-sentence think bubbles and pushes the 5×5, 4×4 and 3×3 squares onto the triangle, reporting each measured result. **Build it together** does the same build with both robots and no AI.

## What's real

- **Physics.** MuJoCo 3.11, compiled to WebAssembly, steps both robots and the apparatus in the browser every 5 ms.
- **Walking.** Pollen Robotics' ONNX policies run at 50 Hz per robot through ONNX Runtime Web: walk, sit/stand, get-up, two kicks, roll and peck. A robot that falls gets up with the get-up policy.
- **Pushing.** Robots move weights and tiles only by body contact. A weight's rail clamp lets go only after MuJoCo reports real paddle contact. A contact ledger records every robot–apparatus touch: force, impulse and penetration.
- **Measurement.** Distance walked, weight positions, plank tilt and slot distance all come from the simulator. Claude and the UI read them; neither one writes them.
- **Two robots, one world.** Pip and Nova have separate actuators and state. A check at model compile time rejects any address the two robots share.

Measured on October 25, in headless Chromium with fast-stepped physics (times are simulated seconds):

| Benchmark                        | Result                                                                                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two-robot balance, 5 target pairs | 5/5 completed, 0 falls. Weights stopped within 0.2 cm of their marks. The predicted side matched the measured side every time. 10.6–12.3 s per run |
| Navigation, 6 runs               | 6/6 arrived, 0 falls. Mean 4.2 s, mean final error 2.4 cm (90th percentile 3 cm)                                                                   |

The one-off benchmark scripts were retired on 2026-10-31 (they are in git history). The real-physics Playwright specs in `tests/` (for example `beam-xp-levels.spec.ts` and `triangle-build.spec.ts`) now check these behaviours.

## Lessons and objectives

| Lesson       | The learner                                                                                                         | The robots                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Robot rescue | Plans a path from A to the charger at H on a one-way map with distances, then says or types the letters             | Pip walks the marked links. The battery allows 420 cm of measured travel, so only the shortest of the four paths (310 cm) gets through |
| Pythagoras   | Counts the tiles: does 9 + 16 make 25?                                                                              | Push the 3×3, 4×4 and 5×5 squares onto the sides of a right triangle on the floor                                                      |
| Moments      | Sets where each weight goes, predicts which way the plank tips, runs it                                             | Each robot pushes its own weight (Pip 200 g, Nova 100 g) and steps clear. The measured tilt is compared with the moments               |
| Free play    | Drives Pip with the keyboard (WASD or arrows, Q/E kick, R sit/stand, F peck, T roll), or starts a Pip vs Nova fight | Walk, turn, kick and push blocks. In a fight: face off, charge, back off, repeat                                                       |

The **Objectives** board has three goals: Balance the beam, Build the right triangle and Rescue Pip, each worth 100 XP. Earned XP adds up to levels (Level 2 at 100 XP, Level 3 at 250), shown on the Objectives card with a bar to the next level. A bar fills only when the simulator measures the goal met, and confetti fires (not under reduced motion). Won objectives survive a reload. The browser keeps an anonymous learner ID (no name, no account) and stores wins locally. With `DATABASE_URL` set (Postgres, tables from `pnpm db:migrate`), the API also records each win, with the measured beam tilt and weight positions, and restores the board from it. `TIGER_DATABASE_URL` (Tiger Data) is used when `DATABASE_URL` is unset; the first `pnpm db:migrate` moves its old hypertable aside to `attempts_legacy` and copies the rows across.

With a migrated database, XP lives in a server-side **ledger**, an append-only log of awards. Level is worked out from the total when it is read, never stored. A Moments prediction on one of four XP setups (10/20, 15/20, 10/30, 15/30 cm) is locked with a server timestamp before the run, and the trial start is stamped too. Locking earns 10 XP, a right prediction 15, and a right prediction after an earlier wrong one 10. Each award comes once per learner and prompt, so retrying after Reset earns nothing more, and a prompt is worth at most 35. Each objective won adds 100. **XP is client-trusted until P4:** the browser reports what its simulator measured, and server-side replay verification comes later. Without a ledger, the board counts this browser's wins and says "offline". Only wins are logged so far.

## Pip vs Nova, just for fun

In Free play, press **Pip vs Nova: fight!** The two robots turn to face each other, charge at full walking speed, back off and go again. Their bodies really collide in MuJoCo. A clash counts when they close faster than 0.45 m/s to within 20 cm; charges measure 0.6–0.76 m/s, and ordinary walking sway stays under the threshold. Each clash draws a cartoon explosion and, with robot sound on, a boom synthesised in Web Audio, so there's no clip to license. One robot goes down, the winner gloats in the Pip and Nova window and the score ticks up. The loser gets back up with its own get-up policy. **Stop the fight**, Esc or Reset ends it.

Measured in a live browser: 9 clashes in 40 seconds, each knocking exactly one robot over, and every robot got back up.

Who falls is not physics. The loser is picked at random and knocked over by a scripted shove, a velocity kick added to its body, rather than by the crash itself.

## Talking to the robots

In the console, type a request or hold the talk button. The microphone records only while you hold it (in Rescue, tap to start and tap to finish). On release, the audio goes to ElevenLabs speech-to-text (Scribe v2) and the transcript is handled like typed text.

Claude Sonnet 4.6 on AWS Bedrock plans as Pip. It sees the measured world and has one tool, `duck_task`, which asks for a single bounded action: move, turn, push, place a weight, run the two-robot balance or square build, and a few others. The server and the browser both validate each action with Zod, the simulator runs it, and the measured result goes back to Claude. One request gets at most six actions, then a text-only summary.

The robots don't talk aloud. A reply is one short sentence in a pixel-art think bubble and in the **You and Pip** window, with a short robot sound. Nothing in the app calls text-to-speech.

The console has two collapsible windows, one open at a time; the browser remembers which. **You and Pip** is your conversation. **Pip and Nova** shows the two-robot jobs: when a task needs both robots (the balance test, the square build, or a move of Nova's weight), Pip hands Nova its part and each robot reports what the simulator measured. Those handoff lines are fixed templates written from the simulator's own plan. Nova is not a second language model.

Stop, Esc, Reset or a new request cancels the pending model call, the running action and any reply that arrives late.

The Rescue mission doesn't use a language model. Its transcript goes to a local parser that accepts only connected checkpoint letters and refuses negations, skipped junctions and backwards links.

Live checks on record (October 24–25, real Bedrock and ElevenLabs): "walk forward 20 cm" moved Pip 20 cm as measured, with a chirp and no speech call; "Can you balance the plank?" led Claude to compare 200 × 20 with 100 × 20 g·cm, move the 200 g weight to 10 cm, release the plank and report "It stayed level (0.0°)". A spoken request through ElevenLabs drove a measured walk. The browser tests mock Claude and speech-to-text; the physics in them is real.

## How it works

```text
Browser: everything physical happens here
  MuJoCo 3.11 (WASM)   two Microducks + apparatus, 5 ms physics steps
  ONNX Runtime Web     walking and skill policies, 50 Hz per robot
  Task runner          navigate, push, place weight, set balance, rescue route
  React Three Fiber    draws the measured pose; never sets it
        |                                         ^
        | text or audio, measured world           | one validated duck_task
        v                                         |
Fastify API on 127.0.0.1:5181 (keys stay on the server)
  POST /api/agent/turn         Claude Sonnet 4.6 on AWS Bedrock
  POST /api/voice/transcribe   ElevenLabs Scribe v2 speech-to-text
  /api/progress                optional: wins to Postgres (schema in apps/api/migrations)
  /api/locks, /api/attempts/start, /api/xp-events   XP ledger (client-trusted until P4)
```

Physics and policies never call the model per frame. The API accepts only local origins, runs at most four provider requests at once, and does not log or store request bodies, audio or transcripts. The progress route stores only the anonymous learner ID and measured numbers.

## Run it locally

Use Node 24 and pnpm 9.15.9:

```sh
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
pnpm dev
```

- http://127.0.0.1:5180 is the landing page. **Open the playground** goes to the lab at `/console`; `/lab` and `/sandbox.html` open the same console. API health: http://127.0.0.1:5181/api/health. Both servers bind to loopback.
- **Without keys**, physics, keyboard driving, the lesson buttons, the Moments experiment, typed Rescue routes and the objectives all work.
- **For Claude and voice**, copy `.env.example` to `.env` in the repository root and fill in your AWS credentials (or `AWS_PROFILE`), `AWS_REGION` and `ELEVENLABS_API_KEY`. `DATABASE_URL` is optional; without it, progress stays in the browser.
- **For a local database**, `pnpm db:up` starts Postgres 16 and ElasticMQ (a local SQS) with Docker Compose. Set `DATABASE_URL=postgres://kestrel:kestrel@127.0.0.1:5432/kestrel`, then `pnpm db:migrate` creates the tables. `pnpm --filter @kestrel/api db:migrate down all --yes` reverts them all, data included. Schema decisions are in [`docs/adr/`](docs/adr/). Keys stay on the server; never give them a `VITE_` prefix. Each request uses paid provider quota.
- To run it on one Ubuntu server behind Caddy, with the whole site behind a basic-auth login, follow [`docs/DEPLOY.md`](docs/DEPLOY.md).
- On a software WebGL renderer (SwiftShader, llvmpipe) the scene drops shadows and grass and renders at half resolution. Add `?hq` to the URL for full quality.

### Checks

```sh
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm check` runs the typecheck, unit and API tests, both builds and an API smoke test. `pnpm test:e2e` runs the browser tests on desktop and mobile; it starts `pnpm dev`, or reuses one already on port 5180. CI runs both on Node 24.

## Idealisations and limits

Named so you can judge the science:

- The lock pin and the rail clamps are kinematic holds: they set the joint position directly. A clamp holds a weight where its robot left it and never moves one.
- The plank's tilt stops at its ±0.1 rad joint limit, so most imbalances read about 5.8°.
- The predicted tilt is linear: net moment ÷ the balance's stiffness, as measured in MuJoCo. It matches within about 0.1° near balance and under-predicts by up to about 1° past 4°.
- The battery is a game rule, not a battery model: 420 cm of measured travel per charge.
- A square counts as placed within 4 cm of its slot. Nothing snaps into place.
- Balance the beam counts within 1.5° of level. The beam is stiff: with the 100 g at 20 cm, a 200 g weight 1 mm off its mark already tilts it about 0.5°, so the tolerance lets a push that lands 1–2 mm off still win.
- In the fight, the loser is chosen at random and knocked over by a scripted shove, not by the collision.

Not built:

- No grasping, no jumping (the base Microduck has no jump skill) and no hardware.
- The two robots share lanes by taking turns. They don't avoid each other.
- In Rescue, Pip follows the marked links. It doesn't plan its own path, and the parser understands checkpoint letters, not freeform directions.
- In the console, Claude speaks only as Pip, and the Pip-to-Nova handoffs are templates, not a conversation.
- No accounts: progress belongs to an anonymous browser ID. Kestrel isn't ready for unsupervised use by children.
- The landing page's hero image is concept art the owner made with Midjourney, not footage. Its three objective cards are real console screenshots.

## Credits and provenance

- **Robot and policies:** [Pollen Robotics microduck-simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator), copied unmodified. The app is Apache-2.0. Upstream doesn't state a separate licence for the meshes or policies, and ROSClaw Duckverse records the 3D models as CC BY-SA-NC, so treat the meshes as non-commercial with attribution until Pollen confirms. Details: [`apps/web/public/microduck/PROVENANCE.md`](apps/web/public/microduck/PROVENANCE.md).
- **Simulation runtime:** ported from microduck-simulator; the multi-robot world, navigation and contact audit adapt patterns from [ROSClaw Duckverse](https://github.com/ros-claw/microduck) (Apache-2.0). See [`apps/web/src/simulation/THIRD_PARTY.md`](apps/web/src/simulation/THIRD_PARTY.md).
- **Playground:** original procedural geometry and textures. The foliage and grass reimplement techniques from Bruno Simon's folio-2025 (MIT). See [`apps/web/src/sandbox/PROVENANCE.md`](apps/web/src/sandbox/PROVENANCE.md).
- **Console UI:** glass panels styled with tokens and components from a capture of the General Intelligence Company design system, set in Inter, with Pixelify Sans for the thought bubbles (both SIL OFL).
- **Landing page:** Grandstander display font (SIL OFL); hero concept art made by the owner with Midjourney.
- **Robot reply sound** (`apps/web/public/audio/bd1-reply.mp3`): an owner-supplied clip. Its source and licence are not yet recorded.

More references: [`THIRD_PARTY.md`](THIRD_PARTY.md).

## Repository

```text
apps/web/            React + Vite: landing page, console, playground scene, MuJoCo/ONNX simulation
apps/api/            Fastify routes, Bedrock agent, ElevenLabs speech-to-text, Tiger Data progress
packages/contracts/  Shared types and Zod schemas: tasks, lessons, rescue graph, agent messages
tests/               Playwright browser tests (desktop and mobile)
docs/judges/         Judging-table deck and a looping screen
deploy/              Caddyfile and deploy script for one server
agent-memory/        Shared notes for the coding agents working on this repo
```

Stack: TypeScript, React 19, React Three Fiber 9, Three.js, MuJoCo 3.11 WASM, ONNX Runtime Web, Fastify, Zod, Claude on AWS Bedrock, ElevenLabs and Tiger Data (TimescaleDB, via `pg`). Exact versions are in `pnpm-lock.yaml`.
