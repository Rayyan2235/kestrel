import type { KitId } from "@kestrel/contracts";
import type { SimStatus } from "../simulation/duckSim";
import { balanceSnapshot } from "./agentSession";

export type ObjectiveId = "balance-beam" | "build-triangle" | "rescue-pip";

export type Objective = {
  id: ObjectiveId;
  kit: KitId;
  title: string;
  subject: string;
  xp: number;
  /** What the learner sees once the objective starts. */
  brief: string;
  /** Shown when it is met. */
  win: string;
};

export const OBJECTIVES: Objective[] = [
  {
    id: "balance-beam",
    kit: "moments",
    title: "Balance the beam",
    subject: "Physics",
    xp: 100,
    brief: "The beam tips to the left. Tell Pip and Nova where to put their weights so it balances.",
    win: "Beam balanced: it stays level on its own.",
  },
  {
    id: "build-triangle",
    kit: "pythagoras",
    title: "Build the right triangle",
    subject: "Maths",
    xp: 100,
    brief: "Get all three squares onto the triangle. Does 9 + 16 make 25?",
    win: "Right triangle built: 9 + 16 = 25.",
  },
  {
    id: "rescue-pip",
    kit: "rescue",
    title: "Rescue Pip",
    subject: "Mission",
    xp: 100,
    brief: "Plan a route that gets Pip to its charger.",
    win: "Pip reached its charger.",
  },
];

/** How long the beam must read level before it counts, so a swing through level does not. */
export const LEVEL_HOLD_MS = 1000;

/**
 * The beam is balanced when the plank is free (not held level by its pin),
 * reads level as measured, and nothing is still moving it.
 */
export function beamLevel(status: SimStatus): boolean {
  if (!status.balance || status.task) return false;
  if (status.experiment && status.experiment.phase !== "DONE") return false;
  const b = balanceSnapshot(status.balance);
  return b.plank === "released" && b.lowSide === "level";
}
