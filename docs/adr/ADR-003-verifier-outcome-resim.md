# ADR-003: Verify outcomes by re-simulation and plausibility, not by replay

- Status: accepted, 2026-10-31
- Context: [ADR-001](ADR-001-serverless-free-tier.md), upscale plan P3 (determinism spike) and P4 (async verifier)

## Context

XP for an objective is client-trusted today. P4 adds a server-side verifier: a Python Lambda behind SQS that decides whether an attempt really met its objective. The plan's first design was replay. The browser logs each 50 Hz control step's inputs, the verifier replays them in native MuJoCo + ONNX Runtime, and it checks the same outcome predicate. If replay agreed with the browser in about 95% of attempts or more, it would be the verifier. Otherwise the plan falls back to plausibility checks.

P3 measured it with a spike harness: a browser recorder and a Python replay. They are not in the repo, because the decision below is not to replay; the scene port they used is (`verifier/kestrel_verifier/scene.py`).

- **The port is exact.** The Python scene builder (`verifier/kestrel_verifier/scene.py`, a port of `mjcf.ts`) compiles the same model as the browser in 20/20 attempts: every compared field (masses, inertias, geom sizes, friction, joint ranges, damping, actuator gains, keyframe) differs by 0. The initial state built from the attempt's params is identical.
- **Walking diverges chaotically.** Both runs use MuJoCo 3.11.0 and ONNX Runtime 1.27.0, as WebAssembly in the browser and native in Python. They agree to about 1e-8 m for the first 50 control steps, and a standing robot stays within 1e-9 for 1,000 steps. A walking robot's position error doubles roughly every 10 control steps (0.2 s): 1 mm after 4.5 s, 3.5 cm after 6 s, then tens of centimetres. The cause is float-level differences between WASM and native kernels, which the gait amplifies. It is not a port error.
- **Replaying commands cannot follow a drifted trajectory.** The browser's task layer is closed-loop: each command depends on where the robot actually is. The log can only carry the commands, so the replay runs them open-loop.
- **"Build it together", 20 attempts (tile starts jittered ±5 cm):**
  - Outcome agreement 4/20 = **20%**, and all 4 are attempts that failed on both sides. 0/16 browser successes reproduced; the Python props end 56-88 cm from the browser's.
  - Replay time p50 6.4 s, p99 7.9 s per about 4,000 control steps (80 s of sim) on a Windows x86 laptop.
- **Side finding:** under the same ±5 cm start jitter, the browser build itself failed 4/20 (robots fell). The triangle task is not yet robust to start perturbation.
- **"Balance the beam":** 20 near-balance attempts were recorded. Their replay applies the client-logged rail clamp positions, which set where the weights end up. So any agreement there would come from trusting client state, which is the problem below.

## Threat model

The attacker is a learner, or a script posing as one, who wants XP without doing the work. They control everything the browser sends.

1. **Scene and initial state.** Masses, positions, friction or the starting layout could be edited so the outcome comes easily. *Mitigation:* the verifier never takes a scene or initial state from the client. It builds the scene from its own pinned assets: the robot MJCF, meshes and policies, with `SHA256SUMS`, and `verifier/kits/*.json`, which a contracts test keeps equal to the lab kits. The initial state comes from the attempt's server-stamped params. The browser's compiled model is recorded only for comparison.
2. **Commands.** The client could send commands the gait cannot produce, such as a 5 m/s twist. *Mitigation:* clamp every replayed or checked command to the policy's legal range: vx -0.4 to 0.65, wz ±3.6, lateral 0.
3. **Apparatus state.** Rail clamp positions and pin events are client inputs, and a clamp position teleports a weight. *Mitigation:* the verifier ignores them and derives clamp behaviour from its own rules.
4. **Outcome claims.** The client could claim "level" or "3/3". *Mitigation:* the client's claim is never the verdict. The server computes the verdict from the stamped decision, or from checks on the trajectory.
5. **Replaying someone else's log.** *Mitigation:* each attempt is bound to its learner, lock and server-stamped `trial_started_at` (P1). The ledger's unique key awards once.

## Decision

The verifier does not replay motor commands. Per objective:

- **Moments (beam):** re-simulate the outcome from the learner's decision, which is the left and right rail marks in the stamped attempt.
  - The verifier builds the moments scene, sets each weight at its mark, releases the pin and measures the tilt, with no robots.
  - This is short and has no gait in it, so it is not chaotic.
  - The verdict is the measured side compared with the learner's locked prediction.
  - The robots' pushing stays a browser experience, and its measured end positions only have to be plausible.
- **Walking tasks (triangle build, rescue):** check plausibility on a logged trajectory, sampled at a low rate (each robot's pose and each prop's pose).
  - Each step's speed and turn rate must be within gait limits.
  - There must be no discontinuities (teleports), and props may move only while a robot is in contact or sliding to rest.
  - The final state must satisfy the objective predicate, for example `slotFilled` for all three squares.
  - Optionally, spot-check short windows by re-simulating from a logged state for a fraction of a second, which stays inside the non-chaotic horizon.

## Consequences

- The verifier Lambda does short re-simulations and array checks instead of 80-second replays. The plan's 60 s timeout stays well above p99. The Moments re-sim runs a few seconds of sim with no inference.
- Plausibility is weaker than exact replay: a forged trajectory that respects every limit would pass. It does raise the cost of cheating from editing one number to fabricating a physically consistent trajectory. For a learning game, that is the right trade.
- `verifier/kestrel_verifier/scene.py` and the kit JSON drift test stay. They are how the verifier owns the scene. `verifier/tests` checks that both kits compile from the pinned assets and that a mesh which doesn't match `SHA256SUMS` is refused.
- P4 needs the Lambda base-image check (mujoco 3.11.0 and onnxruntime 1.27.0 have manylinux aarch64 wheels for cp312). It waits for Docker or AWS.
- The triangle's start-jitter failures (4/20) should be fixed separately before the build objective awards server-verified XP.

## Implementation notes

- 2026-11-10, P4c-1: `verifier/kestrel_verifier/walking.py` checks the walking objectives as decided above.
  - The log is 4 Hz `[x, y, yaw°]` per robot and prop since the last reset (`packages/contracts/src/trajectory.ts`).
  - It checks the start against the pinned kit, then gait speed and turn limits (with margins for falls), then prop jumps and props moving with nothing within reach.
  - Then the objective on the final state: all three slots filled; for the rescue, the learner's route followed within its corridor, under the battery, clear of barriers and the other robot.
  - An implausible log is rejected; a plausible one that misses the objective is verified as not met.
  - The margins are first estimates. P4c-2 calibrates them on real browser logs, when the browser starts sending them. The triangle's start-jitter fix (above) comes before the triangle awards verified XP.
