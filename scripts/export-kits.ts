// Writes the lab kits the replay verifier builds its scenes from
// (verifier/kits/<id>.json). The verifier never takes a scene from the
// browser; packages/contracts/src/verifier-kits.test.ts fails if these
// files drift from the kits. Run: pnpm exec tsx scripts/export-kits.ts
import { writeFileSync } from "node:fs";
import { KITS, roomProps } from "../packages/contracts/src/lab.js";

export const VERIFIER_KITS = ["pythagoras", "moments"] as const;

export function kitJson(id: (typeof VERIFIER_KITS)[number]): string {
  const kit = KITS[id]();
  // The browser compiles room props ahead of the lesson's (DuckSim.compile).
  const { spawns, slots } = kit;
  return JSON.stringify({ id, spawns, props: [...roomProps(), ...kit.props], slots }, null, 1) + "\n";
}

if (process.argv[1]?.endsWith("export-kits.ts"))
  for (const id of VERIFIER_KITS) writeFileSync(new URL(`../verifier/kits/${id}.json`, import.meta.url), kitJson(id));
