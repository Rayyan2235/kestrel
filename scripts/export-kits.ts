// Writes the lab kits the verifier builds its scenes from
// (verifier/kits/<id>.json) and the XP rules it grades with
// (verifier/kits/rules.json). The verifier never takes a scene from the
// browser; packages/contracts/src/verifier-kits.test.ts fails if these
// files drift from contracts. Run: pnpm exec tsx scripts/export-kits.ts
import { writeFileSync } from "node:fs";
import { KITS, MOMENTS, roomProps, UNIT } from "../packages/contracts/src/lab.js";
import { RESCUE, RESCUE_EDGES } from "../packages/contracts/src/rescue.js";
import { GAIT, TRAJECTORY_HZ, TRAJECTORY_MAX_SAMPLES } from "../packages/contracts/src/trajectory.js";
import { LEVEL_DEG, MOMENTS_PROMPTS, OBJECTIVE_LEVEL_DEG, PROMPT_CHALLENGE, XP_RULES } from "../packages/contracts/src/xp.js";

export const VERIFIER_KITS = ["pythagoras", "moments", "rescue"] as const;

export function kitJson(id: (typeof VERIFIER_KITS)[number]): string {
  const kit = KITS[id]();
  // The browser compiles room props ahead of the lesson's (DuckSim.compile).
  const { spawns, slots } = kit;
  return JSON.stringify({ id, spawns, props: [...roomProps(), ...kit.props], slots }, null, 1) + "\n";
}

/** What the verifier grades with: XP amounts, the Moments prompts, the beam thresholds, the rail marks and the walking rules. */
export function rulesJson(): string {
  const rules = {
    xp: XP_RULES,
    promptChallenge: PROMPT_CHALLENGE,
    prompts: MOMENTS_PROMPTS,
    levelDeg: LEVEL_DEG,
    objectiveLevelDeg: OBJECTIVE_LEVEL_DEG,
    markCm: [MOMENTS.minCm, MOMENTS.maxCm],
    // Walking objectives (ADR-003): the log format, the gait's legal range,
    // the slot tolerance, and the rescue map and rules (simulation/tasks.ts).
    walking: {
      hz: TRAJECTORY_HZ,
      maxSamples: TRAJECTORY_MAX_SAMPLES,
      gait: GAIT,
      slotTolerance: UNIT,
      rescue: {
        start: RESCUE.start,
        beacons: Object.fromEntries(Object.entries(RESCUE.beacons).map(([id, b]) => [id, b.at])),
        edges: RESCUE_EDGES,
        barriers: RESCUE.barriers,
        batteryMeters: RESCUE.batteryMeters,
        // tasks.ts: Pip must stop within 0.1 m of each route point, and keep 0.19 m from the other robot.
        waypointM: 0.1,
        otherRobotM: 0.19,
      },
    },
  };
  return JSON.stringify(rules, null, 1) + "\n";
}

if (process.argv[1]?.endsWith("export-kits.ts")) {
  for (const id of VERIFIER_KITS) writeFileSync(new URL(`../verifier/kits/${id}.json`, import.meta.url), kitJson(id));
  writeFileSync(new URL("../verifier/kits/rules.json", import.meta.url), rulesJson());
}
