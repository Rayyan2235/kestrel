import { MOMENTS, type KitId, type ObjectiveId } from "@kestrel/contracts";
import type { SimStatus } from "../simulation/duckSim";
import { balanceSnapshot } from "./agentSession";

export type { ObjectiveId };

type Objective = {
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
    win: "Beam balanced: it stays within 1.5° of level on its own.",
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

/** Total XP: each earned objective counts once. */
export const xpOf = (earned: ReadonlySet<ObjectiveId>): number =>
  OBJECTIVES.reduce((sum, o) => sum + (earned.has(o.id) ? o.xp : 0), 0);

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

/**
 * How far from level still counts for the objective. The beam is stiff and
 * sensitive (about 0.5° per millimetre on the 200 g weight), so a real push
 * that lands 1–2 mm off its mark must still count. "Level" itself stays < 0.5°.
 */
export const OBJECTIVE_LEVEL_DEG = 1.5;

/** Like beamLevel, but within the objective's tolerance. */
export function beamBalanced(status: SimStatus): boolean {
  if (!status.balance || status.task) return false;
  if (status.experiment && status.experiment.phase !== "DONE") return false;
  const b = balanceSnapshot(status.balance);
  return b.plank === "released" && b.tiltDeg <= OBJECTIVE_LEVEL_DEG;
}

/** Hints only when the 200 g weight is within this many cm of its balance point. */
const HINT_RANGE_CM = 3;
const cm1 = (cm: number) => (Math.round(cm * 10) / 10).toFixed(1);

/**
 * A nudge for a released beam that is close to balanced but not yet within
 * tolerance, from the measured positions: equal moments put the left weight at
 * (right grams × right cm) / left grams. Null when there is nothing useful to say.
 */
export function balanceHint(status: SimStatus): string | null {
  if (!status.balance || status.task || beamBalanced(status)) return null;
  if (status.experiment && status.experiment.phase !== "DONE") return null;
  const b = balanceSnapshot(status.balance);
  if (b.plank !== "released") return null;
  const left = MOMENTS.weights.find((w) => w.side === "left")!;
  const right = MOMENTS.weights.find((w) => w.side === "right")!;
  const l = status.balance.rails.get(left.id);
  const r = status.balance.rails.get(right.id);
  if (l === undefined || r === undefined) return null;
  const lCm = Math.abs(l) * 100;
  const rCm = Math.abs(r) * 100;
  const off = lCm - (right.grams * rCm) / left.grams;
  if (Math.abs(off) > HINT_RANGE_CM || Math.abs(off) < 0.05) return null;
  const hint = `${left.grams} g is ${cm1(Math.abs(off))} cm too far ${off > 0 ? "out" : "in"}`;
  const rWanted = (left.grams * lCm) / right.grams;
  return rWanted >= MOMENTS.minCm && rWanted <= MOMENTS.maxCm
    ? `${hint} (or move the ${right.grams} g to ${cm1(rWanted)} cm).`
    : `${hint}.`;
}
