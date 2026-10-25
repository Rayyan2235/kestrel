import { MOMENTS, type DuckTask } from "@kestrel/contracts";

export type CrewLine = { id: number; from: "pip" | "nova" | "crew"; text: string; ok?: boolean };

/** Tasks that put both robots to work on one plan. */
export const CREW_TASKS = new Set<DuckTask["kind"]>(["set_balance", "build_squares"]);

/**
 * What Pip tells Nova when a task needs Nova. The words follow the simulator's
 * own plan: in set_balance each robot moves its own weight; in build_squares
 * Pip pushes the 5×5 and Nova the 4×4 together, then Pip brings the 3×3.
 */
export function handoffLine(task: DuckTask): string | null {
  switch (task.kind) {
    case "set_balance":
      return `Nova, move the 100 g weight to ${task.right_cm} cm. I'll take the 200 g to ${task.left_cm} cm, then we let go of the plank.`;
    case "build_squares":
      return "Nova, push the 4×4 square onto the triangle while I push the 5×5. Then I'll bring the 3×3.";
    case "place_weight":
      return MOMENTS.weights.find((w) => w.id === task.target)?.owner === "nova"
        ? `Nova, your weight: move the ${MOMENTS.weights.find((w) => w.id === task.target)!.grams} g to ${task.cm} cm.`
        : null;
    default:
      return null;
  }
}
