// Writes the lab kits the verifier builds its scenes from
// (verifier/kits/<id>.json) and the XP rules it grades with
// (verifier/kits/rules.json). The verifier never takes a scene from the
// browser; packages/contracts/src/verifier-kits.test.ts fails if these
// files drift from contracts. Run: pnpm exec tsx scripts/export-kits.ts
import { writeFileSync } from "node:fs";
import { KITS, MOMENTS, roomProps } from "../packages/contracts/src/lab.js";
import { LEVEL_DEG, MOMENTS_PROMPTS, OBJECTIVE_LEVEL_DEG, PROMPT_CHALLENGE, XP_RULES } from "../packages/contracts/src/xp.js";

export const VERIFIER_KITS = ["pythagoras", "moments"] as const;

export function kitJson(id: (typeof VERIFIER_KITS)[number]): string {
  const kit = KITS[id]();
  // The browser compiles room props ahead of the lesson's (DuckSim.compile).
  const { spawns, slots } = kit;
  return JSON.stringify({ id, spawns, props: [...roomProps(), ...kit.props], slots }, null, 1) + "\n";
}

/** What the verifier grades with: XP amounts, the Moments prompts, the beam thresholds and the rail marks. */
export function rulesJson(): string {
  const rules = {
    xp: XP_RULES,
    promptChallenge: PROMPT_CHALLENGE,
    prompts: MOMENTS_PROMPTS,
    levelDeg: LEVEL_DEG,
    objectiveLevelDeg: OBJECTIVE_LEVEL_DEG,
    markCm: [MOMENTS.minCm, MOMENTS.maxCm],
  };
  return JSON.stringify(rules, null, 1) + "\n";
}

if (process.argv[1]?.endsWith("export-kits.ts")) {
  for (const id of VERIFIER_KITS) writeFileSync(new URL(`../verifier/kits/${id}.json`, import.meta.url), kitJson(id));
  writeFileSync(new URL("../verifier/kits/rules.json", import.meta.url), rulesJson());
}
