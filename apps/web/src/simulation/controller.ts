import {
  BALANCE_FIXTURE as fixture,
  type BotId,
  type Position,
} from "@kestrel/contracts";

export type ControllerFrame = {
  position: Position;
  headingRad: number;
  phase: "approach" | "dock" | "operate" | "done";
  progress: number;
};
export type Controller = (
  elapsedMs: number,
  start: Position,
  botId: BotId,
) => ControllerFrame;

// Authored kinematic reference; replaceable without transferring world authority.
export const referenceController: Controller = (elapsedMs, start, botId) => {
  const { waypoint, dock } = fixture.bots[botId];
  const points = [start, waypoint, dock];
  const lengths = [distance(start, waypoint), distance(waypoint, dock)];
  const travelMs =
    ((lengths[0] + lengths[1]) / fixture.speedMetersPerSecond) * 1000;
  const duration =
    travelMs + fixture.dockMilliseconds + fixture.operateMilliseconds;
  const progress = Math.min(1, elapsedMs / duration);
  if (elapsedMs < travelMs) {
    let remaining = (elapsedMs * fixture.speedMetersPerSecond) / 1000;
    for (let i = 0; i < 2; i++) {
      if (remaining < lengths[i] && lengths[i] > 0) {
        const a = points[i],
          b = points[i + 1],
          t = remaining / lengths[i];
        return {
          position: [a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t],
          headingRad: Math.atan2(b[0] - a[0], b[2] - a[2]),
          phase: "approach",
          progress,
        };
      }
      remaining -= lengths[i];
    }
  }
  return {
    position: [...dock],
    headingRad: Math.PI,
    progress,
    phase:
      elapsedMs < travelMs + fixture.dockMilliseconds
        ? "dock"
        : elapsedMs < duration
          ? "operate"
          : "done",
  };
};

export function distance(a: Position, b: Position) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}
