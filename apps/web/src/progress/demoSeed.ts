import { freshProgress, type Progress } from "@kestrel/contracts";
import { need } from "./levels.js";

/** In-memory demo profile at level 3 with no picks (two rewards to choose). Never persisted. */
export const demoSeed = (): Progress => ({
  ...freshProgress(),
  awards: [
    {
      awardId: "demo-seed",
      ruleId: "complete",
      xp: need(3),
      reason: "demo profile",
      triggeredBy: 0,
    },
  ],
});
