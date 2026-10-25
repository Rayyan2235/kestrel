# Third-party code in `simulation/`

## pollen-robotics/microduck-simulator (Apache-2.0)

Hugging Face Space, revision `ad9d41a763f30dc770817c33d92dcfec0205db1e`. `robot.ts`,
`duckSim.ts` and `constants.ts` are a TypeScript port and trim of its `app/src/game/`
runtime: the 61-D observation, the 50 Hz policy step with 4 × 5 ms physics substeps,
mode handling (walk, sit/stand, kick, roll, peck) and fall recovery. Asset provenance
is in `apps/web/public/microduck/PROVENANCE.md`.

## ROSClaw Duckverse, ros-claw/microduck (Apache-2.0)

Audited at commit `1034ed000c352476cf213ebe1544eb8c7db8b0e7`. These patterns were
adapted and translated to TypeScript; no Python code is embedded.

| Kestrel | Duckverse source | What was adapted |
| --- | --- | --- |
| `mjcf.ts` (`buildSceneXml` with `DuckSpawn[]`) | [`src/microduck_lab/sim/composer.py`](https://github.com/ros-claw/microduck/blob/1034ed000c352476cf213ebe1544eb8c7db8b0e7/src/microduck_lab/sim/composer.py) | Several robots in one compiled world, every name namespaced `<id>/`, spawned in the home crouch rather than the XML's straight-leg qpos0. Duckverse uses `MjSpec.attach`; here the MJCF is duplicated with prefixes before compiling, because the browser build compiles from XML. |
| `robot.ts` (`Robot`) | [`src/microduck_lab/sim/runtime.py`](https://github.com/ros-claw/microduck/blob/1034ed000c352476cf213ebe1544eb8c7db8b0e7/src/microduck_lab/sim/runtime.py) (`DuckRuntime`) | Per-robot addressing through `actuator_trnid`, per-robot observation, command and previous-action buffers, `ctrl = DEFAULT_POSE + action`. |
| `navigate.ts` (`Navigator`) | [`src/microduck_lab/skills/navigate.py`](https://github.com/ros-claw/microduck/blob/1034ed000c352476cf213ebe1544eb8c7db8b0e7/src/microduck_lab/skills/navigate.py) (`WalkTo`, `TurnTo`) | Turn-to-face then walk, never commanding the gait's dead zone. The command magnitudes were re-measured for this policy, not copied: its lateral command (Duckverse's "lateral assist") produces no motion here, and pure turns need at least 1.6. |
| `duckSim.ts` (`audit`, `contacts()`) | [`src/microduck_lab/parkour/audit.py`](https://github.com/ros-claw/microduck/blob/1034ed000c352476cf213ebe1544eb8c7db8b0e7/src/microduck_lab/parkour/audit.py) (`Audit.sample`) | Every-substep contact ledger: body pair, first and last time, samples, normal impulse, peak force and maximum penetration, via `mj_contactForce`. |

Duckverse's `THIRD_PARTY.md` records the upstream robot 3D models (`pollen-robotics/microduck_rl`)
as CC BY-SA-NC, separately from the Apache-2.0 code. See the note in `PROVENANCE.md`.

Licensed under the Apache License, Version 2.0: http://www.apache.org/licenses/LICENSE-2.0
